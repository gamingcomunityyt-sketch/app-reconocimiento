import type { ScanCandidateView } from "@/lib/data/types";
import type { ForcedScanOutcome } from "@/lib/data/scan";

import type { ScanApiResponse } from "./types";

export async function submitScan(
  frameBlob: Blob,
  candidates: ScanCandidateView[],
  forced?: ForcedScanOutcome,
): Promise<ScanApiResponse> {
  const form = new FormData();
  form.append("frame", frameBlob, "scan.jpg");

  const attachments = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const response = await fetch(candidate.objectImageUrl, { cache: "no-store" });
        if (!response.ok) {
          return { candidate, attached: false as const };
        }
        const blob = await response.blob();
        if (blob.size === 0) {
          return { candidate, attached: false as const };
        }
        return { candidate, attached: true as const, blob };
      } catch {
        return { candidate, attached: false as const };
      }
    }),
  );

  const payload = attachments.map(({ candidate, attached }) => ({
    objectId: candidate.objectId,
    objectLabel: candidate.objectLabel,
    objectImageUrl: candidate.objectImageUrl,
    memoryId: candidate.memoryId,
    memoryTitle: candidate.memoryTitle,
    memoryCoverUrl: candidate.memoryCoverUrl,
    referenceFromClient: attached,
  }));
  form.append("candidates", JSON.stringify(payload));

  if (forced) {
    form.append("forced", forced);
  }

  for (const item of attachments) {
    if (!item.attached || !item.blob) continue;
    form.append(
      `reference_${item.candidate.objectId}`,
      item.blob,
      `${item.candidate.objectId}.jpg`,
    );
  }

  const response = await fetch("/api/scan", {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new Error(`scan_failed_${response.status}`);
  }

  return (await response.json()) as ScanApiResponse;
}
