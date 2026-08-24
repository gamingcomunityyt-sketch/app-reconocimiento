/**
 * Acceso validado a las variables de entorno publicas.
 *
 * Las variables se leen a traves de estas funciones en lugar de usar
 * `process.env` directamente, para que un valor ausente falle con un mensaje
 * claro en lugar de propagarse como `undefined` hasta una llamada remota.
 *
 * Las referencias a `process.env.NEXT_PUBLIC_*` deben ser literales: Next.js
 * las sustituye en tiempo de compilacion y un acceso dinamico no se inlinea.
 */

export class MissingEnvError extends Error {
  constructor(name: string) {
    super(
      `Falta la variable de entorno ${name}. ` +
        "Copia .env.example a .env.local y rellena los valores.",
    );
    this.name = "MissingEnvError";
  }
}

export function requireEnv(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    throw new MissingEnvError(name);
  }
  return value;
}

/**
 * Configuracion de Supabase disponible tambien en el navegador. Es publica por
 * diseno: el acceso a los datos lo restringe Row Level Security, no el secreto.
 */
export function publicSupabaseEnv() {
  return {
    url: requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: requireEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}
