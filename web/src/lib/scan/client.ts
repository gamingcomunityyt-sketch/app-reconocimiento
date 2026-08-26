import type { ScanCandidateView } from "@/lib/data/types";
import type { ForcedScanOutcome } from "@/lib/data/scan";
import { isClientMediaUrl } from "@/lib/media-url";

import type { ScanApiResponse } from "./types";

export async function submitScan(
  frameBlob: Blob,
  candidates: ScanCandidateView[],
  forced?: ForcedScanOutcome,
): Promise<ScanApiResponse> {
  const form = new FormData();
  form.append("frame", frameBlob, "scan.jpg");

  const payload = candidates.map((candidate) => ({
    objectId: candidate.objectId,
    objectLabel: candidate.objectLabel,
    objectImageUrl: candidate.objectImageUrl,
    memoryId: candidate.memoryId,
    memoryTitle: candidate.memoryTitle,
    memoryCoverUrl: candidate.memoryCoverUrl,
    referenceFromClient: isClientMediaUrl(candidate.objectImageUrl),
  }));
  form.append("candidates", JSON.stringify(payload));

  if (forced) {
    form.append("forced", forced);
  }

  await Promise.all(
    candidates
      .filter((candidate) => isClientMediaUrl(candidate.objectImageUrl))
      .map(async (candidate) => {
        const response = await fetch(candidate.objectImageUrl);
        const blob = await response.blob();
        form.append(`reference_${candidate.objectId}`, blob, `${candidate.objectId}.jpg`);
      }),
  );

  const response = await fetch("/api/scan", {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new Error(`scan_failed_${response.status}`);
  }

  return (await response.json()) as ScanApiResponse;
}
