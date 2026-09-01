import type { ScanCandidateView, ScanOutcome } from "@/lib/data/types";

import {
  DEFAULT_RETICLE,
  scanWithVision,
  type Reticle,
  type VisionHit,
  type VisionScanResponse,
} from "./vision-client";
import type { ScanApiResponse, ScanEngine } from "./types";
import { SCAN_THRESHOLDS } from "./verdict";

const HEALTH_MS = 2_500;

export async function isVisionApiAvailable(): Promise<boolean> {
  try {
    const response = await fetch("/api/vision/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(HEALTH_MS),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}

export function candidatesToVisionReferences(
  candidates: ScanCandidateView[],
): Array<{
  id: string;
  name: string;
  memory_id: string;
  image_url: string;
}> {
  return candidates
    .filter((candidate) => {
      // El motor Python en Vercel solo puede descargar URLs http(s), no blob:/data:.
      return /^https?:\/\//i.test(candidate.objectImageUrl);
    })
    .map((candidate) => ({
      id: candidate.objectId,
      name: candidate.objectLabel,
      memory_id: candidate.memoryId,
      image_url: candidate.objectImageUrl,
    }));
}

function findCandidate(
  candidates: ScanCandidateView[],
  hit: VisionHit,
): ScanCandidateView | undefined {
  return (
    candidates.find((item) => item.objectId === hit.reference_id) ??
    (hit.memory_id
      ? candidates.find((item) => item.memoryId === hit.memory_id)
      : undefined)
  );
}

/**
 * Solo abre recuerdo si el veredicto global es MATCH y hay OBJETIVO.
 * `secondary` nunca abre nada solo.
 */
export function mapVisionToOutcome(
  result: VisionScanResponse,
  candidates: ScanCandidateView[],
): ScanOutcome {
  if (result.verdict === "MATCH" && result.target) {
    const candidate = findCandidate(candidates, result.target);
    if (candidate) return { status: "match", candidate };
  }
  return { status: "no_match" };
}

export function visionRetryHint(result: VisionScanResponse): string | null {
  if (result.verdict !== "REPETIR FOTO") return null;
  return (
    result.target?.message ??
    "Centra el objeto bajo la retícula o acércate un poco antes de volver a intentar."
  );
}

export async function submitVisionScan(
  frameBlob: Blob,
  candidates: ScanCandidateView[],
  reticle: Reticle = DEFAULT_RETICLE,
): Promise<ScanApiResponse & { visionNote: string | null }> {
  const started = performance.now();
  const references = candidatesToVisionReferences(candidates);

  if (references.length === 0) {
    return {
      outcome: { status: "no_match" },
      simulated: false,
      engine: "python",
      latencyMs: null,
      rankingCount: 0,
      reason: candidates.length === 0 ? "no_candidates" : "no_references",
      topScore: null,
      topColorSimilarity: null,
      rankings: [],
      scanKeypoints: null,
      thresholds: SCAN_THRESHOLDS,
      visionNote: null,
    };
  }

  const result = await scanWithVision(frameBlob, reticle, references);
  const outcome = mapVisionToOutcome(result, candidates);
  const top = result.ranking?.[0] ?? result.target;

  return {
    outcome,
    simulated: false,
    engine: "python" as ScanEngine,
    latencyMs: Math.round(result.total_ms ?? performance.now() - started),
    rankingCount: result.ranking?.length ?? 0,
    reason:
      result.verdict === "REPETIR FOTO"
        ? "scan_low_texture"
        : "recognition_complete",
    topScore: top?.evidence ?? null,
    topColorSimilarity:
      typeof top?.reticle_affinity === "number"
        ? top.reticle_affinity / 100
        : null,
    rankings: [],
    scanKeypoints: top?.keypoints_scan ?? null,
    thresholds: SCAN_THRESHOLDS,
    visionNote: visionRetryHint(result),
  };
}
