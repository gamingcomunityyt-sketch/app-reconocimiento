import type { ScanCandidateView, ScanOutcome } from "@/lib/data/types";

import type { ScanRankingDetail } from "./types";

/** Logica compartida de huella perceptual + color (browser y servidor). */

export const MATCH_SIZE = 32;
export const MATCH_PIXELS = MATCH_SIZE * MATCH_SIZE;

export interface Fingerprint {
  gray: Float64Array;
  bits: Uint8Array;
  colorHist: Float64Array;
  mean: number;
  std: number;
}

export function fingerprintFromImageData(data: ImageData): Fingerprint {
  const pixels = data.data;
  const gray = new Float64Array(MATCH_PIXELS);
  const colorHist = new Float64Array(64);
  let sum = 0;

  for (let i = 0; i < MATCH_PIXELS; i++) {
    const offset = i * 4;
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = lum;
    sum += lum;
    const bin = (r >> 6) * 16 + (g >> 6) * 4 + (b >> 6);
    colorHist[bin] += 1;
  }

  for (let i = 0; i < 64; i++) colorHist[i] /= MATCH_PIXELS;

  const mean = sum / MATCH_PIXELS;
  let variance = 0;
  const bits = new Uint8Array(MATCH_PIXELS);
  for (let i = 0; i < MATCH_PIXELS; i++) {
    bits[i] = gray[i] > mean ? 1 : 0;
    const d = gray[i] - mean;
    variance += d * d;
  }
  const std = Math.sqrt(variance / MATCH_PIXELS) || 1;

  return { gray, bits, colorHist, mean, std };
}

function structuralSimilarity(a: Fingerprint, b: Fingerprint): number {
  let hamming = 0;
  for (let i = 0; i < MATCH_PIXELS; i++) if (a.bits[i] !== b.bits[i]) hamming++;
  const hashSim = 1 - hamming / MATCH_PIXELS;

  let covariance = 0;
  for (let i = 0; i < MATCH_PIXELS; i++) {
    covariance += (a.gray[i] - a.mean) * (b.gray[i] - b.mean);
  }
  const ncc = covariance / (MATCH_PIXELS * a.std * b.std);
  const appearance = Math.max(0, ncc);

  return 0.5 * hashSim + 0.5 * appearance;
}

function colorSimilarity(a: Fingerprint, b: Fingerprint): number {
  let intersection = 0;
  for (let i = 0; i < 64; i++) {
    intersection += Math.min(a.colorHist[i], b.colorHist[i]);
  }
  return intersection;
}

function bestPairScore(
  a: Fingerprint[],
  b: Fingerprint[],
): { structural: number; color: number; combined: number } {
  let best = { structural: 0, color: 0, combined: 0 };
  for (const left of a) {
    for (const right of b) {
      const structural = structuralSimilarity(left, right);
      const color = colorSimilarity(left, right);
      const combined = 0.6 * structural + 0.4 * color;
      if (combined > best.combined) best = { structural, color, combined };
    }
  }
  return best;
}

const MATCH_SCORE = 62;
const AMBIGUOUS_SCORE = 50;
const MARGIN = 5;

export interface LocalMatchInput {
  view: ScanCandidateView;
  fingerprints: Fingerprint[];
}

export interface LocalMatchResult {
  outcome: ScanOutcome;
  rankings: ScanRankingDetail[];
  topScore: number | null;
  topColorSimilarity: number | null;
}

export function runMatching(
  frameFingerprints: Fingerprint[],
  references: LocalMatchInput[],
): LocalMatchResult {
  const scored: Array<{
    view: ScanCandidateView;
    score: number;
    structural: number;
    color: number;
  }> = [];

  for (const reference of references) {
    const pair = bestPairScore(frameFingerprints, reference.fingerprints);
    scored.push({
      view: reference.view,
      score: Math.round(pair.combined * 1000) / 10,
      structural: pair.structural,
      color: pair.color,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  const rankings: ScanRankingDetail[] = scored.map((item) => ({
    objectId: item.view.objectId,
    score: item.score,
    inliers: Math.round(item.structural * 100),
    inlierRatio: item.structural,
    goodMatches: Math.round(item.structural * 100),
    keypointsRef: MATCH_PIXELS,
    keypointsTest: MATCH_PIXELS,
    plausible: item.score >= AMBIGUOUS_SCORE,
    colorSimilarity: item.color,
    artSimilarity: item.color,
    appearance: item.structural,
    spread: item.structural,
    verdict:
      item.score >= MATCH_SCORE
        ? "MATCH"
        : item.score >= AMBIGUOUS_SCORE
          ? "AMBIGUOUS"
          : "NO MATCH",
    message: "",
  }));

  const top = scored[0];
  const second = scored[1];
  const topScore = top?.score ?? null;
  const topColorSimilarity = top?.color ?? null;

  if (!top) {
    return { outcome: { status: "no_match" }, rankings, topScore, topColorSimilarity };
  }

  const marginOk = !second || top.score - second.score >= MARGIN;

  if (top.score >= MATCH_SCORE && marginOk) {
    return { outcome: { status: "match", candidate: top.view }, rankings, topScore, topColorSimilarity };
  }

  if (top.score >= AMBIGUOUS_SCORE) {
    const shortlist = scored
      .filter((item) => item.score >= AMBIGUOUS_SCORE && item.score >= top.score - 8)
      .slice(0, 3)
      .map((item) => item.view);

    if (shortlist.length >= 2) {
      return { outcome: { status: "ambiguous", candidates: shortlist }, rankings, topScore, topColorSimilarity };
    }
    if (top.score >= MATCH_SCORE - 4) {
      return { outcome: { status: "match", candidate: top.view }, rankings, topScore, topColorSimilarity };
    }
  }

  return { outcome: { status: "no_match" }, rankings, topScore, topColorSimilarity };
}
