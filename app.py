"""Prueba de concepto: reconocimiento de objetos / fotografias impresas
mediante features clasicas de OpenCV (ORB / SIFT) + verificacion geometrica.

Permite registrar varias imagenes de referencia y buscar cual de ellas
corresponde a la imagen escaneada. Preparada para uso desde el movil.

Ejecutar con:  streamlit run app.py
"""

from dataclasses import dataclass, field
from io import BytesIO
from typing import List, Optional, Sequence, Tuple

import cv2
import numpy as np
import streamlit as st
from PIL import Image, ImageOps

MAX_DIMENSION = 1000  # lado mayor al que se normalizan las imagenes de entrada
RENDER_WIDTH = 1200   # ancho maximo del panel de matches que se muestra en la web
VERDICT_RANK = {"MATCH": 2, "AMBIGUOUS": 1, "NO MATCH": 0}
UPLOAD_TYPES = ["jpg", "jpeg", "png", "webp", "bmp", "heic"]


# --------------------------------------------------------------------------- #
# Nucleo de vision artificial
# --------------------------------------------------------------------------- #

@dataclass
class FeatureSet:
    """Imagen normalizada junto con sus keypoints y descriptores."""

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
    visualization: Optional[np.ndarray] = None

    @property
    def sort_key(self) -> Tuple[int, float, int]:
        return (VERDICT_RANK[self.verdict], self.score, self.inliers)


def decode_image(file_bytes: bytes) -> Optional[np.ndarray]:
    """Decodifica a BGR respetando la orientacion EXIF.

    Las fotos de moviles suelen venir con la rotacion guardada solo en los
    metadatos EXIF; sin aplicarla, referencia y escaneo se mostrarian girados.
    """
    try:
        with Image.open(BytesIO(file_bytes)) as handle:
            oriented = ImageOps.exif_transpose(handle).convert("RGB")
            return np.ascontiguousarray(np.asarray(oriented)[:, :, ::-1])
    except Exception:
        buffer = np.frombuffer(file_bytes, dtype=np.uint8)
        decoded = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
        return decoded


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
    """Escala de grises + CLAHE para robustez frente a cambios de iluminacion."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return clahe.apply(gray)


def build_detector(algorithm: str, max_features: int):
    if algorithm == "SIFT":
        if not hasattr(cv2, "SIFT_create"):
            raise RuntimeError(
                "Esta build de OpenCV no incluye SIFT. Usa ORB o instala opencv-contrib-python."
            )
        return cv2.SIFT_create(nfeatures=max_features)
    return cv2.ORB_create(nfeatures=max_features, scaleFactor=1.2, nlevels=8)


def build_matcher(algorithm: str) -> cv2.BFMatcher:
    # ORB devuelve descriptores binarios -> Hamming; SIFT es de punto flotante -> L2.
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


def homography_is_plausible(homography: Optional[np.ndarray]) -> bool:
    """Descarta homografias degeneradas (reflejos, colapsos, escalas absurdas)."""
    if homography is None:
        return False
    determinant = float(np.linalg.det(homography[:2, :2]))
    if not np.isfinite(determinant) or determinant <= 1e-8:
        return False
    return 0.02 < abs(determinant) < 50.0


def project_reference_outline(
    shape: tuple,
    homography: np.ndarray,
    canvas: np.ndarray,
    x_offset: int = 0,
    y_offset: int = 0,
) -> None:
    """Dibuja sobre la imagen de prueba donde ha quedado la referencia."""
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
    """Deja para dibujar solo los mejores inliers.

    Con cientos de inliers las lineas tapan la imagen y el panel deja de servir
    como diagnostico, sobre todo en pantallas de movil.
    """
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
) -> Tuple[np.ndarray, int]:
    """Apila referencia sobre escaneo y une los inliers.

    En un movil el panel horizontal de cv2.drawMatches queda ilegible, asi que
    componemos el mismo diagnostico en vertical. Devuelve el lienzo y el
    desplazamiento vertical aplicado a la imagen de prueba.
    """
    ref_h, ref_w = reference.image.shape[:2]
    test_h, test_w = test.image.shape[:2]
    canvas = np.zeros((ref_h + test_h, max(ref_w, test_w), 3), dtype=np.uint8)
    canvas[:ref_h, :ref_w] = reference.image
    canvas[ref_h:ref_h + test_h, :test_w] = test.image

    overlay = canvas.copy()
    for match, should_draw in zip(matches, draw_mask):
        if not should_draw:
            continue
        x1, y1 = reference.keypoints[match.queryIdx].pt
        x2, y2 = test.keypoints[match.trainIdx].pt
        start = (int(round(x1)), int(round(y1)))
        end = (int(round(x2)), int(round(y2)) + ref_h)
        cv2.line(overlay, start, end, (0, 255, 0), 1, cv2.LINE_AA)
        cv2.circle(overlay, start, 4, (0, 200, 255), 1, cv2.LINE_AA)
        cv2.circle(overlay, end, 4, (0, 200, 255), 1, cv2.LINE_AA)
    cv2.addWeighted(overlay, 0.75, canvas, 0.25, 0, canvas)

    return canvas, ref_h


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

    # Test de ratio de Lowe: descarta correspondencias ambiguas.
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
        src, dst, cv2.RANSAC, ransac_threshold, maxIters=5000, confidence=0.995
    )

    inlier_mask = (
        mask.ravel().astype(bool) if mask is not None else np.zeros(len(good_matches), bool)
    )
    inliers = int(inlier_mask.sum())
    inlier_ratio = inliers / len(good_matches)
    plausible = homography_is_plausible(homography)

    # Indice de similitud: mezcla consistencia geometrica (calidad) con
    # cantidad absoluta de inliers (evidencia). Rango 0-100.
    evidence = min(1.0, inliers / float(min_inliers_match))
    coverage = inliers / max(1, min(reference.count, test.count))
    score = 100.0 * (0.55 * inlier_ratio + 0.35 * evidence + 0.10 * min(1.0, coverage * 5))
    if not plausible:
        score *= 0.4

    if plausible and inliers >= min_inliers_match and inlier_ratio >= 0.45:
        verdict = "MATCH"
        message = "La geometria es consistente: es el mismo objeto/fotografia."
    elif inliers >= min_inliers_ambiguous:
        verdict = "AMBIGUOUS"
        message = (
            "Hay coincidencias, pero la evidencia geometrica es debil. "
            "Repite la captura con mejor enfoque, luz o encuadre."
        )
    else:
        verdict = "NO MATCH"
        message = "No hay estructura comun suficiente: objetos distintos."

    result.inliers = inliers
    result.inlier_ratio = inlier_ratio
    result.score = round(score, 1)
    result.verdict = verdict
    result.message = message

    if draw:
        draw_outline = plausible and inliers >= min_inliers_ambiguous
        draw_mask = limit_drawn_matches(good_matches, inlier_mask, max_lines)
        if stacked:
            visualization, y_offset = draw_matches_vertical(
                reference, test, good_matches, draw_mask
            )
            if draw_outline:
                project_reference_outline(
                    reference.image.shape, homography, visualization, y_offset=y_offset
                )
        else:
            visualization = cv2.drawMatches(
                reference.image,
                reference.keypoints,
                test.image,
                test.keypoints,
                good_matches,
                None,
                matchColor=(0, 255, 0),
                singlePointColor=(120, 120, 120),
                matchesMask=draw_mask.astype(np.uint8).tolist(),
                flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS,
            )
            if draw_outline:
                project_reference_outline(
                    reference.image.shape,
                    homography,
                    visualization,
                    x_offset=reference.image.shape[1],
                )
        result.visualization = visualization

    return result


# --------------------------------------------------------------------------- #
# Interfaz Streamlit
# --------------------------------------------------------------------------- #

VERDICT_STYLE = {
    "MATCH": ("#0f5132", "#d1e7dd"),
    "AMBIGUOUS": ("#664d03", "#fff3cd"),
    "NO MATCH": ("#842029", "#f8d7da"),
}

MOBILE_CSS = """
<style>
  /* Aprovechar el ancho completo en pantallas pequenas */
  @media (max-width: 640px) {
    .block-container { padding: 1rem 0.8rem 3rem 0.8rem; }
    h1 { font-size: 1.6rem !important; }
    [data-testid="stMetricValue"] { font-size: 1.1rem; }
  }
</style>
"""


def render_verdict(result: MatchResult, total_references: int) -> None:
    color, background = VERDICT_STYLE[result.verdict]
    if result.verdict == "NO MATCH":
        headline = f"Ninguna de las {total_references} referencias registradas coincide."
    else:
        headline = f"Mejor candidato: <b>{result.label}</b>"
    st.markdown(
        f"""
        <div style="background:{background};color:{color};border-radius:14px;
                    padding:clamp(14px,4vw,28px);text-align:center;margin:8px 0 20px 0;">
            <div style="font-size:clamp(38px,11vw,64px);font-weight:800;line-height:1.1;">
                {result.verdict}
            </div>
            <div style="font-size:clamp(15px,4vw,20px);margin-top:6px;">
                Indice de similitud: {result.score} / 100
            </div>
            <div style="font-size:clamp(14px,3.6vw,17px);margin-top:8px;">{headline}</div>
            <div style="font-size:clamp(12px,3.2vw,15px);margin-top:10px;opacity:.85;">
                {result.message}
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_ranking(results: List[MatchResult]) -> None:
    st.subheader("Ranking de referencias registradas")
    st.dataframe(
        [
            {
                "#": position,
                "Referencia": item.label,
                "Veredicto": item.verdict,
                "Similitud": item.score,
                "Matches (Lowe)": item.good_matches,
                "Inliers": item.inliers,
                "Ratio inliers": f"{item.inlier_ratio:.0%}",
                "Keypoints": item.keypoints_ref,
            }
            for position, item in enumerate(results, start=1)
        ],
        hide_index=True,
    )


def main() -> None:
    st.set_page_config(
        page_title="Reconocimiento por features",
        page_icon="🔍",
        layout="wide",
        initial_sidebar_state="collapsed",
    )
    st.markdown(MOBILE_CSS, unsafe_allow_html=True)
    st.title("🔍 Reconocimiento de objetos e imagenes impresas")
    st.caption(
        "Fase 1 - Prueba de concepto: ORB/SIFT + test de ratio de Lowe + verificacion "
        "geometrica con RANSAC."
    )

    with st.sidebar:
        st.header("Parametros")
        mobile_view = st.toggle(
            "Vista movil (apilar en vertical)",
            value=False,
            help="Apila referencia y escaneo uno sobre otro en el panel de coincidencias.",
        )
        algorithm = st.radio(
            "Algoritmo",
            ("ORB", "SIFT"),
            help="ORB es mucho mas rapido; SIFT es mas preciso y robusto a escala.",
        )
        max_features = st.slider("Maximo de features", 500, 5000, 2000, 250)
        ratio_threshold = st.slider(
            "Ratio de Lowe", 0.5, 0.9, 0.75, 0.01,
            help="Mas bajo = correspondencias mas exigentes y menos falsos positivos.",
        )
        ransac_threshold = st.slider("Tolerancia RANSAC (px)", 1.0, 10.0, 5.0, 0.5)
        max_lines = st.slider(
            "Lineas de coincidencia a dibujar", 10, 300, 60, 10,
            help="Solo afecta al dibujo: con cientos de lineas el panel se vuelve ilegible.",
        )
        st.divider()
        st.subheader("Umbrales de decision")
        min_inliers_match = st.slider("Inliers minimos para MATCH", 10, 80, 25, 1)
        min_inliers_ambiguous = st.slider("Inliers minimos para AMBIGUOUS", 4, 40, 12, 1)

    register_tab, scan_tab = st.tabs(["1. Registro", "2. Escanear"])

    with register_tab:
        ref_files = st.file_uploader(
            "Imagenes de Referencia",
            type=UPLOAD_TYPES,
            accept_multiple_files=True,
            help="Desde el movil, 'Browse files' permite elegir de la galeria o hacer una foto.",
        )

    with scan_tab:
        source = st.radio(
            "Origen del escaneo",
            ("Archivo o galeria", "Camara en directo"),
            horizontal=True,
        )
        if source == "Camara en directo":
            st.caption(
                "La camara en directo solo funciona si abres la app en localhost o por HTTPS: "
                "el navegador bloquea el acceso a la camara en conexiones HTTP no seguras."
            )
            test_file = st.camera_input("Captura el objeto")
        else:
            test_file = st.file_uploader("Imagen de Prueba", type=UPLOAD_TYPES)

    if not ref_files or test_file is None:
        st.info(
            "Registra al menos una imagen en la pestana 1 y captura o sube el escaneo en la 2."
        )
        return

    test_image = decode_image(test_file.getvalue())
    if test_image is None:
        st.error("No se ha podido decodificar la imagen de prueba.")
        return

    references: List[Tuple[str, np.ndarray]] = []
    unreadable: List[str] = []
    for uploaded in ref_files:
        decoded = decode_image(uploaded.getvalue())
        if decoded is None:
            unreadable.append(uploaded.name)
        else:
            references.append((uploaded.name, decoded))

    if unreadable:
        st.warning("No se han podido decodificar: " + ", ".join(unreadable))
    if not references:
        st.error("Ninguna imagen de referencia es legible.")
        return

    with st.expander(f"Entradas ({len(references)} referencias + 1 escaneo)", expanded=False):
        st.image(resize_to_limit(test_image, 320), channels="BGR", caption="Escaneo a identificar")
        thumbnails = st.columns(min(4, len(references)))
        for index, (name, image) in enumerate(references):
            with thumbnails[index % len(thumbnails)]:
                st.image(resize_to_limit(image, 150), channels="BGR", caption=name)

    try:
        detector = build_detector(algorithm, max_features)
    except RuntimeError as error:
        st.error(str(error))
        return

    test_features = extract_features(getattr(test_file, "name", "escaneo"), test_image, detector)
    if test_features.count < 2:
        st.error(
            "La imagen de prueba apenas tiene textura detectable. Prueba con una captura "
            "mas nitida o mejor iluminada."
        )
        return

    comparison_args = dict(
        algorithm=algorithm,
        ratio_threshold=ratio_threshold,
        ransac_threshold=ransac_threshold,
        min_inliers_match=min_inliers_match,
        min_inliers_ambiguous=min_inliers_ambiguous,
    )

    progress = st.progress(0.0, text="Extrayendo y comparando features...")
    reference_sets = {}
    results: List[MatchResult] = []
    for index, (name, image) in enumerate(references, start=1):
        features = extract_features(name, image, detector)
        reference_sets[name] = features
        results.append(compare_feature_sets(features, test_features, **comparison_args))
        progress.progress(index / len(references), text=f"Comparando {name}...")
    progress.empty()

    results.sort(key=lambda item: item.sort_key, reverse=True)
    best = results[0]

    render_verdict(best, len(results))

    metrics = st.columns(2 if mobile_view else 5)
    cells = [
        ("Keypoints escaneo", best.keypoints_test),
        ("Keypoints referencia", best.keypoints_ref),
        ("Matches (Lowe)", best.good_matches),
        ("Inliers RANSAC", best.inliers),
        ("Ratio de inliers", f"{best.inlier_ratio:.0%}"),
    ]
    for index, (title, value) in enumerate(cells):
        metrics[index % len(metrics)].metric(title, value)

    confident = [item.label for item in results if item.verdict == "MATCH"]
    if len(confident) > 1:
        st.warning(
            "Varias referencias dan MATCH: "
            + ", ".join(confident)
            + ". Es lo esperado si son vistas del mismo objeto; si son objetos distintos, "
            "baja el ratio de Lowe y sube los inliers minimos para separarlas."
        )

    if len(results) > 1:
        render_ranking(results)

    labels = [f"{item.label}  -  {item.verdict} ({item.score})" for item in results]
    selection = st.selectbox(
        "Ver correspondencias de:", range(len(results)), format_func=lambda i: labels[i]
    )
    chosen = results[selection]
    detailed = compare_feature_sets(
        reference_sets[chosen.label],
        test_features,
        draw=True,
        stacked=mobile_view,
        max_lines=max_lines,
        **comparison_args,
    )

    if detailed.visualization is not None:
        st.image(
            resize_to_limit(detailed.visualization, RENDER_WIDTH),
            channels="BGR",
            caption="Lineas verdes = inliers RANSAC. El marco verde es la referencia "
                    "proyectada sobre la imagen de prueba.",
        )
    else:
        st.info("Esta referencia no tiene correspondencias suficientes para dibujar.")

    with st.expander("Como se interpreta el resultado"):
        st.markdown(
            f"""
- **Matches (Lowe)**: correspondencias que superan el test de ratio ({ratio_threshold:.2f}).
- **Inliers RANSAC**: de esas, las que encajan en una unica homografia, es decir,
  las que son coherentes con un cambio real de perspectiva. Es la senal fiable.
- **MATCH**: homografia plausible, >= {min_inliers_match} inliers y ratio de inliers >= 45%.
- **AMBIGUOUS**: >= {min_inliers_ambiguous} inliers pero sin consistencia suficiente.
- **NO MATCH**: por debajo de esos minimos.

El escaneo se compara contra **todas** las referencias registradas y se ordenan por
veredicto y similitud. Para objetos muy parecidos entre si, fijate en la distancia
entre el primero y el segundo del ranking: si estan casi empatados, el sistema no
los esta separando bien todavia.
            """
        )


if __name__ == "__main__":
    main()
