# -*- coding: utf-8 -*-
"""FastAPI router para integrar el motor V10.7 en una web existente."""

import asyncio
import base64
import json
import os
from collections import OrderedDict
from io import BytesIO
from typing import Optional
from urllib.parse import urlparse

import cv2
import httpx
import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .engine import (
    ReferenceRecord,
    VisionEngine,
    crop_to_box,
    decode_image,
    image_array_digest,
    prepare_reference_identity,
    suggest_reference_box_at_intent,
)

router = APIRouter(prefix="/api/vision", tags=["vision"])
engine = VisionEngine()

MAX_SCAN_BYTES = int(os.getenv("VISION_MAX_SCAN_BYTES", "4400000"))
MAX_REFERENCE_BYTES = int(os.getenv("VISION_MAX_REFERENCE_BYTES", "4000000"))
MAX_REFERENCES = int(os.getenv("VISION_MAX_REFERENCES", "50"))
FETCH_TIMEOUT = float(os.getenv("VISION_FETCH_TIMEOUT_SECONDS", "8"))
IMAGE_CACHE_SIZE = int(os.getenv("VISION_IMAGE_CACHE_SIZE", "80"))
ALLOWED_IMAGE_HOSTS = {
    host.strip().lower()
    for host in os.getenv("VISION_ALLOWED_IMAGE_HOSTS", "").split(",")
    if host.strip()
}

_image_cache: "OrderedDict[str, np.ndarray]" = OrderedDict()


class ReferenceManifest(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    name: str = Field(default="Referencia", max_length=200)
    memory_id: Optional[str] = Field(default=None, max_length=300)
    image_url: Optional[str] = None
    image_base64: Optional[str] = None


def _normalized_box(box, shape):
    h, w = shape[:2]
    return {
        "x1": round(box[0] / max(1, w), 6),
        "y1": round(box[1] / max(1, h), 6),
        "x2": round(box[2] / max(1, w), 6),
        "y2": round(box[3] / max(1, h), 6),
    }


def _parse_crop_json(crop_json: Optional[str], image: np.ndarray):
    if not crop_json:
        return None
    try:
        obj = json.loads(crop_json)
        h, w = image.shape[:2]
        x1 = int(round(float(obj["x1"]) * w))
        y1 = int(round(float(obj["y1"]) * h))
        x2 = int(round(float(obj["x2"]) * w))
        y2 = int(round(float(obj["y2"]) * h))
        x1, x2 = sorted((max(0, min(w - 1, x1)), max(1, min(w, x2))))
        y1, y2 = sorted((max(0, min(h - 1, y1)), max(1, min(h, y2))))
        if x2 - x1 < 24 or y2 - y1 < 24:
            raise ValueError("crop demasiado pequeno")
        return (x1, y1, x2, y2)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"crop_json invalido: {exc}") from exc


def _decode_uploaded(data: bytes, label: str) -> np.ndarray:
    image = decode_image(data)
    if image is None:
        raise HTTPException(status_code=400, detail=f"No se pudo decodificar {label}.")
    return image


def _url_allowed(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in ("https", "http") or not parsed.hostname:
        return False
    if not ALLOWED_IMAGE_HOSTS:
        return True
    host = parsed.hostname.lower()
    return host in ALLOWED_IMAGE_HOSTS or any(host.endswith("." + allowed) for allowed in ALLOWED_IMAGE_HOSTS)


async def _fetch_reference_image(item: ReferenceManifest) -> np.ndarray:
    if item.image_base64:
        try:
            raw = base64.b64decode(item.image_base64, validate=True)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Base64 invalido en {item.name}") from exc
        if len(raw) > MAX_REFERENCE_BYTES:
            raise HTTPException(status_code=413, detail=f"Referencia {item.name} demasiado grande.")
        return _decode_uploaded(raw, f"referencia {item.name}")

    if not item.image_url:
        raise HTTPException(status_code=400, detail=f"La referencia {item.name} no tiene image_url ni image_base64.")
    if not _url_allowed(item.image_url):
        raise HTTPException(status_code=400, detail=f"Host de imagen no permitido para {item.name}.")

    cached = _image_cache.get(item.image_url)
    if cached is not None:
        _image_cache.move_to_end(item.image_url)
        return cached

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=FETCH_TIMEOUT) as client:
            async with client.stream("GET", item.image_url) as response:
                response.raise_for_status()
                chunks = []
                size = 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > MAX_REFERENCE_BYTES:
                        raise HTTPException(status_code=413, detail=f"Referencia {item.name} demasiado grande.")
                    chunks.append(chunk)
        image = _decode_uploaded(b"".join(chunks), f"referencia {item.name}")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo descargar {item.name}: {exc}") from exc

    _image_cache[item.image_url] = image
    _image_cache.move_to_end(item.image_url)
    while len(_image_cache) > IMAGE_CACHE_SIZE:
        _image_cache.popitem(last=False)
    return image


@router.get("/health")
def health():
    return {
        "ok": True,
        "engine": "10.7-web",
        "opencv": cv2.__version__,
        "sift_available": hasattr(cv2, "SIFT_create"),
    }


@router.post("/suggest-crop")
async def suggest_crop(
    image: UploadFile = File(...),
    intent_x: float = Form(0.5),
    intent_y: float = Form(0.5),
):
    raw = await image.read()
    if len(raw) > MAX_SCAN_BYTES:
        raise HTTPException(status_code=413, detail="Imagen demasiado grande para la Function.")
    decoded = _decode_uploaded(raw, "imagen de registro")
    point = (float(np.clip(intent_x, 0.0, 1.0)), float(np.clip(intent_y, 0.0, 1.0)))
    box, note = await run_in_threadpool(suggest_reference_box_at_intent, decoded, point)
    return {
        "box": _normalized_box(box, decoded.shape),
        "note": note,
        "image_width": decoded.shape[1],
        "image_height": decoded.shape[0],
    }


@router.post("/prepare-reference")
async def prepare_reference(
    image: UploadFile = File(...),
    crop_json: Optional[str] = Form(None),
    intent_x: float = Form(0.5),
    intent_y: float = Form(0.5),
    correct_perspective: bool = Form(False),
    jpeg_quality: int = Form(90),
):
    raw = await image.read()
    if len(raw) > MAX_SCAN_BYTES:
        raise HTTPException(status_code=413, detail="Imagen demasiado grande para la Function.")
    decoded = _decode_uploaded(raw, "imagen de registro")

    box = _parse_crop_json(crop_json, decoded)
    mode = "Recorte manual confirmado por la web"
    if box is None:
        point = (float(np.clip(intent_x, 0.0, 1.0)), float(np.clip(intent_y, 0.0, 1.0)))
        box, note = await run_in_threadpool(suggest_reference_box_at_intent, decoded, point)
        mode = "Recorte automatico confirmado: " + note

    selected = crop_to_box(decoded, box)
    prepared, applied, prep_ms = await run_in_threadpool(
        prepare_reference_identity, selected, bool(correct_perspective), mode
    )

    quality = int(np.clip(jpeg_quality, 70, 95))
    ok, encoded = cv2.imencode(".jpg", prepared, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise HTTPException(status_code=500, detail="No se pudo codificar la referencia preparada.")
    payload = encoded.tobytes()
    return {
        "reference_id_suggestion": "ref_" + image_array_digest(prepared),
        "crop": _normalized_box(box, decoded.shape),
        "preparation": applied,
        "prep_ms": round(prep_ms, 1),
        "width": prepared.shape[1],
        "height": prepared.shape[0],
        "mime_type": "image/jpeg",
        "prepared_image_base64": base64.b64encode(payload).decode("ascii"),
    }


@router.post("/scan")
async def scan(
    image: UploadFile = File(...),
    references_json: str = Form(...),
    reticle_x: float = Form(0.5),
    reticle_y: float = Form(0.5),
    algorithm: str = Form("ORB"),
    max_features: int = Form(2000),
    ratio_threshold: float = Form(0.75),
    ransac_threshold: float = Form(5.0),
    min_inliers_match: int = Form(25),
    min_inliers_ambiguous: int = Form(12),
):
    raw = await image.read()
    if len(raw) > MAX_SCAN_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Escaneo demasiado grande. Comprime la captura sin perder demasiado detalle.",
        )
    scan_image = _decode_uploaded(raw, "escaneo")

    try:
        raw_manifest = json.loads(references_json)
        manifest = [ReferenceManifest.model_validate(item) for item in raw_manifest]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"references_json invalido: {exc}") from exc

    if not manifest:
        raise HTTPException(status_code=400, detail="No hay referencias registradas.")
    if len(manifest) > MAX_REFERENCES:
        raise HTTPException(status_code=400, detail=f"Maximo temporal: {MAX_REFERENCES} referencias por escaneo.")
    ids = [r.id for r in manifest]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=400, detail="Los IDs de referencia deben ser unicos.")

    images = await asyncio.gather(*[_fetch_reference_image(item) for item in manifest])
    records = [
        ReferenceRecord(
            reference_id=item.id,
            name=item.name,
            memory_id=item.memory_id,
            image=ref_image,
            image_url=item.image_url,
        )
        for item, ref_image in zip(manifest, images)
    ]

    h, w = scan_image.shape[:2]
    reticle_point = (
        float(np.clip(reticle_x, 0.0, 1.0)) * w,
        float(np.clip(reticle_y, 0.0, 1.0)) * h,
    )
    algo = algorithm.upper().strip()
    if algo not in ("ORB", "SIFT"):
        raise HTTPException(status_code=400, detail="algorithm debe ser ORB o SIFT.")

    try:
        result = await run_in_threadpool(
            engine.analyze,
            scan_image,
            records,
            reticle_point,
            algo,
            int(np.clip(max_features, 500, 5000)),
            float(np.clip(ratio_threshold, 0.5, 0.9)),
            float(np.clip(ransac_threshold, 1.0, 10.0)),
            int(np.clip(min_inliers_match, 10, 80)),
            int(np.clip(min_inliers_ambiguous, 4, 40)),
            "scan",
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Fallo del motor de reconocimiento: {exc}") from exc
