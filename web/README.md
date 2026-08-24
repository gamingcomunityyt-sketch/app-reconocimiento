# Recuerdos — aplicación web

Interfaz y backend de la aplicación que vincula recuerdos digitales a objetos
físicos. Next.js 16 (App Router), TypeScript, Tailwind CSS 4.

El plan de migración y las decisiones de arquitectura están en
[`../MIGRATION_PLAN.md`](../MIGRATION_PLAN.md).

## Requisitos

- Node.js 20.9 o superior (probado con 24.19).
- Una cuenta de Supabase (se configura en la Fase 1).

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # y rellenar los valores
npm run dev
```

La aplicación queda en http://localhost:3000.

Las variables de entorno se leen a través de `src/lib/env.ts` (públicas) y
`src/lib/env.server.ts` (secretos). Mientras no existan Supabase ni el servicio
de reconocimiento, `.env.local` puede quedarse vacío: la validación solo se
dispara cuando alguna parte del código usa esos valores.

## Comandos

| Comando | Efecto |
| --- | --- |
| `npm run dev` | Servidor de desarrollo con Turbopack |
| `npm run build` | Compilación de producción y comprobación de tipos |
| `npm run lint` | ESLint |
| `npm start` | Sirve la compilación de producción |

## Estructura

```
src/
  app/          Rutas del App Router
  lib/          Utilidades de servidor y cliente (entorno, clientes, etc.)
  types/        Tipos del dominio
```

## Notas de la versión de Next.js

Esta versión introduce cambios respecto a versiones anteriores que conviene
tener presentes:

- Turbopack es el compilador por defecto en `dev` y `build`.
- `middleware.ts` pasa a llamarse `proxy.ts` y solo admite runtime Node.
- `cookies()`, `headers()`, `params` y `searchParams` son asíncronos.
- `next lint` ya no existe; se usa la CLI de ESLint directamente.

`AGENTS.md` apunta a la documentación incluida en
`node_modules/next/dist/docs/`, que es la referencia válida para esta versión.

## Prueba de concepto original

La aplicación Streamlit de la que parte este proyecto sigue en `../app.py` y
permanece operativa como referencia de comportamiento del reconocimiento hasta
que se complete la Fase 7.
