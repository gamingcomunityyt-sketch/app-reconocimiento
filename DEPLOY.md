# Publicar Recuerdos + escáner V10.7 (todo en Vercel)

La web y el reconocimiento viven en **el mismo proyecto Vercel**.
Misma URL: interfaz Next.js + motor Python en `/api/vision/*`.

Root Directory del proyecto en Vercel: **`web`**.

---

## 1. Qué hay que tener en GitHub (carpeta `web/`)

```text
web/
  api/index.py              ← entrada FastAPI
  api/requirements.txt
  vision/engine.py          ← motor V10.7
  vision/router.py
  vision/__init__.py
  requirements.txt
  .python-version
  vercel.json               ← timeout + rewrite /api/vision → Python
  src/...                   ← tu Next.js (ya conectado al escáner)
```

No hace falta Render para el escáner V10.7.

---

## 2. Subir y desplegar

1. Sube el repo a GitHub (incluye `web/api` y `web/vision`).
2. En Vercel → Project → Settings → General:
   - **Root Directory** = `web`
3. Redeploy (o `npx vercel --prod` desde `web/`).

---

## 3. Variable importante (Supabase)

Vercel → Settings → Environment Variables:

```text
VISION_ALLOWED_IMAGE_HOSTS=TU-PROYECTO.supabase.co
```

Sin eso, el motor puede rechazar descargar las fotos de referencia.

(Opcional) Si usas dominio propio:

```text
VISION_ALLOWED_ORIGINS=https://tu-dominio.com
```

Las variables de Supabase (`NEXT_PUBLIC_SUPABASE_URL`, etc.) se quedan como ya las tienes.

---

## 4. Comprobar que está unido

Tras el deploy:

1. `https://TU-APP.vercel.app/api/vision/health`  
   Debe devolver algo como `{ "ok": true, "engine": "10.7-web", ... }`.

2. `https://TU-APP.vercel.app/api/scan/health`  
   Debe indicar modo `vision_v10` si el motor responde.

3. En la app: crea un recuerdo con objeto vinculado → **Escanear** → apuntar → abre el recuerdo.

Si `/api/vision/health` falla, la app sigue usando el escáner local del navegador (respaldo).

---

## 5. Probar en el PC (opcional)

Terminal 1 — motor:

```powershell
cd web
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn api.index:app --reload --port 8000
```

En `.env.local`:

```text
VISION_API_URL=http://127.0.0.1:8000
```

Terminal 2 — web:

```powershell
cd web
npm run dev
```

Abre `http://localhost:3000/api/vision/health`.

---

## Cómo queda el flujo

| Acción | Qué pasa |
| --- | --- |
| Entrar en Escanear | La web comprueba `/api/vision/health` |
| Motor OK | Envía la foto + retícula + URLs de tus objetos a `/api/vision/scan` |
| MATCH | Abre el recuerdo del **objetivo** (bajo la retícula) |
| Secundarios | Se reconocen pero **no** abren solo |
| Motor caído | Usa el escáner local integrado |

---

## Notas

- La cámara en el móvil necesita HTTPS: Vercel ya lo da.
- Con Supabase, las imágenes de objeto deben ser URLs `https://...supabase.co/...` (firmadas).
- El laboratorio Streamlit no hace falta subirlo.
