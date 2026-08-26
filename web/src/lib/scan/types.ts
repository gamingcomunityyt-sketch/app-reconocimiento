export type ScanReason =
  | "recognition_complete"
  | "simulated_no_service"
  | "simulated_forced"
  | "service_unavailable"
  | "service_timeout"
  | "no_candidates"
  | "no_references"
  | "scan_low_texture";

/** Veredicto por par escaneo/referencia tal y como lo devuelve el motor. */
export type PairVerdict = "MATCH" | "AMBIGUOUS" | "NO MATCH";

/**
 * Detalle completo de un candidato en el ranking, pensado para el modo
 * desarrollador. El cliente lo cruza con sus `ScanCandidateView` (por
 * `objectId`) para mostrar la miniatura sin reenviar imagenes al servidor.
 */
export interface ScanRankingDetail {
  objectId: string;
  /** 0-100. Puntuacion combinada de geometria y color. */
  score: number;
  inliers: number;
  inlierRatio: number;
  goodMatches: number;
  keypointsRef: number;
  keypointsTest: number;
  plausible: boolean;
  /** 0-1. Parecido visual combinado (color + arte + apariencia). */
  colorSimilarity: number;
  /** 0-1. Parecido cromatico solo de la zona de arte (centro). */
  artSimilarity: number;
  /** 0-1. Correlacion de apariencia en el arte tras alinear. */
  appearance: number;
  /** 0-1. Dispersion espacial de los inliers sobre la referencia. */
  spread: number;
  verdict: PairVerdict;
  message: string;
}

/** Umbrales usados por la politica de veredicto, para pintarlos en el panel. */
export interface ScanThresholds {
  minInliersMatch: number;
  minInlierRatio: number;
  minColorSimilarity: number;
  minScoreMatch: number;
  minScoreSingleCandidate: number;
  scoreMargin: number;
  /** Por debajo de este score no se muestra la pantalla de eleccion. */
  minScoreAmbiguous: number;
}

export interface ScanApiResponse {
  outcome: import("@/lib/data/types").ScanOutcome;
  simulated: boolean;
  latencyMs: number | null;
  rankingCount: number;
  reason: ScanReason;
  topScore: number | null;
  topColorSimilarity: number | null;
  /** Ranking completo ordenado por score desc. Vacio en modo simulado. */
  rankings: ScanRankingDetail[];
  /** Keypoints detectados en el fotograma escaneado. */
  scanKeypoints: number | null;
  thresholds: ScanThresholds;
}
