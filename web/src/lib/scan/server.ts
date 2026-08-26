import "server-only";

import { recognitionEnv } from "@/lib/env.server";
import type { ScanCandidateView, ScanOutcome } from "@/lib/data/types";
import type { ForcedScanOutcome } from "@/lib/data/scan";
import { resolveScan } from "@/lib/data/scan";

import {
  applyScanVerdict,
  mapRecognitionRankings,
  SCAN_THRESHOLDS,
  type CandidateRanking,
  type RecognitionRankingResponse,
} from "./verdict";
import type { ScanRankingDetail, ScanReason } from "./types";

export interface ScanCandidatePayload {
  objectId: string;
  objectLabel: string;
  objectImageUrl: string;
  memoryId: string;
  memoryTitle: string;
  memoryCoverUrl: string;
  /** true cuando la referencia viene en el multipart (blob:/data: del navegador). */
  referenceFromClient: boolean;
}

interface RecognitionMatchResponse {
  rankings: RecognitionRankingResponse[];
  scan_keypoints: number;
  latency_ms: number;
}

async function loadReferenceBytes(
  candidate: ScanCandidatePayload,
  form: FormData,
): Promise<Buffer | null> {
  if (candidate.referenceFromClient) {
    const file = form.get(`reference_${candidate.objectId}`);
    if (!(file instanceof File) || file.size === 0) return null;
    return Buffer.from(await file.arrayBuffer());
  }

  try {
    const response = await fetch(candidate.objectImageUrl);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function toBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

function toRankingDetail(ranking: CandidateRanking): ScanRankingDetail {
  return {
    objectId: ranking.objectId,
    score: ranking.score,
    inliers: ranking.inliers,
    inlierRatio: ranking.inlierRatio,
    goodMatches: ranking.goodMatches,
    keypointsRef: ranking.keypointsRef,
    keypointsTest: ranking.keypointsTest,
    plausible: ranking.plausible,
    colorSimilarity: ranking.colorSimilarity,
    artSimilarity: ranking.artSimilarity,
    appearance: ranking.appearance,
    spread: ranking.spread,
    verdict: ranking.pairVerdict,
    message: ranking.message,
  };
}

interface ScanRunResult {
  outcome: ScanOutcome;
  simulated: boolean;
  latencyMs: number | null;
  rankingCount: number;
  reason: ScanReason;
  topScore: number | null;
  topColorSimilarity: number | null;
  rankings: ScanRankingDetail[];
  scanKeypoints: number | null;
  thresholds: typeof SCAN_THRESHOLDS;
}

export async function runScan(
  frame: Buffer,
  candidates: ScanCandidatePayload[],
  form: FormData,
  forced?: ForcedScanOutcome,
): Promise<ScanRunResult> {
  const views: ScanCandidateView[] = candidates.map((candidate) => ({
    objectId: candidate.objectId,
    objectLabel: candidate.objectLabel,
    objectImageUrl: candidate.objectImageUrl,
    memoryId: candidate.memoryId,
    memoryTitle: candidate.memoryTitle,
    memoryCoverUrl: candidate.memoryCoverUrl,
  }));

  const base = {
    rankings: [] as ScanRankingDetail[],
    scanKeypoints: null,
    thresholds: SCAN_THRESHOLDS,
  };

  if (forced) {
    return {
      ...base,
      outcome: resolveScan(views, forced),
      simulated: true,
      latencyMs: null,
      rankingCount: 0,
      reason: "simulated_forced",
      topScore: null,
      topColorSimilarity: null,
    };
  }

  if (candidates.length === 0) {
    return {
      ...base,
      outcome: { status: "no_match" },
      simulated: false,
      latencyMs: null,
      rankingCount: 0,
      reason: "no_candidates",
      topScore: null,
      topColorSimilarity: null,
    };
  }

  const env = recognitionEnv();
  if (!env) {
    return {
      ...base,
      outcome: { status: "no_match" },
      simulated: true,
      latencyMs: null,
      rankingCount: 0,
      reason: "simulated_no_service",
      topScore: null,
      topColorSimilarity: null,
    };
  }

  const references: Array<{ id: string; image_base64: string }> = [];
  for (const candidate of candidates) {
    const bytes = await loadReferenceBytes(candidate, form);
    if (!bytes) continue;
    references.push({
      id: candidate.objectId,
      image_base64: toBase64(bytes),
    });
  }

  if (references.length === 0) {
    return {
      ...base,
      outcome: { status: "no_match" },
      simulated: false,
      latencyMs: null,
      rankingCount: 0,
      reason: "no_references",
      topScore: null,
      topColorSimilarity: null,
    };
  }

  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(`${env.url.replace(/\/$/, "")}/match`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scan_image_base64: toBase64(frame),
        candidates: references,
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    console.error("[scan] recognition fetch failed", error);
    return {
      ...base,
      outcome: { status: "no_match" },
      simulated: false,
      latencyMs: Date.now() - started,
      rankingCount: 0,
      reason: timedOut ? "service_timeout" : "service_unavailable",
      topScore: null,
      topColorSimilarity: null,
    };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[scan] recognition service error", response.status, detail);
    return {
      ...base,
      outcome: { status: "no_match" },
      simulated: false,
      latencyMs: Date.now() - started,
      rankingCount: 0,
      reason: response.status === 422 ? "scan_low_texture" : "service_unavailable",
      topScore: null,
      topColorSimilarity: null,
    };
  }

  const payload = (await response.json()) as RecognitionMatchResponse;
  const rankings = mapRecognitionRankings(payload.rankings);
  const outcome = applyScanVerdict(rankings, views);
  const topScore = rankings[0]?.score ?? null;
  const topColorSimilarity = rankings[0]?.colorSimilarity ?? null;

  return {
    outcome,
    simulated: false,
    latencyMs: payload.latency_ms ?? Date.now() - started,
    rankingCount: rankings.length,
    reason: "recognition_complete",
    topScore,
    topColorSimilarity,
    rankings: rankings.map(toRankingDetail),
    scanKeypoints: payload.scan_keypoints ?? null,
    thresholds: SCAN_THRESHOLDS,
  };
}
