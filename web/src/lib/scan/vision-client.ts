/**
 * Cliente para Vision V10.7 en el mismo origen que la web (`/api/vision/*`).
 * En Vercel lo sirve `api/index.py`; en local, uvicorn o el rewrite de next.config.
 *
 * La retícula es solo UI: no se pinta en la foto; se envía como x,y en 0..1.
 */

export type Reticle = { x: number; y: number };

/** Caja normalizada (0..1) que devuelve /suggest-crop y /prepare-reference. */
export type CropBox = { x1: number; y1: number; x2: number; y2: number };

export type VisionReference = {
  id: string;
  name: string;
  memory_id?: string | null;
  /** URL HTTPS de la referencia ya preparada (Supabase Storage, etc.). */
  image_url: string;
};

export type VisionScanVerdict = "MATCH" | "NO MATCH" | "REPETIR FOTO";

export type VisionHit = {
  reference_id: string;
  memory_id?: string | null;
  name: string;
  role?: string;
  verdict?: string;
  message?: string;
  evidence?: number;
  target_score?: number;
  reticle_affinity?: number;
  keypoints_scan?: number;
  inliers?: number;
  inlier_ratio?: number;
};

export type VisionScanResponse = {
  engine_version?: string;
  verdict: VisionScanVerdict;
  target: VisionHit | null;
  secondary: VisionHit[];
  ranking?: VisionHit[];
  total_ms?: number;
  sift_used?: boolean;
  target_uncertain?: boolean;
};

export const DEFAULT_RETICLE: Reticle = { x: 0.5, y: 0.5 };

export async function suggestVisionCrop(
  photo: Blob,
  reticle: Reticle = DEFAULT_RETICLE,
): Promise<{ box: CropBox; note: string }> {
  const form = new FormData();
  form.append("image", photo, "registration.jpg");
  form.append("intent_x", String(reticle.x));
  form.append("intent_y", String(reticle.y));
  const response = await fetch("/api/vision/suggest-crop", {
    method: "POST",
    body: form,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ box: CropBox; note: string }>;
}

export async function prepareVisionReference(
  photo: Blob,
  crop: CropBox | null,
  reticle: Reticle = DEFAULT_RETICLE,
  correctPerspective = false,
) {
  const form = new FormData();
  form.append("image", photo, "registration.jpg");
  form.append("intent_x", String(reticle.x));
  form.append("intent_y", String(reticle.y));
  form.append("correct_perspective", String(correctPerspective));
  if (crop) form.append("crop_json", JSON.stringify(crop));
  const response = await fetch("/api/vision/prepare-reference", {
    method: "POST",
    body: form,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{
    reference_id_suggestion: string;
    crop: CropBox;
    preparation: string;
    mime_type: string;
    prepared_image_base64: string;
    width: number;
    height: number;
  }>;
}

export function base64ImageToBlob(base64: string, mime = "image/jpeg"): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function scanWithVision(
  photo: Blob,
  reticle: Reticle,
  references: VisionReference[],
): Promise<VisionScanResponse> {
  const form = new FormData();
  form.append("image", photo, "scan.jpg");
  form.append("reticle_x", String(reticle.x));
  form.append("reticle_y", String(reticle.y));
  form.append("references_json", JSON.stringify(references));
  const response = await fetch("/api/vision/scan", {
    method: "POST",
    body: form,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<VisionScanResponse>;
}
