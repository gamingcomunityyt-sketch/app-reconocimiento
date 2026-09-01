# -*- coding: utf-8 -*-
"""Motor de reconocimiento extraido de app_experimental_v10_7.py.

Las funciones matematicas/visuales se copian de V10.7. La unica adaptacion es
la capa de estado: aqui no existe Streamlit; las referencias llegan como datos
del backend/web y se cachean solo mientras la instancia de servidor siga viva.
"""

import hashlib
from dataclasses import dataclass, field
from io import BytesIO
from time import perf_counter
from typing import Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np
from PIL import Image, ImageOps

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pillow_heif = None

MAX_DIMENSION = 1000
RENDER_WIDTH = 1200
THUMBNAIL_DIMENSION = 180
VERDICT_RANK = {"MATCH": 3, "AMBIGUOUS": 2, "REPETIR FOTO": 1, "NO MATCH": 0}
UPLOAD_TYPES = ["jpg", "jpeg", "png", "webp", "bmp", "heic"]


@dataclass
class FeatureSet:
    """Imagen normalizada junto con sus keypoints y descriptores."""

    label: str
    image: np.ndarray
    keypoints: Sequence = field(default_factory=tuple)
    descriptors: Optional[np.ndarray] = None
    view_image: Optional[np.ndarray] = None
    view_box: Optional[Tuple[int, int, int, int]] = None
    intent_point: Optional[Tuple[float, float]] = None

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
    visualization: Optional[np.ndarray] = None
    spatial_coverage: float = 0.0
    internal_distribution: float = 0.0
    shape_spread: float = 0.0
    intent_ok: bool = False
    localized: bool = False
    localization_note: str = "Sin localizacion por matches"
    geometry_model: str = "Sin modelo"
    reference_box: Optional[Tuple[int, int, int, int]] = None
    test_box: Optional[Tuple[int, int, int, int]] = None
    search_scale: str = "1.00x"
    foreground_ratio: float = 0.0
    search_method: str = "Imagen completa"
    aim_score: float = 0.0
    target_score: float = 0.0
    target_distance: float = 1.0
    role: str = "RECHAZADO"
    detected_box: Optional[Tuple[int, int, int, int]] = None

    @property
    def sort_key(self) -> Tuple[int, float, float, int]:
        return (
            VERDICT_RANK[self.verdict],
            self.target_score,
            self.score,
            self.inliers,
        )


def decode_image(file_bytes: bytes) -> Optional[np.ndarray]:
    """Decodifica a BGR respetando la orientacion EXIF."""
    try:
        with Image.open(BytesIO(file_bytes)) as handle:
            oriented = ImageOps.exif_transpose(handle).convert("RGB")
            return np.ascontiguousarray(np.asarray(oriented)[:, :, ::-1])
    except Exception:
        buffer = np.frombuffer(file_bytes, dtype=np.uint8)
        return cv2.imdecode(buffer, cv2.IMREAD_COLOR)


def rotate_image_keep_bounds(image: np.ndarray, angle: float) -> np.ndarray:
    """Gira sin cortar esquinas y rellena con un tono neutro de la propia foto."""
    normalized_angle = float(angle) % 360.0
    if abs(normalized_angle) < 0.01:
        return image.copy()
    if abs(normalized_angle - 90.0) < 0.01:
        return cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)
    if abs(normalized_angle - 180.0) < 0.01:
        return cv2.rotate(image, cv2.ROTATE_180)
    if abs(normalized_angle - 270.0) < 0.01:
        return cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)

    height, width = image.shape[:2]
    center = (width / 2.0, height / 2.0)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    cosine = abs(matrix[0, 0])
    sine = abs(matrix[0, 1])
    new_width = max(1, int(round(height * sine + width * cosine)))
    new_height = max(1, int(round(height * cosine + width * sine)))
    matrix[0, 2] += new_width / 2.0 - center[0]
    matrix[1, 2] += new_height / 2.0 - center[1]
    border = tuple(int(value) for value in np.median(image.reshape(-1, 3), axis=0))
    return cv2.warpAffine(
        image,
        matrix,
        (new_width, new_height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=border,
    )


def draw_reticle(
    image: np.ndarray, point: Tuple[float, float], color=(255, 0, 255)
) -> np.ndarray:
    """Dibuja la reticula elegida sin modificar la imagen usada para reconocer."""
    preview = image.copy()
    height, width = preview.shape[:2]
    x = int(round(np.clip(point[0], 0, max(0, width - 1))))
    y = int(round(np.clip(point[1], 0, max(0, height - 1))))
    size = max(24, min(width, height) // 12)
    thickness = max(2, int(round(max(width, height) / 500)))
    cv2.drawMarker(
        preview,
        (x, y),
        color,
        cv2.MARKER_CROSS,
        size,
        thickness,
        cv2.LINE_AA,
    )
    cv2.circle(preview, (x, y), max(8, size // 4), color, thickness, cv2.LINE_AA)
    return preview


def resize_to_limit(image: np.ndarray, limit: int = MAX_DIMENSION) -> np.ndarray:
    """Normaliza la escala para que el coste y el numero de features sean comparables."""
    height, width = image.shape[:2]
    longest = max(height, width)
    if longest <= limit:
        return image
    factor = limit / longest
    new_size = (int(round(width * factor)), int(round(height * factor)))
    return cv2.resize(image, new_size, interpolation=cv2.INTER_AREA)


def preprocess(image: np.ndarray) -> np.ndarray:
    """Normalizacion fotometrica para camaras e iluminaciones diferentes."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    low, high = np.percentile(gray, (2, 98))
    if high - low >= 25:
        gray = np.clip(
            (gray.astype(np.float32) - low) * 255.0 / (high - low), 0, 255
        ).astype(np.uint8)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    normalized = clahe.apply(gray)
    mean = float(normalized.mean()) / 255.0
    if 0.05 < mean < 0.95:
        gamma = float(np.clip(np.log(0.5) / np.log(mean), 0.70, 1.40))
        table = np.array([((i / 255.0) ** gamma) * 255 for i in range(256)]).astype(
            np.uint8
        )
        normalized = cv2.LUT(normalized, table)
    return normalized


def analyze_capture_quality(image: np.ndarray) -> dict:
    """Mide nitidez, exposicion y rango tonal sin bloquear automaticamente."""
    gray = cv2.cvtColor(resize_to_limit(image, 800), cv2.COLOR_BGR2GRAY)
    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    mean = float(gray.mean())
    low, high = np.percentile(gray, (5, 95))
    dynamic_range = float(high - low)
    warnings = []
    if blur < 45:
        warnings.append("imagen posiblemente desenfocada o movida")
    if mean < 45:
        warnings.append("imagen demasiado oscura")
    elif mean > 220:
        warnings.append("imagen demasiado clara")
    if dynamic_range < 45:
        warnings.append("contraste muy bajo")
    return {
        "Nitidez": round(blur, 1),
        "Brillo medio": round(mean, 1),
        "Rango tonal": round(dynamic_range, 1),
        "Avisos": ", ".join(warnings) if warnings else "Calidad util",
    }


def order_quad_points(points: np.ndarray) -> np.ndarray:
    """Ordena las cuatro esquinas: superior izq./der. e inferior der./izq."""
    points = points.reshape(4, 2).astype(np.float32)
    ordered = np.zeros((4, 2), dtype=np.float32)
    sums = points.sum(axis=1)
    differences = np.diff(points, axis=1).reshape(-1)
    ordered[0] = points[np.argmin(sums)]
    ordered[2] = points[np.argmax(sums)]
    ordered[1] = points[np.argmin(differences)]
    ordered[3] = points[np.argmax(differences)]
    return ordered


def warp_quad(image: np.ndarray, points: np.ndarray) -> np.ndarray:
    """Endereza el cuadrilatero detectado sin ampliar mas que la entrada."""
    top_left, top_right, bottom_right, bottom_left = order_quad_points(points)
    width = int(round(max(
        np.linalg.norm(bottom_right - bottom_left),
        np.linalg.norm(top_right - top_left),
    )))
    height = int(round(max(
        np.linalg.norm(top_right - bottom_right),
        np.linalg.norm(top_left - bottom_left),
    )))
    width = max(32, min(width, image.shape[1]))
    height = max(32, min(height, image.shape[0]))
    destination = np.float32(
        [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]]
    )
    transform = cv2.getPerspectiveTransform(
        np.float32([top_left, top_right, bottom_right, bottom_left]), destination
    )
    return cv2.warpPerspective(image, transform, (width, height))


def normalize_isolated_size(image: np.ndarray, target_long_edge: int = 700) -> np.ndarray:
    """Amplia solo objetos pequenos para que ORB trabaje a una escala estable."""
    height, width = image.shape[:2]
    longest = max(height, width)
    if longest >= target_long_edge:
        return image
    factor = target_long_edge / max(longest, 1)
    new_size = (
        max(32, int(round(width * factor))),
        max(32, int(round(height * factor))),
    )
    return cv2.resize(image, new_size, interpolation=cv2.INTER_LANCZOS4)


def isolate_planar_object(image: np.ndarray) -> Tuple[np.ndarray, bool, float]:
    """Busca una carta/portada rectangular y elimina el fondo."""
    started = perf_counter()
    detection = resize_to_limit(image, 800)
    gray = cv2.cvtColor(detection, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    median = float(np.median(gray))
    automatic_edges = cv2.Canny(
        gray,
        int(max(20, 0.66 * median)),
        int(min(220, max(60, 1.33 * median))),
    )
    fixed_edges = cv2.Canny(gray, 35, 125)
    edges = cv2.bitwise_or(automatic_edges, fixed_edges)
    edges = cv2.morphologyEx(
        edges, cv2.MORPH_CLOSE, np.ones((5, 5), dtype=np.uint8), iterations=2
    )
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    image_area = float(detection.shape[0] * detection.shape[1])
    center = np.array([detection.shape[1] / 2.0, detection.shape[0] / 2.0])
    best_quad = None
    best_score = -1.0

    for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:40]:
        area = float(cv2.contourArea(contour))
        area_ratio = area / image_area
        if not 0.025 <= area_ratio <= 0.95:
            continue
        perimeter = cv2.arcLength(contour, True)
        polygon = cv2.approxPolyDP(contour, 0.025 * perimeter, True)
        if len(polygon) != 4 or not cv2.isContourConvex(polygon):
            continue
        rectangle = cv2.minAreaRect(polygon)
        rect_width, rect_height = rectangle[1]
        rectangle_area = rect_width * rect_height
        if rectangle_area <= 0:
            continue
        short_side = min(rect_width, rect_height)
        long_side = max(rect_width, rect_height)
        aspect_ratio = short_side / max(long_side, 1.0)
        if not 0.42 <= aspect_ratio <= 0.90:
            continue
        rectangularity = area / rectangle_area
        if rectangularity < 0.72:
            continue
        polygon_center = polygon.reshape(4, 2).mean(axis=0)
        center_distance = np.linalg.norm(polygon_center - center) / np.linalg.norm(center)
        center_score = max(0.0, 1.0 - center_distance)
        aspect_score = max(0.0, 1.0 - abs(aspect_ratio - 0.68))
        score = (
            rectangularity * 0.35
            + center_score * 0.30
            + min(area_ratio / 0.25, 1.0) * 0.20
            + aspect_score * 0.15
        )
        if score > best_score:
            best_score = score
            best_quad = polygon

    if best_quad is None:
        elapsed_ms = (perf_counter() - started) * 1000.0
        return image, False, elapsed_ms

    scale_x = image.shape[1] / detection.shape[1]
    scale_y = image.shape[0] / detection.shape[0]
    full_size_quad = best_quad.astype(np.float32)
    full_size_quad[:, 0, 0] *= scale_x
    full_size_quad[:, 0, 1] *= scale_y
    isolated = normalize_isolated_size(warp_quad(image, full_size_quad))
    elapsed_ms = (perf_counter() - started) * 1000.0
    return isolated, True, elapsed_ms


def build_detector(algorithm: str, max_features: int):
    if algorithm == "SIFT":
        if not hasattr(cv2, "SIFT_create"):
            raise RuntimeError(
                "Esta build de OpenCV no incluye SIFT. Usa ORB o instala opencv-contrib-python."
            )
        return cv2.SIFT_create(nfeatures=max_features)
    return cv2.ORB_create(nfeatures=max_features, scaleFactor=1.2, nlevels=8)


def build_matcher(algorithm: str) -> cv2.BFMatcher:
    norm = cv2.NORM_HAMMING if algorithm == "ORB" else cv2.NORM_L2
    return cv2.BFMatcher(norm, crossCheck=False)


def extract_features(
    label: str,
    image: np.ndarray,
    detector,
    view_image: Optional[np.ndarray] = None,
    view_box: Optional[Tuple[int, int, int, int]] = None,
    intent_point: Optional[Tuple[float, float]] = None,
) -> FeatureSet:
    normalized = resize_to_limit(image)
    keypoints, descriptors = detector.detectAndCompute(preprocess(normalized), None)
    if view_image is None:
        view_image = image
    if view_box is None:
        view_box = (0, 0, view_image.shape[1], view_image.shape[0])
    if intent_point is None:
        intent_point = (view_image.shape[1] / 2.0, view_image.shape[0] / 2.0)
    return FeatureSet(
        label=label,
        image=normalized,
        keypoints=keypoints or tuple(),
        descriptors=descriptors,
        view_image=view_image,
        view_box=view_box,
        intent_point=intent_point,
    )


def map_point_to_view(feature_set: FeatureSet, point: Tuple[float, float]) -> Tuple[float, float]:
    """Convierte un punto de la imagen de trabajo a la imagen completa mostrada."""
    left, top, right, bottom = feature_set.view_box or (
        0, 0, feature_set.image.shape[1], feature_set.image.shape[0]
    )
    x_scale = (right - left) / max(1.0, feature_set.image.shape[1])
    y_scale = (bottom - top) / max(1.0, feature_set.image.shape[0])
    return left + point[0] * x_scale, top + point[1] * y_scale


def map_box_to_view(
    feature_set: FeatureSet, box: Tuple[int, int, int, int]
) -> Tuple[int, int, int, int]:
    left, top = map_point_to_view(feature_set, (box[0], box[1]))
    right, bottom = map_point_to_view(feature_set, (box[2], box[3]))
    return int(round(left)), int(round(top)), int(round(right)), int(round(bottom))


def map_point_from_view(
    feature_set: FeatureSet, point: Tuple[float, float]
) -> Tuple[float, float]:
    """Convierte un punto de la fotografia completa a la imagen de trabajo."""
    left, top, right, bottom = feature_set.view_box or (
        0, 0, feature_set.image.shape[1], feature_set.image.shape[0]
    )
    x_scale = feature_set.image.shape[1] / max(1.0, right - left)
    y_scale = feature_set.image.shape[0] / max(1.0, bottom - top)
    return (point[0] - left) * x_scale, (point[1] - top) * y_scale


def extract_cropped_features(
    parent: FeatureSet,
    crop: np.ndarray,
    crop_box: Tuple[int, int, int, int],
    detector,
) -> FeatureSet:
    """Extrae features del recorte manteniendo coordenadas de visualizacion."""
    return extract_features(
        parent.label,
        crop,
        detector,
        view_image=parent.view_image,
        view_box=map_box_to_view(parent, crop_box),
        intent_point=parent.intent_point,
    )


def centered_search_views(image: np.ndarray) -> List[Tuple[str, np.ndarray, Tuple[int, int, int, int]]]:
    """Genera la vista normal y dos acercamientos centrales baratos."""
    height, width = image.shape[:2]
    views = [("1.00x", image, (0, 0, width, height))]
    for label, ratio in (("1.22x", 0.82), ("1.47x", 0.68)):
        crop_width = max(64, int(round(width * ratio)))
        crop_height = max(64, int(round(height * ratio)))
        left = max(0, (width - crop_width) // 2)
        top = max(0, (height - crop_height) // 2)
        right = min(width, left + crop_width)
        bottom = min(height, top + crop_height)
        views.append((label, np.ascontiguousarray(image[top:bottom, left:right]), (left, top, right, bottom)))
    return views


def spatial_match_components(
    points: np.ndarray, shape: tuple, radius: float = 0.16
) -> List[np.ndarray]:
    """Agrupa matches cercanos sin depender de librerias externas."""
    if points is None or len(points) < 4:
        return []
    height, width = shape[:2]
    coordinates = np.asarray(points, dtype=np.float32).reshape(-1, 2)
    normalized = coordinates / np.array([max(width, 1), max(height, 1)], np.float32)
    distances = np.linalg.norm(normalized[:, None, :] - normalized[None, :, :], axis=2)
    adjacency = distances <= radius
    pending = set(range(len(coordinates)))
    components = []
    while pending:
        seed = pending.pop()
        stack = [seed]
        group = {seed}
        while stack:
            current = stack.pop()
            neighbours = set(np.flatnonzero(adjacency[current]).tolist()) & pending
            pending -= neighbours
            group |= neighbours
            stack.extend(neighbours)
        if len(group) >= 4:
            components.append(np.array(sorted(group), dtype=np.int32))
    return components


def boxes_overlap_ratio(a: tuple, b: tuple) -> float:
    left = max(a[0], b[0])
    top = max(a[1], b[1])
    right = min(a[2], b[2])
    bottom = min(a[3], b[3])
    intersection = max(0, right - left) * max(0, bottom - top)
    area_a = max(1, (a[2] - a[0]) * (a[3] - a[1]))
    area_b = max(1, (b[2] - b[0]) * (b[3] - b[1]))
    return intersection / float(min(area_a, area_b))


def box_intersects_intent_zone(
    box: tuple,
    shape: tuple,
    margin: float = 0.16,
    intent_point: Optional[Tuple[float, float]] = None,
) -> bool:
    """Comprueba que la region candidata alcance una zona central amplia."""
    height, width = shape[:2]
    center_x, center_y = intent_point or (width / 2.0, height / 2.0)
    half_width = width * (0.5 - margin)
    half_height = height * (0.5 - margin)
    zone = (
        max(0, int(round(center_x - half_width))),
        max(0, int(round(center_y - half_height))),
        min(width, int(round(center_x + half_width))),
        min(height, int(round(center_y + half_height))),
    )
    return not (
        box[2] <= zone[0]
        or box[0] >= zone[2]
        or box[3] <= zone[1]
        or box[1] >= zone[3]
    )


def feature_points_box_in_view(
    feature_set: FeatureSet, points: np.ndarray, margin_ratio: float = 0.40
) -> Optional[Tuple[int, int, int, int]]:
    """Caja de puntos trasladada a la fotografia completa, con margen."""
    if points is None or len(points) < 4:
        return None
    coordinates = np.asarray(points, dtype=np.float32).reshape(-1, 2)
    x_min, y_min = coordinates.min(axis=0)
    x_max, y_max = coordinates.max(axis=0)
    span_x = max(12.0, float(x_max - x_min))
    span_y = max(12.0, float(y_max - y_min))
    local_box = (
        max(0, int(round(x_min - span_x * margin_ratio))),
        max(0, int(round(y_min - span_y * margin_ratio))),
        min(feature_set.image.shape[1], int(round(x_max + span_x * margin_ratio))),
        min(feature_set.image.shape[0], int(round(y_max + span_y * margin_ratio))),
    )
    return map_box_to_view(feature_set, local_box)


def target_intent_metrics(
    feature_set: FeatureSet, points: np.ndarray
) -> Tuple[float, float, Optional[Tuple[int, int, int, int]]]:
    """Mide cuanto apunta el usuario a esta deteccion, sin negar otras."""
    box = feature_points_box_in_view(feature_set, points, margin_ratio=0.35)
    if box is None:
        return 0.0, 1.0, None
    view = feature_set.view_image if feature_set.view_image is not None else feature_set.image
    height, width = view.shape[:2]
    center = np.array(
        feature_set.intent_point or (width / 2.0, height / 2.0),
        dtype=np.float32,
    )
    left, top, right, bottom = box
    nearest = np.array(
        [np.clip(center[0], left, right), np.clip(center[1], top, bottom)],
        dtype=np.float32,
    )
    half_diagonal = max(1.0, float(np.hypot(width / 2.0, height / 2.0)))
    distance_to_box = float(np.linalg.norm(center - nearest) / half_diagonal)
    box_center = np.array([(left + right) / 2.0, (top + bottom) / 2.0], dtype=np.float32)
    center_distance = float(np.linalg.norm(center - box_center) / half_diagonal)
    reticle_score = float(np.clip(1.0 - distance_to_box / 0.55, 0.0, 1.0))
    proximity_score = float(np.clip(1.0 - center_distance, 0.0, 1.0))
    aim_score = 0.75 * reticle_score + 0.25 * proximity_score
    return float(np.clip(aim_score, 0.0, 1.0)), distance_to_box, box


def describe_frame_orientation(image: np.ndarray) -> str:
    height, width = image.shape[:2]
    ratio = width / max(1.0, float(height))
    if ratio >= 2.0:
        return "panoramico horizontal"
    if ratio >= 1.15:
        return "horizontal"
    if ratio <= 0.50:
        return "vertical muy alargado"
    if ratio <= 0.87:
        return "vertical"
    return "cuadrado o casi cuadrado"


def default_reference_box(
    image: np.ndarray, width_ratio: float = 0.72, height_ratio: float = 0.86
) -> Tuple[int, int, int, int]:
    height, width = image.shape[:2]
    crop_width = max(32, int(round(width * width_ratio)))
    crop_height = max(32, int(round(height * height_ratio)))
    left = max(0, (width - crop_width) // 2)
    top = max(0, (height - crop_height) // 2)
    return left, top, min(width, left + crop_width), min(height, top + crop_height)


def suggest_reference_box(
    image: np.ndarray,
) -> Tuple[Tuple[int, int, int, int], str]:
    """V10.7: propuesta automatica centrada y multiformato.

    No intenta decidir la identidad por reconocimiento. Solo propone una caja de
    registro alrededor del objeto que el usuario ha colocado aproximadamente en
    el centro. Combina bordes, contraste respecto al fondo y contornos
    irregulares; por eso no exige que el objeto sea un rectangulo perfecto.
    """
    detection = resize_to_limit(image, 900)
    height, width = detection.shape[:2]
    image_area = float(height * width)
    image_center = np.array([width / 2.0, height / 2.0], dtype=np.float32)
    half_diagonal = max(1.0, float(np.hypot(width / 2.0, height / 2.0)))

    gray = cv2.cvtColor(detection, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    median = float(np.median(gray))
    edges_a = cv2.Canny(
        gray,
        int(max(10, 0.45 * median)),
        int(min(240, max(50, 1.60 * median))),
    )
    edges_b = cv2.Canny(gray, 24, 105)

    gradient = cv2.morphologyEx(
        gray,
        cv2.MORPH_GRADIENT,
        np.ones((5, 5), dtype=np.uint8),
    )
    gradient_limit = max(8, int(np.percentile(gradient, 70)))
    _, gradient_edges = cv2.threshold(
        gradient, gradient_limit, 255, cv2.THRESH_BINARY
    )
    combined_edges = cv2.bitwise_or(edges_a, edges_b)
    combined_edges = cv2.bitwise_or(combined_edges, gradient_edges)

    # Segundo mapa: diferencia de color respecto al borde exterior de la foto.
    # Ayuda cuando el objeto tiene una silueta clara pero no un marco rectangular.
    lab = cv2.cvtColor(detection, cv2.COLOR_BGR2LAB).astype(np.float32)
    border = max(4, int(round(min(height, width) * 0.055)))
    border_pixels = np.concatenate(
        [
            lab[:border, :, :].reshape(-1, 3),
            lab[-border:, :, :].reshape(-1, 3),
            lab[:, :border, :].reshape(-1, 3),
            lab[:, -border:, :].reshape(-1, 3),
        ],
        axis=0,
    )
    background_lab = np.median(border_pixels, axis=0)
    colour_distance = np.linalg.norm(lab - background_lab.reshape(1, 1, 3), axis=2)
    distance_limit = max(10.0, float(np.percentile(colour_distance, 62)))
    contrast_mask = (colour_distance >= distance_limit).astype(np.uint8) * 255
    contrast_mask = cv2.morphologyEx(
        contrast_mask,
        cv2.MORPH_CLOSE,
        np.ones((9, 9), dtype=np.uint8),
        iterations=2,
    )
    contrast_mask = cv2.morphologyEx(
        contrast_mask,
        cv2.MORPH_OPEN,
        np.ones((3, 3), dtype=np.uint8),
        iterations=1,
    )

    candidates = []

    def add_candidate(
        x: int,
        y: int,
        box_width: int,
        box_height: int,
        source: str,
        source_bonus: float = 0.0,
    ) -> None:
        if box_width < 18 or box_height < 18:
            return

        area_ratio = float(box_width * box_height) / image_area
        if not 0.004 <= area_ratio <= 0.86:
            return

        short_long = min(box_width, box_height) / max(box_width, box_height)
        if short_long < 0.018:
            return

        left, top = int(x), int(y)
        right, bottom = int(x + box_width), int(y + box_height)
        box_center = np.array(
            [x + box_width / 2.0, y + box_height / 2.0], dtype=np.float32
        )
        center_distance = float(
            np.linalg.norm(box_center - image_center) / half_diagonal
        )
        center_score = float(np.clip(1.0 - center_distance, 0.0, 1.0))

        contains_center = (
            left <= image_center[0] <= right
            and top <= image_center[1] <= bottom
        )

        # El usuario registra apuntando aproximadamente al objeto central.
        # Premia que la caja cubra el centro o quede muy cerca de el.
        intent_score = 1.0 if contains_center else max(0.0, 1.0 - center_distance / 0.48)

        # Evita dos extremos: minidetalles interiores y casi toda la fotografia.
        if area_ratio < 0.018:
            size_score = area_ratio / 0.018
        elif area_ratio <= 0.38:
            size_score = min(1.0, 0.55 + area_ratio / 0.38)
        else:
            size_score = max(0.0, 1.0 - (area_ratio - 0.38) / 0.48)

        border_touches = sum(
            (
                left <= 2,
                top <= 2,
                right >= width - 2,
                bottom >= height - 2,
            )
        )
        border_score = 1.0 - min(border_touches, 3) * 0.26

        local_edges = combined_edges[top:bottom, left:right]
        edge_density = float(np.count_nonzero(local_edges) / max(1, local_edges.size))
        texture_score = float(np.clip(edge_density / 0.10, 0.0, 1.0))

        local_contrast = contrast_mask[top:bottom, left:right]
        contrast_fill = float(np.count_nonzero(local_contrast) / max(1, local_contrast.size))
        contrast_score = float(np.clip(contrast_fill / 0.42, 0.0, 1.0))

        enclosure_bonus = 0.08 if contains_center and area_ratio >= 0.035 else 0.0

        score = (
            center_score * 0.24
            + intent_score * 0.25
            + size_score * 0.18
            + border_score * 0.10
            + texture_score * 0.10
            + contrast_score * 0.08
            + enclosure_bonus
            + source_bonus
        )
        candidates.append(
            {
                "score": float(score),
                "box": (left, top, right, bottom),
                "area_ratio": float(area_ratio),
                "center_distance": float(center_distance),
                "contains_center": bool(contains_center),
                "source": source,
            }
        )

    # Candidatos por contornos de borde a varias escalas.
    for kernel_size, source_bonus in (
        (5, 0.00),
        (9, 0.01),
        (15, 0.025),
        (23, 0.030),
        (35, 0.020),
        (49, 0.005),
    ):
        closed = cv2.morphologyEx(
            combined_edges,
            cv2.MORPH_CLOSE,
            np.ones((kernel_size, kernel_size), dtype=np.uint8),
            iterations=2,
        )
        contours, _ = cv2.findContours(
            closed, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE
        )
        for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:160]:
            x, y, bw, bh = cv2.boundingRect(contour)
            add_candidate(x, y, bw, bh, "bordes", source_bonus)

            perimeter = cv2.arcLength(contour, True)
            if perimeter > 0:
                polygon = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
                # Triangulos, rombos, rectangulos y siluetas sencillas.
                if 3 <= len(polygon) <= 10:
                    px, py, pw, ph = cv2.boundingRect(polygon)
                    add_candidate(px, py, pw, ph, "silueta", source_bonus + 0.015)

    # Candidatos por contraste de color con el fondo.
    components, labels, stats, centroids = cv2.connectedComponentsWithStats(
        contrast_mask, connectivity=8
    )
    for component in range(1, components):
        x, y, bw, bh, area = stats[component]
        if area < max(80, image_area * 0.0015):
            continue
        add_candidate(int(x), int(y), int(bw), int(bh), "contraste", 0.035)

    # Une componentes cercanos al centro; es util para objetos formados por
    # varias piezas visuales separadas (letras, dibujos, relieves, etc.).
    center_zone = (
        int(width * 0.30),
        int(height * 0.30),
        int(width * 0.70),
        int(height * 0.70),
    )
    zx1, zy1, zx2, zy2 = center_zone
    selected_boxes = []
    for component in range(1, components):
        x, y, bw, bh, area = stats[component]
        cx, cy = centroids[component]
        if zx1 <= cx <= zx2 and zy1 <= cy <= zy2 and area >= max(50, image_area * 0.0008):
            selected_boxes.append((x, y, x + bw, y + bh))
    if selected_boxes:
        ux1 = min(box[0] for box in selected_boxes)
        uy1 = min(box[1] for box in selected_boxes)
        ux2 = max(box[2] for box in selected_boxes)
        uy2 = max(box[3] for box in selected_boxes)
        add_candidate(ux1, uy1, ux2 - ux1, uy2 - uy1, "contraste central combinado", 0.045)

    if not candidates:
        return default_reference_box(image), "propuesta central flexible (sin contorno fiable)"

    candidates.sort(key=lambda item: item["score"], reverse=True)
    best = candidates[0]

    # Si dos cajas casi empatadas describen el mismo centro, escogemos la que
    # engloba mas del objeto, pero nunca una caja que sea practicamente toda la foto.
    near_best = [
        item for item in candidates[:32]
        if item["score"] >= best["score"] - 0.055
    ]
    compatible = []
    bx1, by1, bx2, by2 = best["box"]
    best_center = np.array(
        [(bx1 + bx2) / 2.0, (by1 + by2) / 2.0], dtype=np.float32
    )
    for item in near_best:
        x1, y1, x2, y2 = item["box"]
        center = np.array(
            [(x1 + x2) / 2.0, (y1 + y2) / 2.0], dtype=np.float32
        )
        center_gap = float(np.linalg.norm(center - best_center) / half_diagonal)
        if center_gap <= 0.10 and item["area_ratio"] <= 0.68:
            compatible.append(item)
    if compatible:
        # Mantiene la puntuacion como criterio principal, pero permite que un
        # contorno exterior apenas peor gane sobre un detalle interior pequeno.
        best = max(
            compatible,
            key=lambda item: (
                item["score"] + min(0.055, item["area_ratio"] * 0.07),
                item["area_ratio"],
            ),
        )

    if best["score"] < 0.40:
        return default_reference_box(image), "propuesta central flexible (confianza baja)"

    left, top, right, bottom = best["box"]
    scale_x = image.shape[1] / float(width)
    scale_y = image.shape[0] / float(height)
    left = int(round(left * scale_x))
    right = int(round(right * scale_x))
    top = int(round(top * scale_y))
    bottom = int(round(bottom * scale_y))

    # Margen pequeno: suficiente para no cortar el borde, sin volver a meter
    # mucha pared, estanteria u otros objetos laterales.
    margin_x = max(3, int(round((right - left) * 0.035)))
    margin_y = max(3, int(round((bottom - top) * 0.035)))
    proposed = (
        max(0, left - margin_x),
        max(0, top - margin_y),
        min(image.shape[1], right + margin_x),
        min(image.shape[0], bottom + margin_y),
    )

    proposed_w = proposed[2] - proposed[0]
    proposed_h = proposed[3] - proposed[1]
    aspect = proposed_w / max(1.0, float(proposed_h))
    if aspect >= 2.2:
        shape_note = "panoramico"
    elif aspect <= 0.45:
        shape_note = "vertical estrecho"
    elif aspect >= 1.28:
        shape_note = "horizontal"
    elif aspect <= 0.78:
        shape_note = "vertical"
    else:
        shape_note = "compacto/irregular"

    return proposed, f"recorte automatico V10.7 ({shape_note}; {best['source']})"


def box_to_percentage_ranges(
    image: np.ndarray, box: Tuple[int, int, int, int]
) -> Tuple[Tuple[int, int], Tuple[int, int]]:
    height, width = image.shape[:2]
    left, top, right, bottom = box
    horizontal = (
        int(round(100 * left / max(width, 1))),
        int(round(100 * right / max(width, 1))),
    )
    vertical = (
        int(round(100 * top / max(height, 1))),
        int(round(100 * bottom / max(height, 1))),
    )
    horizontal = (
        min(99, max(0, horizontal[0])),
        min(100, max(horizontal[0] + 1, horizontal[1])),
    )
    vertical = (
        min(99, max(0, vertical[0])),
        min(100, max(vertical[0] + 1, vertical[1])),
    )
    return horizontal, vertical


def percentage_ranges_to_box(
    image: np.ndarray, horizontal: Tuple[int, int], vertical: Tuple[int, int]
) -> Tuple[int, int, int, int]:
    height, width = image.shape[:2]
    left = int(round(width * horizontal[0] / 100.0))
    right = int(round(width * horizontal[1] / 100.0))
    top = int(round(height * vertical[0] / 100.0))
    bottom = int(round(height * vertical[1] / 100.0))
    if right - left < 32:
        right = min(width, left + 32)
        left = max(0, right - 32)
    if bottom - top < 32:
        bottom = min(height, top + 32)
        top = max(0, bottom - 32)
    return left, top, right, bottom


def crop_to_box(image: np.ndarray, box: Tuple[int, int, int, int]) -> np.ndarray:
    left, top, right, bottom = box
    return np.ascontiguousarray(image[top:bottom, left:right])


def draw_registration_preview(
    image: np.ndarray, box: Tuple[int, int, int, int]
) -> np.ndarray:
    preview = image.copy()
    left, top, right, bottom = box
    overlay = preview.copy()
    cv2.rectangle(overlay, (0, 0), (preview.shape[1], preview.shape[0]), (0, 0, 0), -1)
    overlay[top:bottom, left:right] = preview[top:bottom, left:right]
    preview = cv2.addWeighted(preview, 0.30, overlay, 0.70, 0)
    thickness = max(2, int(round(max(preview.shape[:2]) / 300)))
    cv2.rectangle(
        preview,
        (left, top),
        (max(left, right - 1), max(top, bottom - 1)),
        (255, 180, 0),
        thickness,
        cv2.LINE_AA,
    )
    center = ((left + right) // 2, (top + bottom) // 2)
    cv2.drawMarker(
        preview,
        center,
        (255, 0, 255),
        cv2.MARKER_CROSS,
        max(24, min(right - left, bottom - top) // 8),
        thickness + 1,
        cv2.LINE_AA,
    )
    return preview


def build_dynamic_proposals(
    reference: FeatureSet,
    test: FeatureSet,
    detector,
    algorithm: str,
    ratio_threshold: float,
    max_proposals: int = 3,
) -> List[FeatureSet]:
    """Crea ventanas alrededor de grupos de matches preliminares."""
    if reference.descriptors is None or test.descriptors is None:
        return []
    matcher = build_matcher(algorithm)
    pairs = matcher.knnMatch(reference.descriptors, test.descriptors, k=2)
    proposal_ratio = min(0.88, ratio_threshold + 0.10)
    tentative = [
        pair[0]
        for pair in pairs
        if len(pair) == 2 and pair[0].distance < proposal_ratio * pair[1].distance
    ]
    if len(tentative) < 4:
        return []
    test_points = np.float32([test.keypoints[m.trainIdx].pt for m in tentative])
    components = spatial_match_components(test_points, test.image.shape)
    center = np.array(
        map_point_from_view(
            test,
            test.intent_point
            or (
                (test.view_image if test.view_image is not None else test.image).shape[1] / 2.0,
                (test.view_image if test.view_image is not None else test.image).shape[0] / 2.0,
            ),
        ),
        dtype=np.float32,
    )

    ranked = []
    full_shape = test.view_image.shape if test.view_image is not None else test.image.shape
    for component in components:
        points = test_points[component]
        centroid = points.mean(axis=0)
        center_distance = np.linalg.norm(
            (centroid - center) / np.array([test.image.shape[1], test.image.shape[0]])
        )
        _, candidate_box = bounding_crop_from_points(
            test.image, points, margin_ratio=0.48, min_side=150
        )
        if candidate_box is None:
            continue
        candidate_box_view = map_box_to_view(test, candidate_box)
        if not box_intersects_intent_zone(
            candidate_box_view, full_shape, intent_point=test.intent_point
        ):
            continue
        central_weight = max(0.15, 1.0 - 1.75 * center_distance)
        score = len(component) * central_weight
        ranked.append((score, points))
    ranked.sort(key=lambda item: item[0], reverse=True)

    proposals = []
    accepted_boxes = []
    for _, points in ranked:
        crop, box = bounding_crop_from_points(
            test.image, points, margin_ratio=0.48, min_side=150
        )
        if box is None or any(boxes_overlap_ratio(box, other) > 0.82 for other in accepted_boxes):
            continue
        accepted_boxes.append(box)
        proposals.append(extract_cropped_features(test, crop, box, detector))
        if len(proposals) >= max_proposals:
            break
    return proposals


def clamp_view_box(
    shape: tuple,
    box: Tuple[int, int, int, int],
    min_side: int = 64,
) -> Optional[Tuple[int, int, int, int]]:
    """Limita una caja a la foto original sin cambiar la logica de decision."""
    height, width = shape[:2]
    left, top, right, bottom = box
    left = int(np.clip(left, 0, max(0, width - 1)))
    top = int(np.clip(top, 0, max(0, height - 1)))
    right = int(np.clip(right, left + 1, width))
    bottom = int(np.clip(bottom, top + 1, height))
    if right - left < min_side or bottom - top < min_side:
        return None
    return left, top, right, bottom


def expand_view_box(
    shape: tuple,
    box: Tuple[int, int, int, int],
    margin_ratio: float = 0.18,
    min_side: int = 180,
) -> Optional[Tuple[int, int, int, int]]:
    """Expande una localizacion preliminar antes de volver a la foto original."""
    height, width = shape[:2]
    left, top, right, bottom = box
    box_w = max(1, right - left)
    box_h = max(1, bottom - top)
    target_w = max(float(min_side), box_w * (1.0 + 2.0 * margin_ratio))
    target_h = max(float(min_side), box_h * (1.0 + 2.0 * margin_ratio))
    center_x = (left + right) / 2.0
    center_y = (top + bottom) / 2.0

    new_left = int(round(center_x - target_w / 2.0))
    new_top = int(round(center_y - target_h / 2.0))
    new_right = int(round(center_x + target_w / 2.0))
    new_bottom = int(round(center_y + target_h / 2.0))

    if new_left < 0:
        new_right -= new_left
        new_left = 0
    if new_top < 0:
        new_bottom -= new_top
        new_top = 0
    if new_right > width:
        shift = new_right - width
        new_left -= shift
        new_right = width
    if new_bottom > height:
        shift = new_bottom - height
        new_top -= shift
        new_bottom = height

    return clamp_view_box(
        shape,
        (max(0, new_left), max(0, new_top), min(width, new_right), min(height, new_bottom)),
        min_side=min(64, min_side),
    )


def box_around_intent(
    shape: tuple,
    intent_point: Tuple[float, float],
    ratio: float,
) -> Optional[Tuple[int, int, int, int]]:
    """Caja centrada en la reticula usando coordenadas de la foto original."""
    height, width = shape[:2]
    crop_w = max(180, int(round(width * ratio)))
    crop_h = max(180, int(round(height * ratio)))
    crop_w = min(crop_w, width)
    crop_h = min(crop_h, height)
    center_x = float(np.clip(intent_point[0], 0, max(0, width - 1)))
    center_y = float(np.clip(intent_point[1], 0, max(0, height - 1)))
    left = int(round(center_x - crop_w / 2.0))
    top = int(round(center_y - crop_h / 2.0))
    left = int(np.clip(left, 0, max(0, width - crop_w)))
    top = int(np.clip(top, 0, max(0, height - crop_h)))
    return clamp_view_box(shape, (left, top, left + crop_w, top + crop_h))


def extract_original_view_features(
    label: str,
    full_image: np.ndarray,
    view_box: Tuple[int, int, int, int],
    detector,
    intent_point: Tuple[float, float],
) -> Optional[FeatureSet]:
    """Extrae features de un recorte de la foto ORIGINAL y conserva el mapa global."""
    box = clamp_view_box(full_image.shape, view_box)
    if box is None:
        return None
    left, top, right, bottom = box
    crop = np.ascontiguousarray(full_image[top:bottom, left:right])
    if min(crop.shape[:2]) < 32:
        return None
    return extract_features(
        label,
        crop,
        detector,
        view_image=full_image,
        view_box=box,
        intent_point=intent_point,
    )


def build_reticle_highres_views(
    label: str,
    full_image: np.ndarray,
    intent_point: Tuple[float, float],
    detector,
) -> List[Tuple[str, FeatureSet]]:
    """Vistas de alta resolucion alrededor de la reticula.

    Se calculan una vez por analisis y se reutilizan contra todas las referencias.
    El objetivo es recuperar objetos que en la pasada global de 1000 px quedan
    demasiado pequenos para aportar suficientes keypoints.
    """
    views: List[Tuple[str, FeatureSet]] = []
    for note, ratio in (("22%", 0.22), ("36%", 0.36), ("52%", 0.52)):
        box = box_around_intent(full_image.shape, intent_point, ratio)
        if box is None:
            continue
        features = extract_original_view_features(
            label, full_image, box, detector, intent_point
        )
        if features is not None and features.count >= 2:
            views.append((note, features))
    return views


def build_highres_local_proposals(
    reference: FeatureSet,
    base_test: FeatureSet,
    full_image: np.ndarray,
    detector,
    algorithm: str,
    ratio_threshold: float,
    intent_point: Tuple[float, float],
    max_proposals: int = 2,
) -> List[FeatureSet]:
    """Vuelve a la foto original en zonas sugeridas por matches preliminares.

    A diferencia de build_dynamic_proposals, estas propuestas NO exigen estar
    centradas en la reticula. Por eso pueden rescatar un objeto secundario pequeno
    como la placa de Paris mientras otro objeto es el objetivo.
    """
    if reference.descriptors is None or base_test.descriptors is None:
        return []

    matcher = build_matcher(algorithm)
    pairs = matcher.knnMatch(reference.descriptors, base_test.descriptors, k=2)
    proposal_ratio = min(0.90, ratio_threshold + 0.14)
    tentative = [
        pair[0]
        for pair in pairs
        if len(pair) == 2 and pair[0].distance < proposal_ratio * pair[1].distance
    ]
    if len(tentative) < 4:
        return []

    points = np.float32([base_test.keypoints[m.trainIdx].pt for m in tentative])
    components = spatial_match_components(points, base_test.image.shape, radius=0.14)
    if not components:
        return []

    full_h, full_w = full_image.shape[:2]
    intent = np.asarray(intent_point, dtype=np.float32)
    ranked = []
    for component in components:
        component_points = points[component]
        _, local_box = bounding_crop_from_points(
            base_test.image,
            component_points,
            margin_ratio=0.62,
            min_side=120,
        )
        if local_box is None:
            continue
        view_box = map_box_to_view(base_test, local_box)
        view_box = expand_view_box(full_image.shape, view_box, margin_ratio=0.16, min_side=220)
        if view_box is None:
            continue
        left, top, right, bottom = view_box
        center = np.asarray([(left + right) / 2.0, (top + bottom) / 2.0], dtype=np.float32)
        normalized_distance = float(
            np.linalg.norm((center - intent) / np.asarray([max(1, full_w), max(1, full_h)], dtype=np.float32))
        )
        # Soporte visual manda; la proximidad a la reticula solo desempata.
        rank_score = float(len(component)) * (1.0 + 0.15 * max(0.0, 1.0 - 2.0 * normalized_distance))
        ranked.append((rank_score, view_box))

    ranked.sort(key=lambda item: item[0], reverse=True)
    proposals: List[FeatureSet] = []
    accepted: List[Tuple[int, int, int, int]] = []
    for _, box in ranked:
        if any(boxes_overlap_ratio(box, previous) > 0.84 for previous in accepted):
            continue
        features = extract_original_view_features(
            base_test.label,
            full_image,
            box,
            detector,
            intent_point,
        )
        if features is None or features.count < 2:
            continue
        accepted.append(box)
        proposals.append(features)
        if len(proposals) >= max_proposals:
            break
    return proposals


def bounding_crop_from_points(
    image: np.ndarray,
    points: np.ndarray,
    margin_ratio: float = 0.30,
    min_side: int = 110,
) -> Tuple[np.ndarray, Optional[Tuple[int, int, int, int]]]:
    if points is None or len(points) < 4:
        return image, None
    coordinates = np.asarray(points, dtype=np.float32).reshape(-1, 2)
    if not np.isfinite(coordinates).all():
        return image, None
    x_min, y_min = coordinates.min(axis=0)
    x_max, y_max = coordinates.max(axis=0)
    point_width = float(x_max - x_min)
    point_height = float(y_max - y_min)
    if point_width < 12 or point_height < 12:
        return image, None

    height, width = image.shape[:2]
    crop_width = max(float(min_side), point_width * (1.0 + 2.0 * margin_ratio))
    crop_height = max(float(min_side), point_height * (1.0 + 2.0 * margin_ratio))
    center_x = float((x_min + x_max) / 2.0)
    center_y = float((y_min + y_max) / 2.0)
    left = max(0, int(round(center_x - crop_width / 2.0)))
    top = max(0, int(round(center_y - crop_height / 2.0)))
    right = min(width, int(round(center_x + crop_width / 2.0)))
    bottom = min(height, int(round(center_y + crop_height / 2.0)))
    if right - left < 32 or bottom - top < 32:
        return image, None
    crop_area_ratio = ((right - left) * (bottom - top)) / float(width * height)
    if crop_area_ratio > 0.94:
        return image, None
    return np.ascontiguousarray(image[top:bottom, left:right]), (left, top, right, bottom)


def points_spatial_coverage(points: np.ndarray, shape: tuple) -> float:
    if points is None or len(points) < 2:
        return 0.0
    coordinates = np.asarray(points, dtype=np.float32).reshape(-1, 2)
    span = np.maximum(coordinates.max(axis=0) - coordinates.min(axis=0), 0.0)
    height, width = shape[:2]
    return float(np.clip((span[0] * span[1]) / max(1.0, width * height), 0.0, 1.0))


def points_internal_distribution(points: np.ndarray) -> float:
    if points is None or len(points) < 4:
        return 0.0
    coordinates = np.asarray(points, dtype=np.float32).reshape(-1, 2)
    span = coordinates.max(axis=0) - coordinates.min(axis=0)
    box_area = float(span[0] * span[1])
    if box_area < 16.0:
        return 0.0
    hull = cv2.convexHull(coordinates)
    hull_area = float(abs(cv2.contourArea(hull)))
    return float(np.clip(hull_area / box_area, 0.0, 1.0))


def points_shape_spread(points: np.ndarray) -> float:
    if points is None or len(points) < 4:
        return 0.0
    coordinates = np.asarray(points, dtype=np.float32).reshape(-1, 2)
    centered = coordinates - coordinates.mean(axis=0, keepdims=True)
    covariance = np.cov(centered, rowvar=False)
    eigenvalues = np.linalg.eigvalsh(covariance)
    if len(eigenvalues) < 2 or eigenvalues[-1] <= 1e-6:
        return 0.0
    return float(np.clip(eigenvalues[0] / eigenvalues[-1], 0.0, 1.0))


def homography_is_plausible(homography: Optional[np.ndarray]) -> bool:
    if homography is None:
        return False
    determinant = float(np.linalg.det(homography[:2, :2]))
    if not np.isfinite(determinant) or determinant <= 1e-8:
        return False
    return 0.02 < abs(determinant) < 50.0


def remove_isolated_correspondences(
    src: np.ndarray, dst: np.ndarray, mask: np.ndarray
) -> np.ndarray:
    indices = np.flatnonzero(mask)
    if len(indices) < 7:
        return mask

    def neighbour_mask(points: np.ndarray) -> np.ndarray:
        coordinates = points.reshape(-1, 2)[indices]
        span = np.maximum(coordinates.max(axis=0) - coordinates.min(axis=0), 1.0)
        normalized = (coordinates - coordinates.min(axis=0)) / span
        distances = np.linalg.norm(normalized[:, None, :] - normalized[None, :, :], axis=2)
        np.fill_diagonal(distances, np.inf)
        nearest = distances.min(axis=1)
        median = float(np.median(nearest))
        mad = float(np.median(np.abs(nearest - median)))
        limit = max(0.10, median + 4.0 * max(mad, 0.015))
        return nearest <= limit

    keep_local = neighbour_mask(src) & neighbour_mask(dst)
    if int(keep_local.sum()) < max(5, int(round(len(indices) * 0.65))):
        return mask
    cleaned = np.zeros_like(mask, dtype=bool)
    cleaned[indices[keep_local]] = True
    return cleaned


def estimate_best_geometry(
    src: np.ndarray, dst: np.ndarray, ransac_threshold: float
) -> Tuple[Optional[np.ndarray], np.ndarray, str]:
    empty = np.zeros(len(src), dtype=bool)
    homography, homography_mask = cv2.findHomography(
        src, dst, cv2.RANSAC, ransac_threshold, maxIters=5000, confidence=0.995
    )
    homography_inliers = (
        homography_mask.ravel().astype(bool)
        if homography_mask is not None and homography_is_plausible(homography)
        else empty
    )

    affine, affine_mask = cv2.estimateAffinePartial2D(
        src.reshape(-1, 2),
        dst.reshape(-1, 2),
        method=cv2.RANSAC,
        ransacReprojThreshold=ransac_threshold,
        maxIters=5000,
        confidence=0.995,
        refineIters=10,
    )
    affine_inliers = affine_mask.ravel().astype(bool) if affine_mask is not None else empty
    affine_h = None
    if affine is not None and np.isfinite(affine).all():
        affine_h = np.vstack([affine, [0.0, 0.0, 1.0]])

    source_points = src.reshape(-1, 2)
    span = np.maximum(source_points.max(axis=0) - source_points.min(axis=0), 1.0)
    thin_shape = min(span) / max(span) < 0.22
    if affine_h is not None and (
        thin_shape or int(affine_inliers.sum()) >= int(homography_inliers.sum()) + 3
    ):
        return affine_h, affine_inliers, "Afin (forma estrecha/irregular)"
    if homography is not None and homography_is_plausible(homography):
        return homography, homography_inliers, "Homografia"
    if affine_h is not None:
        return affine_h, affine_inliers, "Afin de respaldo"
    return None, empty, "Sin modelo"


def project_reference_outline(
    shape: tuple,
    homography: np.ndarray,
    canvas: np.ndarray,
    x_offset: int = 0,
    y_offset: int = 0,
) -> None:
    height, width = shape[:2]
    corners = np.float32(
        [[0, 0], [0, height - 1], [width - 1, height - 1], [width - 1, 0]]
    ).reshape(-1, 1, 2)
    projected = cv2.perspectiveTransform(corners, homography)
    projected[:, :, 0] += x_offset
    projected[:, :, 1] += y_offset
    cv2.polylines(canvas, [np.int32(projected)], True, (0, 255, 0), 4, cv2.LINE_AA)


def limit_drawn_matches(
    matches: Sequence, inlier_mask: np.ndarray, max_lines: int
) -> np.ndarray:
    indices = np.flatnonzero(inlier_mask)
    if len(indices) <= max_lines:
        return inlier_mask
    best = sorted(indices, key=lambda i: matches[i].distance)[:max_lines]
    limited = np.zeros_like(inlier_mask)
    limited[best] = True
    return limited


def draw_matches_vertical(
    reference: FeatureSet,
    test: FeatureSet,
    matches: Sequence,
    draw_mask: np.ndarray,
    status_color: Tuple[int, int, int] = (0, 255, 0),
    detected_box: Optional[Tuple[int, int, int, int]] = None,
) -> Tuple[np.ndarray, int]:
    ref_view = reference.view_image if reference.view_image is not None else reference.image
    test_view = test.view_image if test.view_image is not None else test.image
    ref_h, ref_w = ref_view.shape[:2]
    test_h, test_w = test_view.shape[:2]
    canvas = np.zeros((ref_h + test_h, max(ref_w, test_w), 3), dtype=np.uint8)
    canvas[:ref_h, :ref_w] = ref_view
    canvas[ref_h:ref_h + test_h, :test_w] = test_view
    reticle_x, reticle_y = test.intent_point or (test_w / 2.0, test_h / 2.0)
    cv2.drawMarker(
        canvas,
        (int(round(reticle_x)), ref_h + int(round(reticle_y))),
        (255, 0, 255),
        cv2.MARKER_CROSS,
        max(24, min(test_w, test_h) // 12),
        3,
        cv2.LINE_AA,
    )

    overlay = canvas.copy()
    for match, should_draw in zip(matches, draw_mask):
        if not should_draw:
            continue
        x1, y1 = map_point_to_view(reference, reference.keypoints[match.queryIdx].pt)
        x2, y2 = map_point_to_view(test, test.keypoints[match.trainIdx].pt)
        start = (int(round(x1)), int(round(y1)))
        end = (int(round(x2)), int(round(y2)) + ref_h)
        cv2.line(overlay, start, end, status_color, 1, cv2.LINE_AA)
        cv2.circle(overlay, start, 4, (0, 200, 255), 1, cv2.LINE_AA)
        cv2.circle(overlay, end, 4, (0, 200, 255), 1, cv2.LINE_AA)
    cv2.addWeighted(overlay, 0.75, canvas, 0.25, 0, canvas)

    for feature_set, vertical_offset in ((reference, 0), (test, ref_h)):
        left, top, right, bottom = feature_set.view_box or (
            0, 0, feature_set.image.shape[1], feature_set.image.shape[0]
        )
        cv2.rectangle(
            canvas,
            (left, top + vertical_offset),
            (right - 1, bottom - 1 + vertical_offset),
            (255, 180, 0),
            3,
            cv2.LINE_AA,
        )
    if detected_box is not None:
        left, top, right, bottom = detected_box
        cv2.rectangle(
            canvas,
            (left, top + ref_h),
            (right - 1, bottom - 1 + ref_h),
            status_color,
            4,
            cv2.LINE_AA,
        )
    return canvas, ref_h


def draw_matches_horizontal_full(
    reference: FeatureSet,
    test: FeatureSet,
    matches: Sequence,
    draw_mask: np.ndarray,
    status_color: Tuple[int, int, int] = (0, 255, 0),
    detected_box: Optional[Tuple[int, int, int, int]] = None,
) -> Tuple[np.ndarray, int]:
    ref_view = reference.view_image if reference.view_image is not None else reference.image
    test_view = test.view_image if test.view_image is not None else test.image
    ref_h, ref_w = ref_view.shape[:2]
    test_h, test_w = test_view.shape[:2]
    canvas = np.zeros((max(ref_h, test_h), ref_w + test_w, 3), dtype=np.uint8)
    canvas[:ref_h, :ref_w] = ref_view
    canvas[:test_h, ref_w:ref_w + test_w] = test_view
    reticle_x, reticle_y = test.intent_point or (test_w / 2.0, test_h / 2.0)
    cv2.drawMarker(
        canvas,
        (ref_w + int(round(reticle_x)), int(round(reticle_y))),
        (255, 0, 255),
        cv2.MARKER_CROSS,
        max(24, min(test_w, test_h) // 12),
        3,
        cv2.LINE_AA,
    )
    overlay = canvas.copy()
    for match, should_draw in zip(matches, draw_mask):
        if not should_draw:
            continue
        x1, y1 = map_point_to_view(reference, reference.keypoints[match.queryIdx].pt)
        x2, y2 = map_point_to_view(test, test.keypoints[match.trainIdx].pt)
        start = (int(round(x1)), int(round(y1)))
        end = (int(round(x2)) + ref_w, int(round(y2)))
        cv2.line(overlay, start, end, status_color, 1, cv2.LINE_AA)
        cv2.circle(overlay, start, 4, (0, 200, 255), 1, cv2.LINE_AA)
        cv2.circle(overlay, end, 4, (0, 200, 255), 1, cv2.LINE_AA)
    cv2.addWeighted(overlay, 0.75, canvas, 0.25, 0, canvas)
    for feature_set, x_offset in ((reference, 0), (test, ref_w)):
        left, top, right, bottom = feature_set.view_box or (
            0, 0, feature_set.image.shape[1], feature_set.image.shape[0]
        )
        cv2.rectangle(
            canvas,
            (left + x_offset, top),
            (right - 1 + x_offset, bottom - 1),
            (255, 180, 0),
            3,
            cv2.LINE_AA,
        )
    if detected_box is not None:
        left, top, right, bottom = detected_box
        cv2.rectangle(
            canvas,
            (left + ref_w, top),
            (right - 1 + ref_w, bottom - 1),
            status_color,
            4,
            cv2.LINE_AA,
        )
    return canvas, ref_w


def compare_feature_sets(
    reference: FeatureSet,
    test: FeatureSet,
    algorithm: str = "ORB",
    ratio_threshold: float = 0.75,
    ransac_threshold: float = 5.0,
    min_inliers_match: int = 25,
    min_inliers_ambiguous: int = 12,
    draw: bool = False,
    stacked: bool = False,
    max_lines: int = 60,
    detector=None,
    refine: bool = True,
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
    homography, inlier_mask, geometry_model = estimate_best_geometry(
        src, dst, ransac_threshold
    )
    raw_inliers = int(inlier_mask.sum())
    inlier_mask = remove_isolated_correspondences(src, dst, inlier_mask)
    inliers = int(inlier_mask.sum())
    foreground_ratio = inliers / max(1, raw_inliers)
    inlier_ratio = inliers / len(good_matches)
    plausible = homography_is_plausible(homography)

    ref_inlier_points = src.reshape(-1, 2)[inlier_mask]
    test_inlier_points = dst.reshape(-1, 2)[inlier_mask]
    spatial_coverage = min(
        points_spatial_coverage(ref_inlier_points, reference.image.shape),
        points_spatial_coverage(test_inlier_points, test.image.shape),
    )
    internal_distribution = min(
        points_internal_distribution(ref_inlier_points),
        points_internal_distribution(test_inlier_points),
    )
    shape_spread = min(
        points_shape_spread(ref_inlier_points),
        points_shape_spread(test_inlier_points),
    )
    full_test_shape = (
        test.view_image.shape if test.view_image is not None else test.image.shape
    )
    intent_box = feature_points_box_in_view(test, test_inlier_points)
    intent_ok = bool(
        intent_box is not None
        and box_intersects_intent_zone(
            intent_box, full_test_shape, intent_point=test.intent_point
        )
    )
    is_affine = geometry_model.startswith("Afin")
    distribution_ok = internal_distribution >= (0.025 if is_affine else 0.060)
    non_collinear = shape_spread >= (0.0015 if is_affine else 0.0080)
    geometry_supported = plausible and distribution_ok and non_collinear and intent_ok
    aim_score, target_distance, detected_box = target_intent_metrics(
        test, test_inlier_points
    )

    evidence = min(1.0, inliers / float(min_inliers_match))
    score = 100.0 * inlier_ratio * (evidence ** 2)
    if not plausible:
        score *= 0.25
    if not distribution_ok or not non_collinear:
        score *= 0.20
    if not intent_ok:
        score *= 0.20
    target_score = score * (0.25 + 0.75 * aim_score)

    if geometry_supported and inliers >= min_inliers_match and inlier_ratio >= 0.45:
        verdict = "MATCH"
        message = "La geometria es consistente: es el mismo objeto/fotografia."
    elif (
        geometry_supported
        and inliers >= min_inliers_ambiguous
        and inlier_ratio >= 0.35
    ):
        verdict = "AMBIGUOUS"
        message = (
            "Hay coincidencias, pero la evidencia geometrica es debil. "
            "Repite la captura con mejor enfoque, luz o encuadre."
        )
    elif (
        plausible
        and intent_ok
        and inliers >= max(18, min_inliers_ambiguous)
        and inlier_ratio >= 0.45
        and (not distribution_ok or not non_collinear)
    ):
        verdict = "REPETIR FOTO"
        message = (
            "Hay indicios de una posible coincidencia, pero el objeto ocupa muy pocos "
            "pixeles o sus detalles quedan concentrados. Acercalo y repite la foto."
        )
    else:
        verdict = "NO MATCH"
        if not intent_ok and inliers >= min_inliers_ambiguous:
            message = "Coincidencias descartadas: la region queda fuera de la zona de intencion."
        elif (not distribution_ok or not non_collinear) and inliers >= min_inliers_ambiguous:
            message = "Coincidencias descartadas: los puntos forman una franja o grupo degenerado."
        else:
            message = "No hay estructura comun suficiente: objetos distintos."

    result.inliers = inliers
    result.inlier_ratio = inlier_ratio
    result.score = round(score, 1)
    result.verdict = verdict
    result.message = message
    result.spatial_coverage = spatial_coverage
    result.internal_distribution = internal_distribution
    result.shape_spread = shape_spread
    result.intent_ok = intent_ok
    result.aim_score = aim_score
    result.target_score = round(target_score, 1)
    result.target_distance = target_distance
    result.detected_box = detected_box
    result.geometry_model = geometry_model
    result.foreground_ratio = foreground_ratio

    if refine and detector is not None and plausible and inliers >= 5 and inlier_ratio >= 0.30:
        ref_crop, ref_box = bounding_crop_from_points(reference.image, ref_inlier_points)
        test_crop, test_box = bounding_crop_from_points(test.image, test_inlier_points)
        if ref_box is not None or test_box is not None:
            if ref_box is None:
                ref_box = (0, 0, reference.image.shape[1], reference.image.shape[0])
            if test_box is None:
                test_box = (0, 0, test.image.shape[1], test.image.shape[0])
            refined_reference = extract_cropped_features(reference, ref_crop, ref_box, detector)
            refined_test = extract_cropped_features(test, test_crop, test_box, detector)
            refined = compare_feature_sets(
                refined_reference,
                refined_test,
                algorithm=algorithm,
                ratio_threshold=ratio_threshold,
                ransac_threshold=ransac_threshold,
                min_inliers_match=min_inliers_match,
                min_inliers_ambiguous=min_inliers_ambiguous,
                draw=draw,
                stacked=stacked,
                max_lines=max_lines,
                detector=None,
                refine=False,
            )
            refined.localized = True
            refined.localization_note = "Segunda pasada sobre regiones localizadas por inliers"
            refined.reference_box = refined_reference.view_box
            refined.test_box = refined_test.view_box
            refined.search_scale = result.search_scale
            if refined.score >= result.score * 0.85 or refined.inliers >= result.inliers:
                return refined
            result.localization_note = "Descartada: el recorte reducia demasiado la evidencia"
            result.reference_box = map_box_to_view(reference, ref_box)
            result.test_box = map_box_to_view(test, test_box)

    if draw:
        draw_mask = limit_drawn_matches(good_matches, inlier_mask, max_lines)
        status_color = (
            (0, 210, 0) if verdict == "MATCH" else
            (0, 180, 255) if verdict in ("AMBIGUOUS", "REPETIR FOTO") else
            (145, 145, 145)
        )
        if stacked:
            visualization, _ = draw_matches_vertical(
                reference,
                test,
                good_matches,
                draw_mask,
                status_color=status_color,
                detected_box=detected_box,
            )
        else:
            visualization, _ = draw_matches_horizontal_full(
                reference,
                test,
                good_matches,
                draw_mask,
                status_color=status_color,
                detected_box=detected_box,
            )
        result.visualization = visualization

    return result


def image_digest(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()[:20]


def image_array_digest(image: np.ndarray) -> str:
    h = hashlib.sha1()
    h.update(str(image.shape).encode("ascii"))
    h.update(image.tobytes())
    return h.hexdigest()[:20]


def make_feature_view(base: FeatureSet, intent_point: Tuple[float, float]) -> FeatureSet:
    """Reutiliza descriptores ya calculados y solo cambia la intencion."""
    return FeatureSet(
        label=base.label,
        image=base.image,
        keypoints=base.keypoints,
        descriptors=base.descriptors,
        view_image=base.view_image,
        view_box=base.view_box,
        intent_point=intent_point,
    )


def prepare_reference_identity(
    selected: np.ndarray,
    correct_perspective: bool,
    applied: str,
) -> Tuple[np.ndarray, str, float]:
    started = perf_counter()
    isolated, rectangle_found, _ = (
        isolate_planar_object(selected)
        if correct_perspective
        else (selected, False, 0.0)
    )
    if rectangle_found:
        prepared = isolated
        applied += " + perspectiva rectangular corregida"
    else:
        prepared = normalize_isolated_size(selected)
    prepared = resize_to_limit(prepared, MAX_DIMENSION)
    return prepared, applied, (perf_counter() - started) * 1000.0


def postprocess_results(
    results: List[MatchResult],
    min_inliers_match: int,
) -> bool:
    """V10.7: mismo reconocimiento, arbitraje de intencion mas estricto.

    La identidad visual sigue decidiendose exactamente con los veredictos ya
    calculados por compare_feature_sets. Aqui SOLO se decide cual de varios
    MATCH validos es el objeto que el usuario quiere abrir con la reticula.

    Correccion principal respecto a V10.6:
    - si un MATCH esta claramente mas alineado con la reticula, gana aunque
      otro MATCH tenga una evidencia visual algo mayor;
    - solo se pide REPETIR FOTO cuando dos MATCH estan realmente cerca tanto
      en puntuacion objetivo como en afinidad a la reticula;
    - la diferencia de afinidad se compara en valor absoluto, evitando que un
      candidato con menor afinidad se considere ambiguo solo por el signo.
    """
    results.sort(key=lambda item: item.sort_key, reverse=True)

    # Match adaptativo: sin cambios respecto a V10.6/V10.1.
    if results:
        candidate = results[0]
        runner_score = results[1].score if len(results) > 1 else 0.0
        runner_inliers = results[1].inliers if len(results) > 1 else 0
        strong_margin = (
            candidate.score >= runner_score + 12.0
            and candidate.inliers >= runner_inliers + 6
        )
        is_affine = candidate.geometry_model.startswith("Afin")
        distribution_ok = (
            candidate.internal_distribution >= (0.025 if is_affine else 0.060)
            and candidate.shape_spread >= (0.0015 if is_affine else 0.0080)
            and candidate.intent_ok
        )
        adaptive_match = (
            candidate.verdict == "AMBIGUOUS"
            and 18 <= candidate.inliers < min_inliers_match
            and candidate.inlier_ratio >= 0.65
            and distribution_ok
            and strong_margin
        )
        if adaptive_match:
            candidate.verdict = "MATCH"
            candidate.message = (
                "Match adaptativo: objeto pequeno con geometria consistente, "
                "inliers distribuidos y ventaja clara sobre el segundo candidato."
            )

    for item in results:
        if item.verdict == "AMBIGUOUS":
            item.verdict = "REPETIR FOTO"
            item.message = (
                "Hay una posible coincidencia, pero la evidencia no permite confirmarla. "
                "Repite la foto con el objeto mas cerca, centrado y bien enfocado."
            )

    results.sort(key=lambda item: item.sort_key, reverse=True)
    matched = [item for item in results if item.verdict == "MATCH"]
    for item in results:
        item.role = "RECHAZADO"

    target_uncertain = False
    selected_target: Optional[MatchResult] = None

    if matched:
        # Dos rankings separados:
        # 1) fuerza objetivo combinada que ya existia;
        # 2) alineacion pura con la reticula.
        by_target = sorted(
            matched,
            key=lambda item: (item.target_score, item.score, item.inliers),
            reverse=True,
        )
        by_aim = sorted(
            matched,
            key=lambda item: (
                item.aim_score,
                -item.target_distance,
                item.target_score,
                item.score,
            ),
            reverse=True,
        )

        score_leader = by_target[0]
        aim_leader = by_aim[0]
        second_aim = by_aim[1].aim_score if len(by_aim) > 1 else 0.0
        aim_lead = aim_leader.aim_score - second_aim
        target_score_deficit = score_leader.target_score - aim_leader.target_score

        # Si la reticula distingue claramente uno de los MATCH, la intencion
        # debe ganar. Todos los candidatos de 'matched' ya superaron las mismas
        # barreras visuales; aqui no estamos relajando ningun umbral de MATCH.
        clear_reticle_winner = (
            len(matched) > 1
            and aim_leader.aim_score >= 0.90
            and aim_lead >= 0.12
            and target_score_deficit <= 18.0
        )
        selected_target = aim_leader if clear_reticle_winner else score_leader

        selected_target.role = "OBJETIVO"
        for item in matched:
            if item is not selected_target:
                item.role = "SECUNDARIO"

        if selected_target.aim_score < 0.35:
            target_uncertain = True
            selected_target.role = "CAPTURA INSUFICIENTE"
            selected_target.verdict = "REPETIR FOTO"
            selected_target.message = (
                "El objeto aparece, pero queda demasiado apartado de la reticula. "
                "Centrarlo evita abrir un recuerdo secundario por accidente."
            )

        if len(matched) > 1 and not target_uncertain:
            # El competidor relevante es el otro MATCH mejor alineado / puntuado.
            competitors = [item for item in matched if item is not selected_target]
            competitor = max(
                competitors,
                key=lambda item: (
                    item.target_score,
                    item.aim_score,
                    item.score,
                    item.inliers,
                ),
            )
            target_gap = abs(selected_target.target_score - competitor.target_score)
            aim_gap = abs(selected_target.aim_score - competitor.aim_score)

            # V10.6 usaba un gap de afinidad con signo. Si el primero por score
            # tenia MENOS afinidad, el valor negativo siempre cumplia < 0.10 y
            # podia producir REPETIR FOTO aunque la reticula diferenciase 98/82.
            competing_targets = target_gap < 8.0 and aim_gap < 0.10
            if competing_targets:
                target_uncertain = True
                selected_target.role = "CAPTURA INSUFICIENTE"
                selected_target.verdict = "REPETIR FOTO"
                selected_target.message = (
                    "Hay dos objetos registrados realmente muy proximos a la reticula. "
                    "Acerca o centra el que quieras abrir."
                )

    elif results and results[0].verdict == "REPETIR FOTO":
        results[0].role = "CAPTURA INSUFICIENTE"

    # La tabla debe mostrar primero el objeto que realmente se abriria, despues
    # secundarios validos y finalmente los rechazados. No cambia los scores.
    if selected_target is not None:
        role_rank = {
            "OBJETIVO": 3,
            "CAPTURA INSUFICIENTE": 3,
            "SECUNDARIO": 2,
            "RECHAZADO": 1,
        }
        results.sort(
            key=lambda item: (
                role_rank.get(item.role, 0),
                item.target_score,
                item.score,
                item.inliers,
            ),
            reverse=True,
        )

    return target_uncertain


# --------------------------------------------------------------------------- #
# Adaptador web/API: estado independiente de Streamlit
# --------------------------------------------------------------------------- #

@dataclass
class ReferenceRecord:
    reference_id: str
    name: str
    image: np.ndarray
    memory_id: Optional[str] = None
    image_url: Optional[str] = None


class VisionEngine:
    """V10.7 sin Streamlit, preparado para FastAPI/Vercel.

    Los caches son una optimizacion de instancia caliente. No son persistencia.
    La base de datos / storage de la web sigue siendo la fuente de verdad.
    """

    def __init__(self):
        self._reference_features: Dict[tuple, FeatureSet] = {}
        self._scan_features: Dict[tuple, FeatureSet] = {}

    def clear_caches(self) -> None:
        self._reference_features.clear()
        self._scan_features.clear()

    def _reference_features_for(self, ref: ReferenceRecord, algorithm: str, max_features: int, detector):
        digest = image_array_digest(ref.image)
        key = (ref.reference_id, digest, algorithm, int(max_features))
        cached = self._reference_features.get(key)
        if cached is not None:
            return cached, 0.0, True
        started = perf_counter()
        features = extract_features(ref.reference_id, ref.image, detector)
        elapsed = (perf_counter() - started) * 1000.0
        self._reference_features[key] = features
        if len(self._reference_features) > 256:
            # Cache oportunista: Vercel puede destruir la instancia en cualquier momento.
            self._reference_features = dict(list(self._reference_features.items())[-128:])
        return features, elapsed, False

    def _scan_features_for(self, scan_id: str, label: str, image: np.ndarray, algorithm: str, max_features: int, detector):
        key = (scan_id, algorithm, int(max_features))
        cached = self._scan_features.get(key)
        if cached is not None:
            return cached, 0.0, True
        started = perf_counter()
        features = extract_features(
            label,
            image,
            detector,
            view_image=image,
            view_box=(0, 0, image.shape[1], image.shape[0]),
        )
        elapsed = (perf_counter() - started) * 1000.0
        self._scan_features[key] = features
        if len(self._scan_features) > 8:
            self._scan_features = {key: features}
        return features, elapsed, False

    def analyze(
        self,
        test_image: np.ndarray,
        references: List[ReferenceRecord],
        reticle_point: Tuple[float, float],
        algorithm: str = "ORB",
        max_features: int = 2000,
        ratio_threshold: float = 0.75,
        ransac_threshold: float = 5.0,
        min_inliers_match: int = 25,
        min_inliers_ambiguous: int = 12,
        test_label: str = "scan",
    ) -> dict:
        if not references:
            raise ValueError("No hay referencias para comparar.")

        scan_id = image_array_digest(test_image)
        timings = []
        total_started = perf_counter()

        detector_started = perf_counter()
        detector = build_detector(algorithm, max_features)
        timings.append({
            "stage": f"Preparar detector {algorithm}",
            "ms": round((perf_counter() - detector_started) * 1000.0, 1),
            "cache": False,
        })

        scan_features_base, scan_feature_ms, scan_hit = self._scan_features_for(
            scan_id, test_label, test_image, algorithm, max_features, detector
        )
        timings.append({
            "stage": f"Features escaneo global ({algorithm})",
            "ms": round(scan_feature_ms, 1),
            "cache": scan_hit,
        })
        test_features = make_feature_view(scan_features_base, reticle_point)
        if test_features.count < 2:
            raise RuntimeError(
                "La imagen de prueba apenas tiene textura detectable. Prueba con una captura mas nitida o mejor iluminada."
            )

        comparison_args = dict(
            algorithm=algorithm,
            ratio_threshold=ratio_threshold,
            ransac_threshold=ransac_threshold,
            min_inliers_match=min_inliers_match,
            min_inliers_ambiguous=min_inliers_ambiguous,
            detector=detector,
        )

        refs_by_id = {r.reference_id: r for r in references}
        ref_ids_in_order = [r.reference_id for r in references]
        selected_reference_sets: Dict[str, FeatureSet] = {}
        selected_test_sets: Dict[str, FeatureSet] = {}
        selected_compare_args: Dict[str, dict] = {}
        reference_sets: Dict[str, FeatureSet] = {}
        base_results: Dict[str, MatchResult] = {}
        result_by_id: Dict[str, MatchResult] = {}

        # FASE 1: busqueda global/dinamica V10.7.
        for ref_id in ref_ids_in_order:
            ref = refs_by_id[ref_id]
            ref_features, ref_ms, ref_hit = self._reference_features_for(
                ref, algorithm, max_features, detector
            )
            reference_sets[ref_id] = ref_features
            if ref_ms > 0 or not ref_hit:
                timings.append({"stage": f"Features referencia: {ref.name}", "ms": round(ref_ms, 1), "cache": ref_hit})

            started = perf_counter()
            base_result = compare_feature_sets(ref_features, test_features, **comparison_args)
            base_result.search_scale = "Completa"
            base_result.search_method = "Imagen completa"
            base_results[ref_id] = base_result

            candidates = [base_result]
            candidate_sets = [test_features]
            if base_result.verdict != "MATCH":
                for proposal in build_dynamic_proposals(
                    ref_features, test_features, detector, algorithm, ratio_threshold
                ):
                    candidate = compare_feature_sets(ref_features, proposal, **comparison_args)
                    candidate.search_scale = "Adaptativa"
                    candidate.search_method = "Grupo de matches preliminares"
                    candidates.append(candidate)
                    candidate_sets.append(proposal)

            best_index = max(range(len(candidates)), key=lambda i: candidates[i].sort_key)
            result_by_id[ref_id] = candidates[best_index]
            selected_reference_sets[ref_id] = ref_features
            selected_test_sets[ref_id] = candidate_sets[best_index]
            selected_compare_args[ref_id] = comparison_args
            timings.append({"stage": f"Comparar global: {ref.name}", "ms": round((perf_counter()-started)*1000.0,1), "cache": False})

        def has_clear_target_candidate() -> bool:
            return any(
                item.verdict == "MATCH" and item.aim_score >= 0.72
                for item in result_by_id.values()
            )

        # FASE 2: alta resolucion alrededor de la reticula.
        reticle_hr_views: List[Tuple[str, FeatureSet]] = []
        if not has_clear_target_candidate():
            started = perf_counter()
            reticle_hr_views = build_reticle_highres_views(
                test_label, test_image, reticle_point, detector
            )
            timings.append({"stage": f"Preparar reticula HR ({len(reticle_hr_views)} escalas)", "ms": round((perf_counter()-started)*1000.0,1), "cache": False})
            for ref_id in ref_ids_in_order:
                current = result_by_id[ref_id]
                if current.verdict == "MATCH":
                    continue
                ref_features = reference_sets[ref_id]
                started = perf_counter()
                best_result = current
                best_test = selected_test_sets[ref_id]
                for scale_note, hr_view in reticle_hr_views:
                    candidate = compare_feature_sets(ref_features, hr_view, **comparison_args)
                    candidate.search_scale = f"Reticula HR {scale_note}"
                    candidate.search_method = f"Alta resolucion alrededor de reticula ({scale_note})"
                    if candidate.sort_key > best_result.sort_key:
                        best_result = candidate
                        best_test = hr_view
                if best_result is not current:
                    result_by_id[ref_id] = best_result
                    selected_test_sets[ref_id] = best_test
                timings.append({"stage": f"Rescate reticula HR: {refs_by_id[ref_id].name}", "ms": round((perf_counter()-started)*1000.0,1), "cache": False})

        # FASE 3: rescate local HR de candidatos debiles/secundarios.
        rescue_ids = [
            ref_id for ref_id in ref_ids_in_order
            if result_by_id[ref_id].verdict != "MATCH"
            and (
                base_results[ref_id].good_matches >= 6
                or base_results[ref_id].inliers >= 3
                or result_by_id[ref_id].good_matches >= 6
                or result_by_id[ref_id].inliers >= 3
            )
        ]
        rescue_ids.sort(
            key=lambda rid: (
                max(base_results[rid].inliers, result_by_id[rid].inliers),
                max(base_results[rid].good_matches, result_by_id[rid].good_matches),
                result_by_id[rid].target_score,
            ),
            reverse=True,
        )
        rescue_ids = rescue_ids[: min(8, len(rescue_ids))]

        for ref_id in rescue_ids:
            started = perf_counter()
            ref_features = reference_sets[ref_id]
            best_result = result_by_id[ref_id]
            best_test = selected_test_sets[ref_id]
            proposals = build_highres_local_proposals(
                ref_features, test_features, test_image, detector, algorithm,
                ratio_threshold, reticle_point, max_proposals=2,
            )
            for proposal in proposals:
                candidate = compare_feature_sets(ref_features, proposal, **comparison_args)
                candidate.search_scale = "Local HR"
                candidate.search_method = "Alta resolucion por matches preliminares"
                if candidate.sort_key > best_result.sort_key:
                    best_result = candidate
                    best_test = proposal
            if best_result is not result_by_id[ref_id]:
                result_by_id[ref_id] = best_result
                selected_test_sets[ref_id] = best_test
            timings.append({"stage": f"Rescate local HR: {refs_by_id[ref_id].name}", "ms": round((perf_counter()-started)*1000.0,1), "cache": False})

        # FASE 4: SIFT de respaldo, mismos criterios de aceptacion.
        sift_used = False
        if algorithm == "ORB" and hasattr(cv2, "SIFT_create"):
            current_matches = [rid for rid in ref_ids_in_order if result_by_id[rid].verdict == "MATCH"]
            if not current_matches:
                if len(ref_ids_in_order) <= 12:
                    sift_ids = list(ref_ids_in_order)
                else:
                    sift_ids = sorted(
                        ref_ids_in_order,
                        key=lambda rid: (
                            result_by_id[rid].target_score,
                            result_by_id[rid].inliers,
                            result_by_id[rid].good_matches,
                            result_by_id[rid].aim_score,
                        ),
                        reverse=True,
                    )[:6]
            else:
                sift_ids = [rid for rid in rescue_ids if result_by_id[rid].verdict != "MATCH"][:4]

            if sift_ids:
                sift_used = True
                sift_started = perf_counter()
                sift_detector = build_detector("SIFT", min(max_features, 2500))
                sift_base, sift_scan_ms, sift_scan_hit = self._scan_features_for(
                    scan_id, test_label, test_image, "SIFT", min(max_features, 2500), sift_detector
                )
                timings.append({"stage": "Features escaneo global (SIFT)", "ms": round(sift_scan_ms,1), "cache": sift_scan_hit})
                sift_test = make_feature_view(sift_base, reticle_point)
                sift_args = dict(
                    algorithm="SIFT",
                    ratio_threshold=min(ratio_threshold, 0.75),
                    ransac_threshold=ransac_threshold,
                    min_inliers_match=min_inliers_match,
                    min_inliers_ambiguous=min_inliers_ambiguous,
                    detector=sift_detector,
                )
                need_sift_reticle = not has_clear_target_candidate()
                sift_reticle_views = build_reticle_highres_views(
                    test_label, test_image, reticle_point, sift_detector
                ) if need_sift_reticle else []

                for ref_id in sift_ids:
                    ref = refs_by_id[ref_id]
                    started = perf_counter()
                    sift_reference, sift_ref_ms, sift_ref_hit = self._reference_features_for(
                        ref, "SIFT", min(max_features, 2500), sift_detector
                    )
                    if sift_ref_ms > 0 or not sift_ref_hit:
                        timings.append({"stage": f"Features SIFT ref: {ref.name}", "ms": round(sift_ref_ms,1), "cache": sift_ref_hit})

                    candidates=[]
                    test_sets=[]
                    full_candidate = compare_feature_sets(sift_reference, sift_test, **sift_args)
                    full_candidate.search_scale="Completa"
                    full_candidate.search_method="SIFT de respaldo"
                    candidates.append(full_candidate); test_sets.append(sift_test)
                    for proposal in build_dynamic_proposals(
                        sift_reference, sift_test, sift_detector, "SIFT", min(ratio_threshold, 0.75)
                    ):
                        candidate=compare_feature_sets(sift_reference, proposal, **sift_args)
                        candidate.search_scale="Adaptativa"
                        candidate.search_method="SIFT + region dinamica"
                        candidates.append(candidate); test_sets.append(proposal)
                    for scale_note, hr_view in sift_reticle_views:
                        candidate=compare_feature_sets(sift_reference, hr_view, **sift_args)
                        candidate.search_scale=f"Reticula HR {scale_note}"
                        candidate.search_method=f"SIFT + reticula alta resolucion ({scale_note})"
                        candidates.append(candidate); test_sets.append(hr_view)
                    for proposal in build_highres_local_proposals(
                        sift_reference, sift_test, test_image, sift_detector, "SIFT",
                        min(ratio_threshold, 0.75), reticle_point, max_proposals=2,
                    ):
                        candidate=compare_feature_sets(sift_reference, proposal, **sift_args)
                        candidate.search_scale="Local HR"
                        candidate.search_method="SIFT + alta resolucion por matches preliminares"
                        candidates.append(candidate); test_sets.append(proposal)

                    best_index=max(range(len(candidates)), key=lambda i:candidates[i].sort_key)
                    if candidates[best_index].sort_key > result_by_id[ref_id].sort_key:
                        result_by_id[ref_id]=candidates[best_index]
                        selected_reference_sets[ref_id]=sift_reference
                        selected_test_sets[ref_id]=test_sets[best_index]
                        selected_compare_args[ref_id]=sift_args
                    timings.append({"stage": f"Comparar SIFT: {ref.name}", "ms": round((perf_counter()-started)*1000.0,1), "cache": False})
                timings.append({"stage":"SIFT respaldo total","ms":round((perf_counter()-sift_started)*1000.0,1),"cache":False})

        results=list(result_by_id.values())
        target_uncertain=postprocess_results(results, min_inliers_match)
        total_ms=(perf_counter()-total_started)*1000.0
        timings.append({"stage":"TOTAL ANALISIS","ms":round(total_ms,1),"cache":False})

        serialized=[]
        for result in results:
            ref=refs_by_id[result.label]
            serialized.append(result_to_dict(result, ref))

        objective=next((x for x in serialized if x["role"]=="OBJETIVO" and x["verdict"]=="MATCH"), None)
        if target_uncertain:
            overall="REPETIR FOTO"
        elif objective is not None:
            overall="MATCH"
        elif any(x["verdict"]=="REPETIR FOTO" for x in serialized):
            overall="REPETIR FOTO"
        else:
            overall="NO MATCH"

        return {
            "engine_version":"10.7-web",
            "verdict":overall,
            "target":objective,
            "secondary":[x for x in serialized if x["role"]=="SECUNDARIO" and x["verdict"]=="MATCH"],
            "ranking":serialized,
            "target_uncertain":target_uncertain,
            "timings":timings,
            "total_ms":round(total_ms,1),
            "sift_used":sift_used,
            "quality":analyze_capture_quality(test_image),
        }


def result_to_dict(result: MatchResult, ref: ReferenceRecord) -> dict:
    return {
        "reference_id": ref.reference_id,
        "memory_id": ref.memory_id,
        "name": ref.name,
        "role": result.role,
        "verdict": result.verdict,
        "message": result.message,
        "evidence": result.score,
        "target_score": result.target_score,
        "reticle_affinity": round(result.aim_score * 100.0, 1),
        "keypoints_reference": result.keypoints_ref,
        "keypoints_scan": result.keypoints_test,
        "matches_lowe": result.good_matches,
        "inliers": result.inliers,
        "inlier_ratio": round(result.inlier_ratio, 4),
        "frame_coverage": round(result.spatial_coverage, 4),
        "internal_distribution": round(result.internal_distribution, 4),
        "shape_spread": round(result.shape_spread, 6),
        "intent_ok": result.intent_ok,
        "geometry": result.geometry_model,
        "search_method": result.search_method,
        "search_scale": result.search_scale,
        "spatial_retention": round(result.foreground_ratio, 4),
        "detected_box": list(result.detected_box) if result.detected_box else None,
    }


def suggest_reference_box_at_intent(image: np.ndarray, intent_normalized=(0.5,0.5)):
    """Adapta el auto-recorte V10.7 a una reticula de registro.

    La V10.7 de Streamlit esperaba el objeto aproximadamente centrado. En la web
    la reticula puede moverse: recortamos una ventana amplia alrededor de ella,
    ejecutamos la misma propuesta V10.7 y traducimos la caja a la foto original.
    """
    h,w=image.shape[:2]
    nx=float(np.clip(intent_normalized[0],0.0,1.0)); ny=float(np.clip(intent_normalized[1],0.0,1.0))
    if abs(nx-0.5)<0.08 and abs(ny-0.5)<0.08:
        return suggest_reference_box(image)
    cx,cy=nx*w,ny*h
    win_w=max(96,int(round(w*0.78))); win_h=max(96,int(round(h*0.78)))
    left=int(round(cx-win_w/2)); top=int(round(cy-win_h/2))
    left=max(0,min(left,w-win_w)); top=max(0,min(top,h-win_h))
    right=min(w,left+win_w); bottom=min(h,top+win_h)
    roi=np.ascontiguousarray(image[top:bottom,left:right])
    box,note=suggest_reference_box(roi)
    return (box[0]+left,box[1]+top,box[2]+left,box[3]+top), note+"; centrado en reticula"
