import "server-only";

import type { ScanCandidateView, ScanOutcome } from "@/lib/data/types";
import type { ForcedScanOutcome } from "@/lib/data/scan";
import { resolveScan } from "@/lib/data/scan";

import { runLocalScan, type LocalReference } from "./local";
import { SCAN_THRESHOLDS } from "./verdict";
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

  const started = Date.now();
  const references: LocalReference[] = [];
  for (const candidate of candidates) {
    const bytes = await loadReferenceBytes(candidate, form);
    if (!bytes) continue;
    references.push({
      view: views.find((view) => view.objectId === candidate.objectId)!,
      buffer: bytes,
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
