import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * El reconocimiento corre localmente en la funcion serverless (sin Render).
 * Siempre disponible mientras la app este desplegada.
 */
export async function GET() {
  return NextResponse.json({
    configured: true,
    reachable: true,
    mode: "local",
  });
}
