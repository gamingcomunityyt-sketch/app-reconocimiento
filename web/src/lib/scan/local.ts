import "server-only";

import { Jimp } from "jimp";

import type { ScanCandidateView, ScanOutcome } from "@/lib/data/types";
import type { ScanRankingDetail } from "./types";

/**
 * Reconocimiento sin servicios externos.
 *
 * En lugar de ORB en Python (Render), comparamos cada referencia con el
 * fotograma usando dos senales robustas y baratas que corren en la propia
 * funcion serverless de Next:
 *   - Huella perceptual (estructura/luminancia) -> parecido de forma.
 *   - Histograma de color -> parecido cromatico.
 * No iguala a OpenCV, pero permite escanear objetos distinguibles sin depender
 * de ningun backend.
 */

const SIZE = 32;
const PIXELS = SIZE * SIZE;

interface Fingerprint {
  gray: Float64Array;
  bits: Uint8Array;
  colorHist: Float64Array;
  mean: number;
  std: number;
}

async function fingerprint(buffer: Buffer): Promise<Fingerprint | null> {
  try {
    const image = await Jimp.read(buffer);
    // cover recorta al centro para normalizar el encuadre del objeto.
    image.cover({ w: SIZE, h: SIZE });
    const data = image.bitmap.data;

    const gray = new Float64Array(PIXELS);
    const colorHist = new Float64Array(64);
    let sum = 0;

    for (let i = 0; i < PIXELS; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      gray[i] = lum;
      sum += lum;
      const bin = (r >> 6) * 16 + (g >> 6) * 4 + (b >> 6);
      colorHist[bin] += 1;
    }

    for (let i = 0; i < 64; i++) colorHist[i] /= PIXELS;

    const mean = sum / PIXELS;
    let variance = 0;
    const bits = new Uint8Array(PIXELS);
    for (let i = 0; i < PIXELS; i++) {
      bits[i] = gray[i] > mean ? 1 : 0;
      const d = gray[i] - mean;
      variance += d * d;
    }
    const std = Math.sqrt(variance / PIXELS) || 1;

    return { gray, bits, colorHist, mean, std };
  } catch {
    return null;
  }
}

/** Parecido de forma: 50% huella perceptual + 50% correlacion de apariencia. */
function structuralSimilarity(a: Fingerprint, b: Fingerprint): number {
  let hamming = 0;
  for (let i = 0; i < PIXELS; i++) if (a.bits[i] !== b.bits[i]) hamming++;
  const hashSim = 1 - hamming / PIXELS;

  let covariance = 0;
  for (let i = 0; i < PIXELS; i++) {
    covariance += (a.gray[i] - a.mean) * (b.gray[i] - b.mean);
  }
  const ncc = covariance / (PIXELS * a.std * b.std);
  const appearance = Math.max(0, ncc);

  return 0.5 * hashSim + 0.5 * appearance;
}

/** Interseccion de histogramas de color, 0-1. */
function colorSimilarity(a: Fingerprint, b: Fingerprint): number {
  let intersection = 0;
  for (let i = 0; i < 64; i++) {
    intersection += Math.min(a.colorHist[i], b.colorHist[i]);
  }
  return intersection;
}

export interface LocalReference {
  view: ScanCandidateView;
  buffer: Buffer;
}

const MATCH_SCORE = 68;
const AMBIGUOUS_SCORE = 55;
const MARGIN = 6;

export interface LocalScanResult {
  outcome: ScanOutcome;
  rankings: ScanRankingDetail[];
  topScore: number | null;
  topColorSimilarity: number | null;
}

export async function runLocalScan(
  frame: Buffer,
  references: LocalReference[],
): Promise<LocalScanResult> {
  const frameFp = await fingerprint(frame);
  if (!frameFp) {
    return { outcome: { status: "no_match" }, rankings: [], topScore: null, topColorSimilarity: null };
  }

  const scored: Array<{
    view: ScanCandidateView;
    score: number;
    structural: number;
    color: number;
  }> = [];

  for (const reference of references) {
    const refFp = await fingerprint(reference.buffer);
    if (!refFp) continue;
    const structural = structuralSimilarity(frameFp, refFp);
    const color = colorSimilarity(frameFp, refFp);
    const combined = 0.6 * structural + 0.4 * color;
    scored.push({
      view: reference.view,
      score: Math.round(combined * 1000) / 10,
      structural,
      color,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  const rankings: ScanRankingDetail[] = scored.map((item) => ({
    objectId: item.view.objectId,
    score: item.score,
    inliers: Math.round(item.structural * 100),
    inlierRatio: item.structural,
    goodMatches: Math.round(item.structural * 100),
    keypointsRef: PIXELS,
    keypointsTest: PIXELS,
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
