# Plan de migración

Estado del documento: propuesta inicial tras auditar el repositorio.
Fecha: 2026-08-24.

---

## 1. Arquitectura actual

El repositorio contiene cuatro archivos relevantes:

```
app.py                    598 líneas — aplicación completa
requirements.txt          streamlit, opencv-python-headless, numpy, pillow
.streamlit/config.toml    maxUploadSize = 50, telemetría desactivada
.gitignore
```

`app.py` es una prueba de concepto monolítica de un solo proceso y **sin estado
persistente**. Internamente tiene dos capas bien separadas:

### 1.1 Núcleo de visión artificial (líneas 29–325)

Código puro sobre NumPy y OpenCV, sin ninguna dependencia de Streamlit. Es la
parte reutilizable.

| Función | Responsabilidad |
| --- | --- |
| `decode_image` | Decodifica bytes a BGR aplicando la orientación EXIF (crítico para fotos de móvil), con `cv2.imdecode` como respaldo |
| `resize_to_limit` | Normaliza el lado mayor a 1000 px para que coste y número de features sean comparables |
| `preprocess` | Escala de grises + CLAHE (`clipLimit=2.0`, `tileGridSize=8x8`) para robustez frente a iluminación |
| `build_detector` | ORB (`nfeatures`, `scaleFactor=1.2`, `nlevels=8`) o SIFT, con comprobación de disponibilidad de SIFT |
| `build_matcher` | `BFMatcher` con Hamming para ORB (descriptores binarios) y L2 para SIFT (punto flotante) |
| `extract_features` | Redimensiona, preprocesa y devuelve un `FeatureSet` (imagen, keypoints, descriptores) |
| `compare_feature_sets` | knnMatch k=2 → ratio de Lowe → `findHomography` con RANSAC → conteo de inliers → puntuación → veredicto |
| `homography_is_plausible` | Descarta homografías degeneradas por el determinante de la parte lineal 2×2 (reflejos, colapsos, escalas absurdas) |
| `project_reference_outline`, `limit_drawn_matches`, `draw_matches_vertical` | Visualización de diagnóstico |

Algoritmo de decisión actual, por pareja (referencia, escaneo):

```
evidence  = min(1, inliers / min_inliers_match)
coverage  = inliers / min(keypoints_ref, keypoints_test)
score     = 100 * (0.55*inlier_ratio + 0.35*evidence + 0.10*min(1, coverage*5))
score    *= 0.4  si la homografía no es plausible

MATCH      si homografía plausible AND inliers >= 25 AND inlier_ratio >= 0.45
AMBIGUOUS  si inliers >= 12
NO MATCH   en cualquier otro caso
```

El ranking final ordena por `(rango_veredicto, score, inliers)`.

### 1.2 Interfaz Streamlit (líneas 332–598)

Dos pestañas (Registro / Escanear), barra lateral con siete parámetros
ajustables por el usuario, CSS embebido para móvil, métricas, tabla de ranking y
panel de correspondencias. Se sustituye íntegramente.

### 1.3 Correspondencia con las áreas solicitadas en la auditoría

| Área | Estado actual |
| --- | --- |
| Interfaz | Streamlit (`app.py` 332–598) |
| Backend | No existe; la lógica se ejecuta en el proceso de la interfaz |
| Almacenamiento | No existe; los archivos viven en memoria durante la petición |
| Reconocimiento de imágenes | `app.py` 29–325 |
| OpenCV | ORB/SIFT, BFMatcher, findHomography, CLAHE, resize, drawMatches |
| Modelos de machine learning | **Ninguno.** No hay red neuronal, ni pesos, ni entrenamiento, ni inferencia |
| Procesamiento de imágenes | Pillow (EXIF, conversión) + OpenCV (gris, CLAHE, escalado) |
| Base de datos | No existe |
| Autenticación | No existe |
| Archivos | Subidas en memoria vía `st.file_uploader` / `st.camera_input`; nada se guarda |
| APIs | No existe ninguna API |

---

## 2. Problemas encontrados

### 2.1 Bloqueantes para el producto

1. **Ausencia total de persistencia.** Al recargar la página se pierden las
   referencias. No hay concepto de usuario, recuerdo, objeto ni permiso.
2. **Ausencia de autenticación y de multitenencia.** No existe la noción de
   "objetos accesibles para este usuario", que es un requisito central.
3. **Los umbrales son ajustables por el usuario final.** Siete sliders
   determinan el veredicto. En producción deben ser constantes calibradas en
   servidor: si el usuario puede mover el umbral hasta obtener un `MATCH`, el
   resultado no significa nada.
4. **Streamlit no permite la experiencia móvil requerida.** No hay control real
   sobre el ciclo de vida de la cámara, ni captura continua de frames, ni
   instalación como PWA, ni navegación entre vistas.

### 2.2 Defectos concretos del código

5. **`"heic"` está en `UPLOAD_TYPES` pero no se puede decodificar.** Pillow no
   soporta HEIC sin `pillow-heif`, y `cv2.imdecode` tampoco. Las fotos de iPhone
   con el formato por defecto caen en la rama de error. Hay que añadir la
   dependencia o retirar la extensión.
6. **Recálculo completo en cada interacción.** No se usa `st.cache_data`, así que
   mover cualquier slider o cambiar el desplegable vuelve a extraer las features
   de todas las referencias.
7. **Trabajo duplicado en el detalle.** `compare_feature_sets` se ejecuta una
   segunda vez sobre la pareja seleccionada solo para generar el dibujo.
8. **El veredicto es absoluto en lugar de relativo.** Cada referencia se evalúa
   de forma independiente, de modo que varias pueden dar `MATCH` y la app se
   limita a avisarlo. Con una galería por usuario, la ambigüedad es por
   definición una comparación entre el primer y el segundo candidato.
9. **Búsqueda O(N) por fuerza bruta** con extracción de features de las
   referencias en cada escaneo. Correcto para una demo; insostenible en cuanto
   las referencias se guarden en base de datos.
10. **Sin tests, sin CI, sin tipado verificado, sin conjunto de calibración.** No
    hay forma de detectar una regresión en la calidad del reconocimiento.

---

## 3. Qué se migra, qué se elimina, qué se reutiliza

### 3.1 Se reutiliza (portar sin reescribir la lógica)

Todo el núcleo de visión (§1.1), incluidas las decisiones no obvias que ya
contiene y que son costosas de redescubrir:

- Orientación EXIF aplicada antes de cualquier procesamiento.
- CLAHE como normalización de iluminación.
- Normalización de escala a 1000 px.
- Selección de norma del matcher según el tipo de descriptor.
- Validación de homografías degeneradas.
- La semántica de tres veredictos `MATCH` / `AMBIGUOUS` / `NO MATCH`, que ya
  coincide con el flujo de producto deseado.

### 3.2 Se elimina

- Toda la capa Streamlit y el CSS embebido.
- Los parámetros ajustables por el usuario (pasan a constantes de servidor).
- El panel de diagnóstico de correspondencias: es una herramienta de desarrollo,
  no una función de producto. Se conserva únicamente detrás de una bandera de
  entorno para depuración.
- `streamlit` de las dependencias.
- `app.py` y `.streamlit/`, **solo al completar la fase 9**.

### 3.3 Se migra a Next.js (en su mayoría, obra nueva)

Autenticación, modelo de datos, biblioteca de recuerdos, creación y edición de
recuerdos, subida de multimedia, registro de objetos, interfaz de escaneo,
presentación de resultados, permisos y compartición. Del código actual solo
viaja el concepto del flujo de dos pasos registro/escaneo.

### 3.4 Qué permanece en Python

El núcleo de visión, de forma **permanente y no temporal**, aislado detrás de una
API. La justificación está en §4.

---

## 4. Decisión sobre el reconocimiento visual: Opción B

**Next.js + microservicio Python**, tomando de la Opción C el preprocesado en
cliente.

### 4.1 Por qué el algoritmo actual es el correcto para este producto

El problema es **recuperación a nivel de instancia** dentro de una galería
pequeña: distinguir *este* objeto concreto de otros, no clasificar categorías.

Un embedding global (CLIP, DINOv2) mide parecido semántico y por tanto
confundiría dos objetos del mismo modelo, que es precisamente el caso que hay
que resolver. Las features locales con verificación geométrica exigen
correspondencia punto a punto coherente con una única transformación de
perspectiva, lo que distingue instancias y mantiene los falsos positivos bajos.
Además funciona con 1–4 imágenes de referencia y **sin entrenar nada**, lo que
elimina el problema de arranque en frío al registrar un objeto nuevo.

Límites que hay que asumir por diseño:

- La homografía supone **superficie plana**. Excelente para fotografías
  impresas, portadas, etiquetas, postales y objetos con una cara plana
  texturizada. Degradado para objetos tridimensionales con relieve.
  Mitigación: varias vistas por objeto, cada una como referencia independiente.
- Los objetos **sin textura** (superficies lisas de un solo color) no generan
  keypoints suficientes. Es un límite físico del método y debe comunicarse en la
  interfaz durante el registro, midiendo el número de keypoints y rechazando
  referencias pobres en el momento de registrarlas.

### 4.2 Por qué no la Opción A (todo en TypeScript)

- No existe un binding nativo de OpenCV para Node mantenido y apto para
  entornos serverless; los que hay requieren compilación nativa.
- OpenCV.js (WebAssembly) añade varios megabytes al bundle, penalizando
  justamente el objetivo mobile-first, y las builds estándar no incluyen SIFT.
- Reescribir y recalibrar un pipeline que ya funciona introduce riesgo de
  regresión a cambio de homogeneidad de lenguaje, que no es un beneficio para el
  usuario.

### 4.3 Qué se toma de la Opción C

Preprocesado ligero en el navegador, sin OpenCV: reducir el frame a 1000 px y
estimar nitidez con `<canvas>` antes de subir. Reduce latencia y consumo de
datos móviles, y evita enviar frames inservibles.

La inferencia y la comparación permanecen en servidor, porque los descriptores
de las referencias son datos privados de otros usuarios potencialmente
compartidos y no deben descargarse al cliente.

---

## 5. Arquitectura final propuesta

```
Navegador móvil (PWA)
  └── Next.js App Router · TypeScript · React · Tailwind
        ├── Server Actions        → CRUD de recuerdos, objetos y permisos
        ├── Route Handlers        → /api/scan, /api/objects/[id]/references
        └── Cliente               → cámara, reducción de frame, control de nitidez
              │
              ├──> Supabase
              │      ├── Auth (sesión, cookies del servidor)
              │      ├── PostgreSQL + Row Level Security
              │      └── Storage privado + URLs firmadas
              │
              └──> Servicio de reconocimiento (FastAPI, red interna)
                     ├── POST /extract  imagen        → keypoints + descriptores
                     └── POST /match    frame + galería → ranking de candidatos
```

### 5.1 Frontera de seguridad

Regla no negociable: **el servicio Python no toma decisiones de autorización y
no recibe identificadores enviados por el cliente.**

Flujo de un escaneo:

1. El cliente envía únicamente el frame (ya reducido) a `/api/scan`.
2. El route handler resuelve la sesión de Supabase en servidor.
3. Consulta con RLS el conjunto de objetos accesibles para ese usuario (propios
   o compartidos) y carga sus descriptores.
4. Llama a Python con el frame y **ese conjunto ya filtrado**, autenticado con un
   secreto interno.
5. Python devuelve un ranking con métricas por candidato.
6. Next.js aplica la política de veredictos y devuelve al cliente solo lo
   necesario:

```ts
type ScanResult =
  | { status: "match";     objectId: string; memoryId: string; confidence: number }
  | { status: "ambiguous"; candidates: Array<{ objectId: string; memoryId: string; title: string; confidence: number }> }
  | { status: "no_match";  reason: "low_texture" | "no_candidates" | "below_threshold" };
```

El cliente nunca ve descriptores, umbrales, nombres de algoritmo ni métricas
internas. El servicio Python no se expone a internet.

### 5.2 Modelo de datos

```
auth.users                     (gestionado por Supabase)
profiles                        id → auth.users, display_name, avatar_url
memories                        id, owner_id, title, description, happened_at, location, visibility, created_at
memory_members                  memory_id, user_id, role: owner | editor | viewer
media                           id, memory_id, storage_path, kind: image|video|audio, mime_type, bytes, duration_ms, width, height
objects                         id, memory_id, label, created_at
object_references               id, object_id, storage_path, algorithm, keypoint_count, descriptor_path, embedding vector(N) NULL, created_at
share_links                     id, memory_id, token_hash, role, expires_at, created_at, revoked_at
scan_events                     id, user_id, status, matched_object_id NULL, top_score, latency_ms, created_at
```

Relaciones:

```
user
 └── memories
      ├── media
      ├── memory_members
      └── objects
           └── object_references
```

Notas de diseño:

- Los descriptores locales son un **conjunto** de vectores por imagen (≈64 KB con
  ORB a 2000 features), no un vector único, así que **no van en pgvector**. Se
  guardan como blob en Storage y se referencian desde `descriptor_path`.
- La columna `embedding` queda preparada, nula al principio, para una futura
  primera fase de recuperación aproximada con pgvector cuando las galerías
  crezcan: ANN para obtener top-K y verificación geométrica solo sobre esos K.
- `scan_events` guarda métricas agregadas, nunca la imagen escaneada.
- RLS en todas las tablas. La pertenencia se deriva de `memory_members`, nunca de
  datos enviados por el cliente.

### 5.3 Política de veredictos

Sustituye la decisión por pareja del código actual por una decisión sobre el
ranking completo:

```
Sea top1, top2 los dos mejores candidatos por score.

MATCH      si top1 tiene homografía plausible
              y top1.inliers >= MIN_INLIERS_MATCH
              y top1.inlier_ratio >= MIN_INLIER_RATIO
              y (no existe top2 o top1.score - top2.score >= MARGIN)

AMBIGUOUS  si top1 supera el umbral mínimo de evidencia
              pero el margen respecto a top2 es insuficiente
           → devolver 2–3 candidatos

NO MATCH   en cualquier otro caso
```

Los objetos con varias vistas de referencia agregan por `object_id` tomando el
máximo de sus referencias antes de calcular el margen, para que dos vistas del
mismo objeto no se consideren candidatos rivales.

---

## 6. Fases de migración

Cada fase deja el proyecto ejecutable. `app.py` sigue funcionando como
referencia de comportamiento hasta la fase 9.

### Fase 0 — Cimientos — COMPLETADA

Crear la aplicación Next.js (App Router, TypeScript, Tailwind, ESLint) en un
subdirectorio, configurar variables de entorno con validación en el arranque,
definir la estructura de carpetas y los tipos base. Sin funcionalidad todavía.

Criterio de aceptación: `npm run build` y `npm run lint` sin errores.

Resultado: aplicación en `web/` con Next.js 16.3.2, React 19.2, Tailwind 4 y
TypeScript 5. Validación de entorno en `web/src/lib/env.ts` (públicas) y
`web/src/lib/env.server.ts` (secretos, protegido con `server-only`). Tipos del
dominio en `web/src/types/domain.ts`. Build, lint y arranque verificados.

> **Nota de estado (2026-08-24).** La interfaz de las fases 3, 4, 6 y 7 se ha
> construido por adelantado contra una capa de datos de ejemplo, para poder
> juzgar el producto antes de que exista Supabase. Ver `UI_REDESIGN_PLAN.md`.
> Las fases 1 y 2 siguen pendientes y son el siguiente trabajo: cuando estén,
> solo hay que sustituir `web/src/lib/data/` por consultas reales, sin tocar
> ninguna pantalla.

### Fase 1 — Datos y seguridad

Proyecto de Supabase, migraciones SQL del esquema de §5.2, políticas RLS y
buckets de Storage privados. Pruebas manuales de que un usuario no puede leer
filas ni archivos de otro.

Criterio de aceptación: consultas cruzadas entre dos usuarios de prueba
devuelven cero filas.

### Fase 2 — Autenticación

Registro, inicio de sesión, sesión en servidor con cookies, middleware de rutas
protegidas, cierre de sesión.

### Fase 3 — Recuerdos

Listado (biblioteca), detalle, creación y edición. Solo texto, fecha y ubicación.

### Fase 4 — Multimedia

Subida a Storage con validación de tipo y tamaño en servidor, URLs firmadas para
lectura, galería en el detalle del recuerdo. Decidir aquí el soporte de HEIC.

### Fase 5 — Servicio de reconocimiento

Extraer §1.1 a un servicio FastAPI con `/extract` y `/match`, sin lógica de
permisos. **Verificación de paridad obligatoria:** un conjunto de imágenes de
prueba debe producir los mismos inliers y veredictos que `app.py` con los
parámetros por defecto. Ese conjunto se convierte en el corpus de calibración
permanente.

Criterio de aceptación: paridad numérica con `app.py` y umbrales fijados como
constantes documentadas.

### Fase 6 — Registro de objetos

Vincular un objeto a un recuerdo, capturar 1–4 imágenes, llamar a `/extract`,
guardar imagen y descriptores, y **rechazar en el momento** las referencias con
pocos keypoints explicando al usuario por qué.

### Fase 7 — Escaneo

Interfaz de cámara mobile-first, reducción y control de nitidez en cliente,
`/api/scan` con filtrado de candidatos por RLS, y las tres pantallas de
resultado: apertura directa, elección entre 2–3 candidatos, o reintento.

### Fase 8 — Calibración y PWA

Ajustar umbrales y margen contra el corpus de la fase 5, registrar
`scan_events`, manifest y service worker, comprobación en dispositivo real.

### Fase 9 — Retirada del legacy

Eliminar `app.py`, `.streamlit/` y `streamlit` de las dependencias, **solo
cuando las fases 5 a 7 estén verificadas en dispositivo real**.

### Fase 10 — Tests

Unitarios del núcleo de visión sobre el corpus de calibración, unitarios de la
política de veredictos, integración de RLS, y un extremo a extremo del flujo
registrar → escanear → abrir recuerdo.

---

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Los objetos reales del usuario son 3D o sin textura | El reconocimiento no funciona y ninguna arquitectura lo arregla | Validar con fotos reales **antes** de la fase 6; exigir varias vistas; rechazar referencias pobres en el registro |
| Umbrales fijados sin corpus de calibración | Falsos positivos o negativos silenciosos, imposibles de detectar | Construir el corpus en la fase 5 y convertirlo en test |
| RLS mal escrita | Fuga de recuerdos privados entre usuarios | Tests de integración con dos usuarios; filtrado en servidor antes de llamar a Python |
| Arranque en frío del servicio Python | Primer escaneo lento | Instancia mínima siempre activa; indicador de progreso; medir con `scan_events` |
| Crecimiento de la galería | La comparación O(N) se degrada | Columna `embedding` ya prevista para primera fase ANN con pgvector |
| Coste de almacenamiento de descriptores | ≈64 KB por referencia | Limitar features y número de referencias por objeto |
| La cámara exige HTTPS | El escaneo falla en pruebas por HTTP | HTTPS en desarrollo y despliegue desde el principio |
| Deriva entre `app.py` y el servicio durante la transición | Comportamientos divergentes | `app.py` congelado desde la fase 5; sin cambios funcionales en él |
| Dos lenguajes en despliegue | Más operación y más superficie de fallo | Servicio Python mínimo, contenedorizado, sin estado y sin acceso a la base de datos |

---

## 8. Fuera de alcance, explícitamente

- Reconocimiento facial: no se implementa.
- El reconocimiento visual **nunca** se usa como autenticación ni como
  contraseña. Solo navega hasta un recuerdo al que la sesión ya tiene acceso.
- Reconocimiento de objetos arbitrarios del mundo. El sistema solo compara
  contra objetos previamente registrados y accesibles para el usuario.
- Aplicación nativa. La arquitectura queda preparada para envolverse con
  Capacitor o compartir backend con React Native, sin forzarlo ahora.
