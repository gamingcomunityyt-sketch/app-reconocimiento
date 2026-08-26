import type { ScanCandidateView, ScanOutcome } from "@/lib/data/types";
import type { ScanThresholds } from "./types";

/** Resultado bruto de una comparacion contra una referencia. */
export interface CandidateRanking {
  objectId: string;
  score: number;
  inliers: number;
  inlierRatio: number;
  goodMatches: number;
  keypointsRef: number;
  keypointsTest: number;
  plausible: boolean;
  colorSimilarity: number;
  artSimilarity: number;
  appearance: number;
  spread: number;
  message: string;
  pairVerdict: "MATCH" | "AMBIGUOUS" | "NO MATCH";
}

const MIN_INLIERS_MATCH = 45;
const MIN_INLIER_RATIO = 0.52;
const MIN_INLIERS_AMBIGUOUS = 18;
/** Parecido visual combinado (color global + arte + apariencia). */
const MIN_COLOR_SIMILARITY = 0.68;
const MIN_SCORE_MATCH = 62;
const SCORE_MARGIN = 10;
/** Con un solo candidato no hay margen: exigir mas evidencia. */
const MIN_SCORE_SINGLE_CANDIDATE = 68;
/**
 * Por debajo de este score no se ofrece elegir entre candidatos:
 * se trata como no reconocido (el usuario no quiere pantallas de
 * "¿es una de estas?" cuando el parecido es bajo).
 */
const MIN_SCORE_AMBIGUOUS = 50;

/** Umbrales expuestos para el modo desarrollador (mismos valores que arriba). */
export const SCAN_THRESHOLDS: ScanThresholds = {
  minInliersMatch: MIN_INLIERS_MATCH,
  minInlierRatio: MIN_INLIER_RATIO,
  minColorSimilarity: MIN_COLOR_SIMILARITY,
  minScoreMatch: MIN_SCORE_MATCH,
  minScoreSingleCandidate: MIN_SCORE_SINGLE_CANDIDATE,
  scoreMargin: SCORE_MARGIN,
  minScoreAmbiguous: MIN_SCORE_AMBIGUOUS,
};

interface AggregatedCandidate {
  objectId: string;
  score: number;
  inliers: number;
  inlierRatio: number;
  plausible: boolean;
  colorSimilarity: number;
  pairVerdict: CandidateRanking["pairVerdict"];
}

function aggregateByObject(
  rankings: CandidateRanking[],
): AggregatedCandidate[] {
  const byObject = new Map<string, AggregatedCandidate>();

  for (const ranking of rankings) {
    const current = byObject.get(ranking.objectId);
    if (!current || ranking.score > current.score) {
      byObject.set(ranking.objectId, {
        objectId: ranking.objectId,
        score: ranking.score,
        inliers: ranking.inliers,
        inlierRatio: ranking.inlierRatio,
        plausible: ranking.plausible,
        colorSimilarity: ranking.colorSimilarity,
        pairVerdict: ranking.pairVerdict,
      });
    }
  }

  return [...byObject.values()].sort((a, b) => b.score - a.score);
}

function candidateView(
  candidates: ScanCandidateView[],
  objectId: string,
): ScanCandidateView | undefined {
  return candidates.find((candidate) => candidate.objectId === objectId);
}

/**
 * Politica de veredicto sobre el ranking completo (MIGRATION_PLAN §5.3).
 */
export function applyScanVerdict(
  rankings: CandidateRanking[],
  candidates: ScanCandidateView[],
): ScanOutcome {
  if (candidates.length === 0) return { status: "no_match" };

  const aggregated = aggregateByObject(rankings);
  if (aggregated.length === 0) return { status: "no_match" };

  const top1 = aggregated[0];
  const top2 = aggregated[1];

  const top1Qualifies =
    top1.plausible &&
    top1.inliers >= MIN_INLIERS_MATCH &&
    top1.inlierRatio >= MIN_INLIER_RATIO &&
    top1.colorSimilarity >= MIN_COLOR_SIMILARITY &&
    top1.score >=
      (aggregated.length === 1 ? MIN_SCORE_SINGLE_CANDIDATE : MIN_SCORE_MATCH);

  const marginOk = !top2 || top1.score - top2.score >= SCORE_MARGIN;

  if (top1Qualifies && marginOk) {
    const match = candidateView(candidates, top1.objectId);
    if (match) return { status: "match", candidate: match };
  }

  // Sin parecido claro (>= 50%) no se pregunta al usuario: no_match.
  if (top1.score < MIN_SCORE_AMBIGUOUS) {
    return { status: "no_match" };
  }

  const hasMinimumEvidence =
    top1.inliers >= MIN_INLIERS_AMBIGUOUS ||
    top1.pairVerdict === "AMBIGUOUS" ||
    top1.pairVerdict === "MATCH";

  if (hasMinimumEvidence && (!marginOk || !top1Qualifies)) {
    const shortlist = aggregated
      .filter(
        (item) =>
          item.score >= MIN_SCORE_AMBIGUOUS &&
          (item.inliers >= MIN_INLIERS_AMBIGUOUS ||
            item.score >= top1.score - 5),
      )
      .slice(0, 3)
      .map((item) => candidateView(candidates, item.objectId))
      .filter((item): item is ScanCandidateView => item !== undefined);

    // Solo "¿es una de estas?" si hay al menos 2 con parecido real (>= 50%).
    if (shortlist.length >= 2) {
      return { status: "ambiguous", candidates: shortlist };
    }
    if (shortlist.length === 1 && top1Qualifies) {
      return { status: "match", candidate: shortlist[0] };
    }
  }

  return { status: "no_match" };
}

export interface RecognitionRankingResponse {
  candidate_id: string;
  verdict: string;
  score: number;
  inliers: number;
  inlier_ratio: number;
  good_matches: number;
  keypoints_ref: number;
  keypoints_test: number;
  plausible: boolean;
  color_similarity: number;
  art_similarity?: number;
  appearance?: number;
  spread?: number;
  message: string;
}

export function mapRecognitionRankings(
  rankings: RecognitionRankingResponse[],
): CandidateRanking[] {
  return rankings.map((item) => ({
    objectId: item.candidate_id,
    score: item.score,
    inliers: item.inliers,
    inlierRatio: item.inlier_ratio,
    goodMatches: item.good_matches ?? 0,
    keypointsRef: item.keypoints_ref ?? 0,
    keypointsTest: item.keypoints_test ?? 0,
    plausible: item.plausible,
    colorSimilarity: item.color_similarity,
    artSimilarity: item.art_similarity ?? 0,
    appearance: item.appearance ?? 0,
    spread: item.spread ?? 0,
    message: item.message ?? "",
    pairVerdict: item.verdict as CandidateRanking["pairVerdict"],
  }));
}
