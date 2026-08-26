# Publicar Recuerdos (sin abrir Cursor cada vez)

La app vive en internet en **Vercel**. Una vez publicada, cualquiera abre el
enlace desde el movil o el PC. No hace falta arrancar nada en local.

Para cuentas privadas y recuerdos solo tuyos, configura tambien Supabase:
ver `web/SUPABASE_SETUP.md`.

## 1. Publicar la web (Next.js)

Desde la carpeta `web`:

```bash
npx vercel login
npx vercel --prod
```

Al terminar, Vercel muestra una URL tipo `https://….vercel.app`. Esa es la que
puedes compartir.

Para volver a publicar despues de cambios:

```bash
npx vercel --prod
```

## 2. Reconocimiento real (necesario para escanear)

Sin este paso, la interfaz funciona (biblioteca, crear, editar, cuentas) pero el
escaneo muestra *"El motor de reconocimiento no esta activo"*.

### A. Desplegar el servicio Python en Render

1. Sube el repositorio a GitHub (si aun no lo has hecho).
2. Entra en [Render](https://render.com) → **New** → **Blueprint**.
3. Conecta el repositorio. Render detectara `render.yaml` en la raiz.
4. Tras el deploy, anota:
   - **URL publica** (ej. `https://recuerdos-recognition.onrender.com`)
   - **RECOGNITION_SERVICE_TOKEN** (Render lo genera; copialo en Environment)

Comprueba: `https://TU-SERVICIO.onrender.com/health` → `{"status":"ok"}`.

> En el plan free, la primera peticion tras inactividad puede tardar ~30 s.
> La app llama a `/api/scan/warmup` al abrir el escaner para reducir esa espera.

### B. Configurar Vercel

Manual — Vercel → Project → Settings → Environment Variables:

```
RECOGNITION_SERVICE_URL=https://TU-SERVICIO.onrender.com
RECOGNITION_SERVICE_TOKEN=el-mismo-secreto-que-en-render
```

Automatico — desde la raiz del repo:

```powershell
.\scripts\setup-scan-production.ps1 -RenderUrl "https://recuerdos-recognition.onrender.com" -Token "tu-token"
```

Luego **Redeploy** en Vercel.

### C. Comprobar

Abre `https://TU-APP.vercel.app/api/scan/health`. Deberia devolver:

```json
{"configured":true,"reachable":true,"status":200}
```

Si `configured: false`, faltan variables en Vercel. Si `reachable: false`, Render
no responde o el token no coincide.

## Notas

- Con Supabase: los recuerdos viven en tu cuenta y solo los ven invitados.
- Sin Supabase: siguen en IndexedDB del navegador (demo local).
- La camara en el movil requiere HTTPS: Vercel ya lo da.
