import { NextResponse } from "next/server";

import { parseForcedOutcome } from "@/lib/data/scan";
import {
  runScan,
  type ScanCandidatePayload,
} from "@/lib/scan/server";

export const runtime = "nodejs";
/** Reconocimiento + cold start de Render pueden tardar; max en Hobby = 10s, Pro = 60s. */
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const frame = form.get("frame");

    if (!(frame instanceof File) || frame.size === 0) {
      return NextResponse.json({ error: "missing_frame" }, { status: 400 });
    }

    const rawCandidates = form.get("candidates");
    if (typeof rawCandidates !== "string") {
      return NextResponse.json({ error: "missing_candidates" }, { status: 400 });
    }

    let candidates: ScanCandidatePayload[];
    try {
      candidates = JSON.parse(rawCandidates) as ScanCandidatePayload[];
    } catch {
      return NextResponse.json({ error: "invalid_candidates" }, { status: 400 });
    }

    const forcedRaw = form.get("forced");
    const forced =
      typeof forcedRaw === "string"
        ? parseForcedOutcome(forcedRaw)
        : undefined;

    const frameBuffer = Buffer.from(await frame.arrayBuffer());
    const result = await runScan(frameBuffer, candidates, form, forced);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[scan] route error", error);
    return NextResponse.json({ error: "scan_internal_error" }, { status: 500 });
  }
}
