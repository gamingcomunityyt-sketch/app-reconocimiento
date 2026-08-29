# Cuentas privadas (Supabase)

Para que cada persona se registre y solo vea sus recuerdos (y a quien invite),
necesitas un proyecto de Supabase.

## 1. Crear el proyecto

1. Entra en https://supabase.com y crea un proyecto.
2. **Project Settings → API**: copia
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` (solo servidor, no la compartas) → `SUPABASE_SERVICE_ROLE_KEY`

## 2. Crear tablas y privacidad

En Supabase → **SQL Editor**, pega y ejecuta el archivo:

`web/supabase/migrations/001_init.sql`

Eso crea tablas, politicas RLS (nadie lee lo de otro) y el bucket privado
`memory-media`.

Despues ejecuta tambien (una sola vez):

`web/supabase/migrations/003_account_bootstrap.sql`

Eso anade funciones que reparan la cuenta al entrar y crean recuerdos sin
depender de la clave `service_role` en Vercel.

## 3. Auth

En **Authentication → Providers → Email**:

- Activa Email.
- Para pruebas, puedes desactivar “Confirm email” (asi entras al registrarte sin
  mirar el correo).

## 4. Variables en local

En `web/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://XXXX.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
RECOGNITION_SERVICE_URL=http://127.0.0.1:8000
RECOGNITION_SERVICE_TOKEN=dev-local-token
```

## 5. Variables en Vercel

Project → Settings → Environment Variables: las mismas `NEXT_PUBLIC_*` (y el
service role si lo usas). Luego **Redeploy**.

Anade tambien en Supabase → Authentication → URL Configuration:

- Site URL: `https://web-sandy-one-59.vercel.app`
- Redirect URLs: esa misma URL

## Que cambia en la app

- `/registro` y `/entrar`
- Sin sesion, te manda a entrar
- Al guardar un recuerdo va a tu cuenta (privado)
- Menu ⋯ → **Invitar** con un email: solo esa persona lo vera cuando tenga cuenta
