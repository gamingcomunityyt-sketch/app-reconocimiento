/**
 * Politica de desenlace de un escaneo.
 *
 * Vive aparte de `index.ts` para que la pantalla de escaneo pueda importarla sin
 * arrastrar los recuerdos de ejemplo al paquete que descarga el navegador.
 */

import type { MemoryDetail, ScanCandidateView, ScanOutcome } from "./types";

/** Convierte recuerdos con objetos vinculados en candidatos de escaneo. */
export function memoriesToScanCandidates(
  memories: MemoryDetail[],
): ScanCandidateView[] {
  return memories.flatMap((memory) =>
    memory.objects.map((object) => ({
      objectId: object.id,
      objectLabel: object.label,
      objectImageUrl: object.imageUrl,
      memoryId: memory.id,
      memoryTitle: memory.title,
      memoryCoverUrl: memory.coverUrl,
    })),
  );
}

export type ForcedScanOutcome = "match" | "ambiguous" | "no_match";

const FORCED_VALUES: ForcedScanOutcome[] = ["match", "ambiguous", "no_match"];

/** Permite recorrer los tres desenlaces con `?resultado=` al ensenar la app. */
export function parseForcedOutcome(
  value: string | string[] | undefined,
): ForcedScanOutcome | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return FORCED_VALUES.find((allowed) => allowed === candidate);
}

/**
 * Mientras no exista el servicio de reconocimiento, el desenlace se simula.
 *
 * Cuando se integre, esto sera una llamada a `/api/scan` y la interfaz no
 * cambiara: los tres desenlaces ya son los definitivos y el cliente sigue sin
 * ver puntuaciones ni umbrales.
 */
export function resolveScan(
  candidates: ScanCandidateView[],
  forced?: ForcedScanOutcome,
): ScanOutcome {
  if (candidates.length === 0) return { status: "no_match" };

  const outcome = forced ?? pickWeightedOutcome();

  if (outcome === "no_match") return { status: "no_match" };

  if (outcome === "ambiguous") {
    const shortlist = candidates.slice(0, Math.min(3, candidates.length));
    // Con un solo objeto registrado no puede haber ambiguedad real.
    if (shortlist.length < 2) return { status: "match", candidate: candidates[0] };
    return { status: "ambiguous", candidates: shortlist };
  }

  const index = Math.floor(Math.random() * candidates.length);
  return { status: "match", candidate: candidates[index] };
}

function pickWeightedOutcome(): ForcedScanOutcome {
  const roll = Math.random();
  if (roll < 0.65) return "match";
  if (roll < 0.85) return "ambiguous";
  return "no_match";
}
