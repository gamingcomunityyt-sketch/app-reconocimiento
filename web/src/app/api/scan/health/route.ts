import { NextResponse } from "next/server";

import { recognitionEnv } from "@/lib/env.server";

export const runtime = "nodejs";

/** Comprueba si Vercel puede hablar con el servicio Python de reconocimiento. */
export async function GET() {
  const env = recognitionEnv();
  if (!env) {
    return NextResponse.json({
      configured: false,
      reachable: false,
      detail: "missing_env",
    });
  }

  try {
    const response = await fetch(`${env.url.replace(/\/$/, "")}/health`, {
      headers: { Authorization: `Bearer ${env.token}` },
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });

    return NextResponse.json({
      configured: true,
      reachable: response.ok,
      status: response.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({
      configured: true,
      reachable: false,
      detail: message,
    });
  }
}
