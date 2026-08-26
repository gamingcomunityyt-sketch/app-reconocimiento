import "server-only";

import { requireEnv } from "./env";

/**
 * Secretos que nunca deben salir del servidor. El import de `server-only`
 * convierte en error de compilacion cualquier intento de importar este modulo
 * desde un componente de cliente.
 */
export function serverEnv() {
  return {
    /** Salta las politicas de RLS. Solo para operaciones administrativas. */
    supabaseServiceRoleKey: requireEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    recognitionServiceUrl: requireEnv(
      "RECOGNITION_SERVICE_URL",
      process.env.RECOGNITION_SERVICE_URL,
    ),
    recognitionServiceToken: requireEnv(
      "RECOGNITION_SERVICE_TOKEN",
      process.env.RECOGNITION_SERVICE_TOKEN,
    ),
  };
}

/** Configuracion opcional del servicio de reconocimiento (dev sin Python). */
export function recognitionEnv(): { url: string; token: string } | null {
  const url = process.env.RECOGNITION_SERVICE_URL?.trim();
  const token = process.env.RECOGNITION_SERVICE_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}
