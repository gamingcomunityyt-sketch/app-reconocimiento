"""Nucleo de vision extraido de app.py para el servicio de reconocimiento.

Analisis en profundidad para objetos con marco similar (p. ej. cartas):
- geometria (ORB + RANSAC + calidad del cuadrilatero)
- dispersion espacial de inliers (evita matches solo en el borde)
- color global + color de la zona de arte (centro)
- correlacion de apariencia (NCC) tras alinear
"""

from __future__ import annotations

from dataclasses import dataclass, field
from io import BytesIO
from typing import Optional, Sequence, Tuple

import cv2
import numpy as np
from PIL import Image, ImageOps

MAX_DIMENSION = 1100
VERDICT_RANK = {"MATCH": 2, "AMBIGUOUS": 1, "NO MATCH": 0}

# Zona central usada como "arte" (excluye marco tipico de cartas).
ART_MARGIN = 0.18
# Minimo de cuadrantes con inliers para aceptar un MATCH (de 4).
MIN_SPREAD_QUADRANTS = 3
MIN_SPREAD_COVERAGE = 0.28


@dataclass
class FeatureSet:
    label: str
    image: np.ndarray
    keypoints: Sequence = field(default_factory=tuple)
    descriptors: Optional[np.ndarray] = None

    @property
    def count(self) -> int:
        return len(self.keypoints)


@dataclass
class MatchResult:
    label: str
    keypoints_ref: int
    keypoints_test: int
    good_matches: int
    inliers: int
    inlier_ratio: float
    score: float
    verdict: str
    message: str
    plausible: bool = False
    color_similarity: float = 0.0
    art_similarity: float = 0.0
    appearance: float = 0.0
    spread: float = 0.0

    @property
    def sort_key(self) -> Tuple[int, float, int]:
        return (VERDICT_RANK[self.verdict], self.score, self.inliers)


def decode_image(file_bytes: bytes) -> Optional[np.ndarray]:
    try:
        with Image.open(BytesIO(file_bytes)) as handle:
            oriented = ImageOps.exif_transpose(handle).convert("RGB")
            return np.ascontiguousarray(np.asarray(oriented)[:, :, ::-1])
    except Exception:
        buffer = np.frombuffer(file_bytes, dtype=np.uint8)
        return cv2.imdecode(buffer, cv2.IMREAD_COLOR)


def resize_to_limit(image: np.ndarray, limit: int = MAX_DIMENSION) -> np.ndarray:
    height, width = image.shape[:2]
    longest = max(height, width)
    if longest <= limit:
        return image
    factor = limit / longest
    new_size = (int(round(width * factor)), int(round(height * factor)))
    return cv2.resize(image, new_size, interpolation=cv2.INTER_AREA)


def preprocess(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    equalized = clahe.apply(gray)
    # Suavizado leve reduce ruido de JPEG de camara movil sin matar textura.
    return cv2.GaussianBlur(equalized, (3, 3), 0)


def build_detector(algorithm: str, max_features: int):
    if algorithm == "SIFT":
        if not hasattr(cv2, "SIFT_create"):
            raise RuntimeError(
                "Esta build de OpenCV no incluye SIFT. Usa ORB o instala opencv-contrib-python."
            )
        return cv2.SIFT_create(nfeatures=max_features)
    return cv2.ORB_create(
        nfeatures=max_features,
        scaleFactor=1.2,
        nlevels=10,
        edgeThreshold=15,
        patchSize=31,
        fastThreshold=12,
    )


def build_matcher(algorithm: str) -> cv2.BFMatcher:
    norm = cv2.NORM_HAMMING if algorithm == "ORB" else cv2.NORM_L2
    return cv2.BFMatcher(norm, crossCheck=False)


def extract_features(label: str, image: np.ndarray, detector) -> FeatureSet:
    normalized = resize_to_limit(image)
    keypoints, descriptors = detector.detectAndCompute(preprocess(normalized), None)
    return FeatureSet(
        label=label,
        image=normalized,
        keypoints=keypoints or tuple(),
        descriptors=descriptors,
    )


def _quad_metrics(corners: np.ndarray) -> tuple[float, float, float]:
    """Devuelve (aspect_ratio, min_angle_cos_abs, area_ratio_vs_bbox)."""
    pts = corners.reshape(4, 2)
    # Ordenar por angulo alrededor del centro para medir lados consecutivos.
    center = pts.mean(axis=0)
    order = np.argsort(np.arctan2(pts[:, 1] - center[1], pts[:, 0] - center[0]))
    ordered = pts[order]

    edges = [np.linalg.norm(ordered[(i + 1) % 4] - ordered[i]) for i in range(4)]
    if min(edges) < 1e-3:
        return 0.0, 1.0, 0.0

    widths = (edges[0] + edges[2]) / 2.0
    heights = (edges[1] + edges[3]) / 2.0
    aspect = widths / max(heights, 1e-6)
    if aspect < 1.0:
        aspect = 1.0 / aspect

    cosines = []
    for i in range(4):
        v1 = ordered[i] - ordered[(i - 1) % 4]
        v2 = ordered[(i + 1) % 4] - ordered[i]
        n1 = np.linalg.norm(v1)
        n2 = np.linalg.norm(v2)
        if n1 < 1e-6 or n2 < 1e-6:
            cosines.append(1.0)
            continue
        cosines.append(abs(float(np.dot(v1, v2) / (n1 * n2))))

    area = abs(
        0.5
        * sum(
            ordered[i, 0] * ordered[(i + 1) % 4, 1]
            - ordered[(i + 1) % 4, 0] * ordered[i, 1]
            for i in range(4)
        )
    )
    bbox_area = max(
        (pts[:, 0].max() - pts[:, 0].min()) * (pts[:, 1].max() - pts[:, 1].min()),
        1.0,
    )
    return float(aspect), float(max(cosines)), float(area / bbox_area)


def homography_is_plausible(
    homography: Optional[np.ndarray],
    reference_shape: tuple[int, ...],
) -> bool:
    if homography is None:
        return False
    determinant = float(np.linalg.det(homography[:2, :2]))
    if not np.isfinite(determinant) or abs(determinant) <= 1e-8:
        return False
    if not (0.015 < abs(determinant) < 80.0):
        return False

    height, width = reference_shape[:2]
    corners = np.float32(
        [[0, 0], [0, height - 1], [width - 1, height - 1], [width - 1, 0]]
    ).reshape(-1, 1, 2)
    try:
        projected = cv2.perspectiveTransform(corners, homography)
    except cv2.error:
        return False

    if not np.isfinite(projected).all():
        return False

    aspect, max_cos, area_fill = _quad_metrics(projected)
    # Rechaza rombos extremos, colapsos y cuadrilateros auto-intersectados.
    if aspect > 4.5 or max_cos > 0.92 or area_fill < 0.45:
        return False
    return True


def inlier_spatial_spread(
    reference_keypoints: Sequence,
    good_matches: Sequence,
    inlier_mask: np.ndarray,
    reference_shape: tuple[int, ...],
) -> float:
    """0-1: que tan bien cubren los inliers la superficie de la referencia.

    Matches solo en el marco tipico dan cobertura baja y pocos cuadrantes.
    """
    indices = np.flatnonzero(inlier_mask)
    if len(indices) < 4:
        return 0.0

    height, width = reference_shape[:2]
    pts = np.float32(
        [reference_keypoints[good_matches[i].queryIdx].pt for i in indices]
    )
    x0, y0 = pts[:, 0].min(), pts[:, 1].min()
    x1, y1 = pts[:, 0].max(), pts[:, 1].max()
    coverage = ((x1 - x0) * (y1 - y0)) / float(max(width * height, 1))

    mid_x, mid_y = width / 2.0, height / 2.0
    quadrants = {
        (px < mid_x, py < mid_y) for px, py in pts
    }
    quadrant_score = len(quadrants) / 4.0

    # Penaliza si casi todos los puntos estan en el borde exterior.
    margin_x, margin_y = width * ART_MARGIN, height * ART_MARGIN
    interior = np.sum(
        (pts[:, 0] > margin_x)
        & (pts[:, 0] < width - margin_x)
        & (pts[:, 1] > margin_y)
        & (pts[:, 1] < height - margin_y)
    )
    interior_ratio = interior / float(len(pts))

    return round(
        float(
            0.40 * min(1.0, coverage / 0.55)
            + 0.35 * quadrant_score
            + 0.25 * interior_ratio
        ),
        3,
    )


def _art_roi(shape: tuple[int, ...]) -> tuple[int, int, int, int]:
    height, width = shape[:2]
    x0 = int(width * ART_MARGIN)
    y0 = int(height * ART_MARGIN)
    x1 = int(width * (1.0 - ART_MARGIN))
    y1 = int(height * (1.0 - ART_MARGIN))
    return x0, y0, max(x1, x0 + 1), max(y1, y0 + 1)


def _histogram_similarity(
    image_a: np.ndarray,
    image_b: np.ndarray,
    mask: Optional[np.ndarray] = None,
) -> float:
    if mask is not None and int(mask.sum()) < 400:
        return 0.0

    hsv_a = cv2.cvtColor(image_a, cv2.COLOR_BGR2HSV)
    hsv_b = cv2.cvtColor(image_b, cv2.COLOR_BGR2HSV)
    # H+S: tono y saturacion (independiente de luz).
    hist_a = cv2.calcHist([hsv_a], [0, 1], mask, [36, 48], [0, 180, 0, 256])
    hist_b = cv2.calcHist([hsv_b], [0, 1], mask, [36, 48], [0, 180, 0, 256])
    cv2.normalize(hist_a, hist_a)
    cv2.normalize(hist_b, hist_b)
    distance = cv2.compareHist(hist_a, hist_b, cv2.HISTCMP_BHATTACHARYYA)
    return max(0.0, 1.0 - float(distance))


def color_similarity(
    reference: np.ndarray,
    test: np.ndarray,
    homography: np.ndarray,
) -> tuple[float, float]:
    """Similitud cromatica global y de zona de arte (0-1 cada una)."""
    height, width = test.shape[:2]
    warped = cv2.warpPerspective(reference, homography, (width, height))
    # OpenCV 4.14+ exige uint8 en calcHist; un array bool provoca error 500.
    mask = (cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY) > 12).astype(np.uint8)
    global_sim = _histogram_similarity(warped, test, mask)

    x0, y0, x1, y1 = _art_roi(warped.shape)
    art_mask = mask[y0:y1, x0:x1]
    art_sim = _histogram_similarity(
        warped[y0:y1, x0:x1],
        test[y0:y1, x0:x1],
        art_mask,
    )
    return round(global_sim, 3), round(art_sim, 3)


def appearance_similarity(
    reference: np.ndarray,
    test: np.ndarray,
    homography: np.ndarray,
) -> float:
    """Correlacion normalizada en la zona de arte tras alinear (0-1)."""
    height, width = test.shape[:2]
    warped = cv2.warpPerspective(reference, homography, (width, height))
    x0, y0, x1, y1 = _art_roi(warped.shape)

    gray_w = cv2.cvtColor(warped[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY).astype(np.float32)
    gray_t = cv2.cvtColor(test[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY).astype(np.float32)
    valid = gray_w > 12
    if int(valid.sum()) < 400:
        return 0.0

    a = gray_w[valid]
    b = gray_t[valid]
    a = a - a.mean()
    b = b - b.mean()
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom < 1e-6:
        return 0.0
    corr = float(np.dot(a, b) / denom)
    # Mapea [-1,1] -> [0,1], saturando negativos a 0 (anti-correlacion = distinto).
    return round(max(0.0, corr), 3)


def compare_feature_sets(
    reference: FeatureSet,
    test: FeatureSet,
    algorithm: str = "ORB",
    ratio_threshold: float = 0.68,
    ransac_threshold: float = 4.5,
    min_inliers_match: int = 45,
    min_inliers_ambiguous: int = 18,
    min_inlier_ratio_match: float = 0.52,
    min_color_similarity_match: float = 0.70,
    min_art_similarity_match: float = 0.68,
    min_appearance_match: float = 0.42,
    min_spread_match: float = 0.45,
    min_score_match: float = 62.0,
) -> MatchResult:
    result = MatchResult(
        label=reference.label,
        keypoints_ref=reference.count,
        keypoints_test=test.count,
        good_matches=0,
        inliers=0,
        inlier_ratio=0.0,
        score=0.0,
        verdict="NO MATCH",
        message="No se han podido extraer suficientes features de una de las imagenes.",
    )

    if (
        reference.descriptors is None
        or test.descriptors is None
        or reference.count < 2
        or test.count < 2
    ):
        return result

    matcher = build_matcher(algorithm)
    knn_matches = matcher.knnMatch(reference.descriptors, test.descriptors, k=2)

    good_matches = [
        pair[0]
        for pair in knn_matches
        if len(pair) == 2 and pair[0].distance < ratio_threshold * pair[1].distance
    ]
    result.good_matches = len(good_matches)

    if len(good_matches) < 4:
        result.message = (
            "Menos de 4 correspondencias validas: no hay evidencia para estimar la geometria."
        )
        return result

    src = np.float32(
        [reference.keypoints[m.queryIdx].pt for m in good_matches]
    ).reshape(-1, 1, 2)
    dst = np.float32([test.keypoints[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    homography, mask = cv2.findHomography(
        src, dst, cv2.RANSAC, ransac_threshold, maxIters=8000, confidence=0.995
    )

    inlier_mask = (
        mask.ravel().astype(bool) if mask is not None else np.zeros(len(good_matches), bool)
    )
    inliers = int(inlier_mask.sum())
    inlier_ratio = inliers / len(good_matches)
    plausible = homography_is_plausible(homography, reference.image.shape)
    spread = inlier_spatial_spread(
        reference.keypoints, good_matches, inlier_mask, reference.image.shape
    )

    color_sim = 0.0
    art_sim = 0.0
    appearance = 0.0
    if plausible and homography is not None:
        color_sim, art_sim = color_similarity(reference.image, test.image, homography)
        appearance = appearance_similarity(reference.image, test.image, homography)

    # Parecido visual combinado: prioriza el arte interior frente al marco.
    visual = round(0.30 * color_sim + 0.45 * art_sim + 0.25 * appearance, 3)

    evidence = min(1.0, inliers / float(min_inliers_match))
    coverage = inliers / max(1, min(reference.count, test.count))
    geometric = 100.0 * (
        0.45 * inlier_ratio
        + 0.30 * evidence
        + 0.15 * min(1.0, coverage * 5)
        + 0.10 * spread
    )
    if not plausible:
        geometric *= 0.35

    score = geometric * (0.45 + 0.55 * visual)

    geometric_match = (
        plausible
        and inliers >= min_inliers_match
        and inlier_ratio >= min_inlier_ratio_match
        and spread >= min_spread_match
    )
    color_ok = color_sim >= min_color_similarity_match
    art_ok = art_sim >= min_art_similarity_match
    appearance_ok = appearance >= min_appearance_match
    visual_ok = color_ok and art_ok and appearance_ok
    score_ok = score >= min_score_match

    if geometric_match and visual_ok and score_ok:
        verdict = "MATCH"
        message = "Geometria, arte interior y color consistentes: mismo objeto."
    elif geometric_match and (not art_ok or not appearance_ok):
        verdict = "NO MATCH"
        message = (
            "El marco encaja pero el arte interior no coincide. "
            "Probablemente es otro objeto del mismo tipo."
        )
        score *= 0.30
    elif geometric_match and not color_ok:
        verdict = "NO MATCH"
        message = (
            "La forma encaja pero el color no coincide. "
            "Probablemente es un objeto distinto con el mismo tipo de marco."
        )
        score *= 0.35
    elif geometric_match and not score_ok:
        verdict = "AMBIGUOUS"
        message = (
            "Casi encaja, pero la puntuacion no es concluyente. "
            "Acercate y centra bien el objeto."
        )
    elif (
        inliers >= min_inliers_ambiguous
        and score >= 50.0
        and (plausible or spread >= 0.35)
    ):
        verdict = "AMBIGUOUS"
        message = (
            "Hay coincidencias parciales, pero la evidencia no es concluyente. "
            "Repite con mejor enfoque, luz o encuadre."
        )
    else:
        verdict = "NO MATCH"
        message = "No hay estructura comun suficiente: objetos distintos."

    result.inliers = inliers
    result.inlier_ratio = inlier_ratio
    result.score = round(score, 1)
    result.verdict = verdict
    result.message = message
    result.plausible = plausible
    result.color_similarity = visual  # exposicion combinada hacia el cliente
    result.art_similarity = art_sim
    result.appearance = appearance
    result.spread = spread
    return result


def _apply_relative_margin(
    results: list[MatchResult],
    score_margin: float = 10.0,
) -> None:
    """Si dos MATCH estan demasiado cerca, degrada a AMBIGUOUS (empate)."""
    matches = [item for item in results if item.verdict == "MATCH"]
    if len(matches) < 2:
        return
    matches.sort(key=lambda item: item.score, reverse=True)
    leader, runner = matches[0], matches[1]
    if leader.score - runner.score < score_margin:
        for item in matches:
            item.verdict = "AMBIGUOUS"
            item.message = (
                "Varios objetos encajan de forma similar. "
                "El sistema no puede decidir con seguridad."
            )


def match_scan_against_references(
    scan_bytes: bytes,
    references: list[tuple[str, bytes]],
    *,
    algorithm: str = "ORB",
    max_features: int = 3500,
    ratio_threshold: float = 0.68,
    ransac_threshold: float = 4.5,
    min_inliers_match: int = 45,
    min_inliers_ambiguous: int = 18,
    min_inlier_ratio_match: float = 0.52,
    min_color_similarity_match: float = 0.70,
    min_art_similarity_match: float = 0.68,
    min_appearance_match: float = 0.42,
    min_spread_match: float = 0.45,
    min_score_match: float = 62.0,
    score_margin: float = 10.0,
) -> tuple[list[MatchResult], int]:
    scan_image = decode_image(scan_bytes)
    if scan_image is None:
        raise ValueError("scan_undecodable")

    detector = build_detector(algorithm, max_features)
    test_features = extract_features("escaneo", scan_image, detector)
    if test_features.count < 2:
        raise ValueError("scan_low_texture")

    comparison_args = dict(
        algorithm=algorithm,
        ratio_threshold=ratio_threshold,
        ransac_threshold=ransac_threshold,
        min_inliers_match=min_inliers_match,
        min_inliers_ambiguous=min_inliers_ambiguous,
        min_inlier_ratio_match=min_inlier_ratio_match,
        min_color_similarity_match=min_color_similarity_match,
        min_art_similarity_match=min_art_similarity_match,
        min_appearance_match=min_appearance_match,
        min_spread_match=min_spread_match,
        min_score_match=min_score_match,
    )

    results: list[MatchResult] = []
    for candidate_id, reference_bytes in references:
        reference_image = decode_image(reference_bytes)
        if reference_image is None:
            continue
        reference_features = extract_features(candidate_id, reference_image, detector)
        results.append(
            compare_feature_sets(reference_features, test_features, **comparison_args)
        )

    _apply_relative_margin(results, score_margin=score_margin)
    results.sort(key=lambda item: item.sort_key, reverse=True)
    return results, test_features.count

