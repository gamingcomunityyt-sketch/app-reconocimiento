import "server-only";

import { recognitionEnv } from "@/lib/env.server";
import type { ScanCandidateView, ScanOutcome } from "@/lib/data/types";
import type { ForcedScanOutcome } from "@/lib/data/scan";
import { resolveScan } from "@/lib/data/scan";

import { runLocalScan, type LocalReference } from "./local";
import {
  applyScanVerdict,
  mapRecognitionRankings,
  SCAN_THRESHOLDS,
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

function toRankingDetail(
  ranking: ReturnType<typeof mapRecognitionRankings>[number],
): ScanRankingDetail {
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

const PYTHON_TIMEOUT_MS = 12_000;

async function matchWithPython(
  frame: Buffer,
  references: LocalReference[],
  env: { url: string; token: string },
): Promise<RecognitionMatchResponse | null> {
  const candidates = references.map((reference) => ({
    id: reference.view.objectId,
    image_base64: toBase64(reference.buffer),
  }));

  try {
    const response = await fetch(`${env.url.replace(/\/$/, "")}/match`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scan_image_base64: toBase64(frame),
        candidates,
      }),
      signal: AbortSignal.timeout(PYTHON_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error("[scan] python error", response.status);
      return null;
    }
    return (await response.json()) as RecognitionMatchResponse;
  } catch (error) {
    console.error("[scan] python unreachable", error);
    return null;
  }
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

  const started = Date.now();
  const references: LocalReference[] = [];
  for (const candidate of candidates) {
    const bytes = await loadReferenceBytes(candidate, form);
    if (!bytes) continue;
    const view = views.find((item) => item.objectId === candidate.objectId);
    if (!view) continue;
    references.push({ view, buffer: bytes });
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

  const env = recognitionEnv();
  if (env) {
    let payload = await matchWithPython(frame, references, env);
    if (!payload) {
      payload = await matchWithPython(frame, references, env);
    }
    if (payload) {
      const rankings = mapRecognitionRankings(payload.rankings);
      const outcome = applyScanVerdict(rankings, views);
      return {
        outcome,
        simulated: false,
        latencyMs: payload.latency_ms ?? Date.now() - started,
        rankingCount: rankings.length,
        reason: "recognition_complete",
        topScore: rankings[0]?.score ?? null,
        topColorSimilarity: rankings[0]?.colorSimilarity ?? null,
        rankings: rankings.map(toRankingDetail),
        scanKeypoints: payload.scan_keypoints ?? null,
        thresholds: SCAN_THRESHOLDS,
      };
    }
    console.warn("[scan] python unavailable, falling back to local");
  }

  try {
    const result = await runLocalScan(frame, references);
    return {
      outcome: result.outcome,
      simulated: false,
      latencyMs: Date.now() - started,
      rankingCount: result.rankings.length,
      reason: "recognition_complete",
      topScore: result.topScore,
      topColorSimilarity: result.topColorSimilarity,
      rankings: result.rankings,
      scanKeypoints: null,
      thresholds: SCAN_THRESHOLDS,
    };
  } catch (error) {
    console.error("[scan] local recognition failed", error);
    return {
      ...base,
      outcome: { status: "no_match" },
      simulated: false,
      latencyMs: Date.now() - started,
      rankingCount: 0,
      reason: "service_unavailable",
      topScore: null,
      topColorSimilarity: null,
    };
  }
}
