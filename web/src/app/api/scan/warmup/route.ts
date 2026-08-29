import { NextResponse } from "next/server";

import { recognitionEnv } from "@/lib/env.server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Despierta el servicio Python (si existe) al abrir la camara.
 * El reconocimiento local no necesita warmup.
 */
export async function POST() {
  const env = recognitionEnv();
  if (!env) {
    return NextResponse.json({ warmed: true, mode: "local" });
  }

  try {
    const started = Date.now();
    const response = await fetch(`${env.url.replace(/\/$/, "")}/health`, {
      headers: { Authorization: `Bearer ${env.token}` },
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
    return NextResponse.json({
      warmed: response.ok,
      mode: "python",
      latencyMs: Date.now() - started,
      status: response.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({
      warmed: false,
      mode: "local_fallback",
      detail: message,
    });
  }
}
