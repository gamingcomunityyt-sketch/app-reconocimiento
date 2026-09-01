# Combinar escáner V10.7 + web en Vercel

## Idea

Un solo proyecto Vercel (carpeta `web/`):

- Next.js = pantallas, cámara, Supabase
- Python FastAPI (`api/index.py` + `vision/`) = reconocimiento

La pantalla **Escanear** ya llama a `/api/vision/scan` cuando el health responde OK.

## Pasos para ti

1. **Sube a GitHub** todo lo de `web/` (incluido `api/` y `vision/`).
2. En Vercel, Root Directory = **`web`**.
3. Añade la variable:
   `VISION_ALLOWED_IMAGE_HOSTS=tu-proyecto.supabase.co`
4. **Redeploy**.
5. Abre `https://tu-app.vercel.app/api/vision/health` → debe decir `"ok": true`.

Listo: misma web de siempre, con el escáner bueno integrado.

## Si algo falla

| Síntoma | Qué mirar |
| --- | --- |
| `/api/vision/health` 404 | Root Directory no es `web`, o falta redeploy |
| Health OK pero no reconoce | `VISION_ALLOWED_IMAGE_HOSTS` y que las fotos de objeto sean URLs https de Supabase |
| Sigue el motor “local” | El health no responde; la app usa respaldo a propósito |
