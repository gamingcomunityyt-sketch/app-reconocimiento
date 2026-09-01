import { NextResponse } from "next/server";

import { recognitionEnv } from "@/lib/env.server";

export const runtime = "nodejs";

/**
 * Local siempre esta disponible. Si hay servicio Python configurado,
 * tambien informa si responde (reconocimiento de lujo).
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  let vision: { reachable: boolean; status?: number } = { reachable: false };

  try {
    const response = await fetch(`${origin}/api/vision/health`, {
      signal: AbortSignal.timeout(4_000),
      cache: "no-store",
    });
    vision = { reachable: response.ok, status: response.status };
  } catch {
    vision = { reachable: false };
  }

  const env = recognitionEnv();
  if (!env) {
    return NextResponse.json({
      configured: true,
      reachable: true,
      mode: vision.reachable ? "vision_v10" : "local",
      vision,
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
      mode: vision.reachable ? "vision_v10" : pythonOk ? "python" : "local_fallback",
      vision,
      python: { configured: true, reachable: pythonOk, status: response.status },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({
      configured: true,
      reachable: true,
      mode: vision.reachable ? "vision_v10" : "local_fallback",
      vision,
      python: { configured: true, reachable: false, detail: message },
    });
  }
}
