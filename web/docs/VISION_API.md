# Memories Vision API — V10.7 web

Backend Python/FastAPI para conectar el reconocimiento visual probado en Streamlit con una web desplegada en Vercel.

## Qué contiene

- `vision/engine.py`: motor V10.7 desacoplado de Streamlit.
- `vision/router.py`: endpoints de registro, recorte y escaneo.
- `api/index.py`: entrada FastAPI que Vercel puede desplegar bajo `/api/*`.
- `requirements.txt`: dependencias Python.
- `.python-version`: Python 3.12.
- `examples/vision-client.ts`: llamadas desde React/Next.js.

## Integrarlo en este proyecto

Vercel despliega desde la carpeta `web/`. Copia aquí:

```text
web/api/
web/vision/
web/requirements.txt
web/.python-version
```

Si ya existe `web/api/index.py`, no lo sobrescribas. Añade:

```python
from vision.router import router as vision_router
app.include_router(vision_router)
```

## Ejecutar localmente

```powershell
cd web
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn api.index:app --reload --port 8000
```

Health: `http://localhost:8000/api/vision/health`

## Variables opcionales

```text
VISION_ALLOWED_ORIGINS=https://tu-dominio.com
VISION_ALLOWED_IMAGE_HOSTS=blob.vercel-storage.com,tu-storage.supabase.co
VISION_MAX_REFERENCES=50
VISION_MAX_SCAN_BYTES=4400000
VISION_MAX_REFERENCE_BYTES=4000000
VISION_FETCH_TIMEOUT_SECONDS=8
VISION_IMAGE_CACHE_SIZE=80
```

## Flujo recomendado

### Registro

`cámara + retícula` → `/suggest-crop` → usuario confirma/corrige → `/prepare-reference` → subir JPEG preparado al storage → guardar `id + name + memory_id + prepared_image_url`.

### Escaneo

`cámara + retícula` → recuperar referencias del usuario → `/scan` → si hay `target`, abrir `target.memory_id`; los `secondary` no abren nada.

## Importante sobre Vercel

No guardar referencias en variables globales, RAM o archivos locales esperando que persistan entre peticiones. El storage/base de datos de la web debe ser la fuente de verdad.

El endpoint `/scan` usa URLs de referencias preparadas para evitar reenviar muchas imágenes dentro de cada request.
