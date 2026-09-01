import type { ScanCandidateView } from "@/lib/data/types";
import type { ForcedScanOutcome } from "@/lib/data/scan";
import { resolveScan } from "@/lib/data/scan";

import {
  fingerprintFromImageData,
  MATCH_SIZE,
  runMatching,
  type Fingerprint,
} from "./matching-core";
import { SCAN_THRESHOLDS } from "./verdict";
import type { ScanApiResponse } from "./types";

function drawCover(ctx: CanvasRenderingContext2D, bitmap: ImageBitmap): void {
  const scale = Math.max(MATCH_SIZE / bitmap.width, MATCH_SIZE / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  ctx.drawImage(bitmap, (MATCH_SIZE - width) / 2, (MATCH_SIZE - height) / 2, width, height);
}

function drawContain(ctx: CanvasRenderingContext2D, bitmap: ImageBitmap): void {
  const scale = Math.min(MATCH_SIZE / bitmap.width, MATCH_SIZE / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, MATCH_SIZE, MATCH_SIZE);
  ctx.drawImage(bitmap, (MATCH_SIZE - width) / 2, (MATCH_SIZE - height) / 2, width, height);
}

async function fingerprintsFromBlob(blob: Blob): Promise<Fingerprint[] | null> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = MATCH_SIZE;
    canvas.height = MATCH_SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    drawCover(ctx, bitmap);
    const cover = fingerprintFromImageData(ctx.getImageData(0, 0, MATCH_SIZE, MATCH_SIZE));

    ctx.clearRect(0, 0, MATCH_SIZE, MATCH_SIZE);
    drawContain(ctx, bitmap);
    const contain = fingerprintFromImageData(ctx.getImageData(0, 0, MATCH_SIZE, MATCH_SIZE));

    return [cover, contain];
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

/**
 * Escaneo 100% en el navegador: no depende de Vercel serverless ni de Render.
 */
export async function submitLocalScan(
  frameBlob: Blob,
  candidates: ScanCandidateView[],
  forced?: ForcedScanOutcome,
): Promise<ScanApiResponse> {
  const started = performance.now();

  if (forced) {
    return {
      outcome: resolveScan(candidates, forced),
      simulated: true,
      engine: "local",
      latencyMs: null,
      rankingCount: 0,
      reason: "simulated_forced",
      topScore: null,
      topColorSimilarity: null,
      rankings: [],
      scanKeypoints: null,
      thresholds: SCAN_THRESHOLDS,
    };
  }

  if (candidates.length === 0) {
    return {
      outcome: { status: "no_match" },
      simulated: false,
      engine: "local",
      latencyMs: Math.round(performance.now() - started),
      rankingCount: 0,
      reason: "no_candidates",
      topScore: null,
      topColorSimilarity: null,
      rankings: [],
      scanKeypoints: null,
      thresholds: SCAN_THRESHOLDS,
    };
  }

  const frameFingerprints = await fingerprintsFromBlob(frameBlob);
  if (!frameFingerprints) {
    return {
      outcome: { status: "no_match" },
      simulated: false,
      engine: "local",
      latencyMs: Math.round(performance.now() - started),
      rankingCount: 0,
      reason: "service_unavailable",
      topScore: null,
      topColorSimilarity: null,
      rankings: [],
      scanKeypoints: null,
      thresholds: SCAN_THRESHOLDS,
    };
  }

  const references = (
    await Promise.all(
      candidates.map(async (candidate) => {
        try {
          const response = await fetch(candidate.objectImageUrl, { cache: "no-store" });
          if (!response.ok) return null;
          const blob = await response.blob();
          const fingerprints = await fingerprintsFromBlob(blob);
          if (!fingerprints) return null;
          return { view: candidate, fingerprints };
        } catch {
          return null;
        }
      }),
    )
  ).filter((item): item is NonNullable<typeof item> => item !== null);

  if (references.length === 0) {
    return {
      outcome: { status: "no_match" },
      simulated: false,
      engine: "local",
      latencyMs: Math.round(performance.now() - started),
      rankingCount: 0,
      reason: "no_references",
      topScore: null,
      topColorSimilarity: null,
      rankings: [],
      scanKeypoints: null,
      thresholds: SCAN_THRESHOLDS,
    };
  }

  const result = runMatching(frameFingerprints, references);

  return {
    outcome: result.outcome,
    simulated: false,
    engine: "local",
    latencyMs: Math.round(performance.now() - started),
    rankingCount: result.rankings.length,
    reason: "recognition_complete",
    topScore: result.topScore,
    topColorSimilarity: result.topColorSimilarity,
    rankings: result.rankings,
    scanKeypoints: null,
    thresholds: SCAN_THRESHOLDS,
  };
}
