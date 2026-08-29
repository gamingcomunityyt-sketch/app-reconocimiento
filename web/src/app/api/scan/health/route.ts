import { NextResponse } from "next/server";

import { recognitionEnv } from "@/lib/env.server";

export const runtime = "nodejs";

/**
 * Local siempre esta disponible. Si hay servicio Python configurado,
 * tambien informa si responde (reconocimiento de lujo).
 */
export async function GET() {
  const env = recognitionEnv();
  if (!env) {
    return NextResponse.json({
      configured: true,
      reachable: true,
      mode: "local",
      python: { configured: false, reachable: false },
    });
  }

  try {
    const response = await fetch(`${env.url.replace(/\/$/, "")}/health`, {
      headers: { Authorization: `Bearer ${env.token}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    const pythonOk = response.ok;
    return NextResponse.json({
      configured: true,
      reachable: true,
      mode: pythonOk ? "python" : "local_fallback",
      python: { configured: true, reachable: pythonOk, status: response.status },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({
      configured: true,
      reachable: true,
      mode: "local_fallback",
      python: { configured: true, reachable: false, detail: message },
    });
  }
}
