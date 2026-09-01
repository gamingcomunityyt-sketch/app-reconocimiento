# Qué subir al repositorio (Vision API V10.7)

Vercel despliega desde `web/`. Los archivos Python van **dentro de `web/`**.

## Obligatorio en runtime

- `api/index.py`
- `vision/__init__.py`
- `vision/engine.py`
- `vision/router.py`
- `requirements.txt`
- `.python-version`

## Recomendado en GitHub

- `docs/` (contrato, integración, modelo de datos)
- `examples/vision-client.ts`
- `src/lib/scan/vision-client.ts`
- `vercel.json` (timeout y memoria para OpenCV)

## No subir

- `.venv`, `__pycache__`
- `.env.local` (secretos)
- Laboratorio Streamlit
- Fotos de prueba

## Estado

| Pieza | Estado |
| --- | --- |
| Backend Python | ✓ Integrado en `web/api` y `web/vision` |
| Cliente TypeScript | ✓ `src/lib/scan/vision-client.ts` |
| Escáner conectado | ✓ Usa V10.7 si `/api/vision/health` responde |
| Variables Vercel | Pendiente: `VISION_ALLOWED_IMAGE_HOSTS` con tu dominio Supabase |

## Probar en local

```powershell
cd web
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn api.index:app --reload --port 8000
```

En otra terminal, con `VISION_API_URL=http://127.0.0.1:8000` en `.env.local`:

```powershell
npm run dev
```

Abre `http://localhost:3000/api/vision/health` → debe responder `ok: true`.
