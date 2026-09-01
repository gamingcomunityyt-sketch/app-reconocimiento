// Ejemplo de contrato para una web Next.js/React ya existente.
// No dibujes la reticula dentro de la foto: se envia como coordenadas 0..1.

export type Reticle = { x: number; y: number };
export type CropBox = { x1: number; y1: number; x2: number; y2: number };

export type VisionReference = {
  id: string;
  name: string;
  memory_id?: string | null;
  image_url: string; // URL de la referencia YA preparada/recortada
};

export async function suggestVisionCrop(photo: Blob, reticle: Reticle = { x: 0.5, y: 0.5 }) {
  const form = new FormData();
  form.append("image", photo, "registration.jpg");
  form.append("intent_x", String(reticle.x));
  form.append("intent_y", String(reticle.y));
  const response = await fetch("/api/vision/suggest-crop", { method: "POST", body: form });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ box: CropBox; note: string }>;
}

export async function prepareVisionReference(
  photo: Blob,
  crop: CropBox | null,
  reticle: Reticle = { x: 0.5, y: 0.5 },
  correctPerspective = false,
) {
  const form = new FormData();
  form.append("image", photo, "registration.jpg");
  form.append("intent_x", String(reticle.x));
  form.append("intent_y", String(reticle.y));
  form.append("correct_perspective", String(correctPerspective));
  if (crop) form.append("crop_json", JSON.stringify(crop));
  const response = await fetch("/api/vision/prepare-reference", { method: "POST", body: form });
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

export function base64ImageToBlob(base64: string, mime = "image/jpeg") {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function scanWithVision(
  photo: Blob,
  reticle: Reticle,
  references: VisionReference[],
) {
  const form = new FormData();
  form.append("image", photo, "scan.jpg");
  form.append("reticle_x", String(reticle.x));
  form.append("reticle_y", String(reticle.y));
  form.append("references_json", JSON.stringify(references));
  const response = await fetch("/api/vision/scan", { method: "POST", body: form });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

// Ejemplo de uso al escanear:
// const result = await scanWithVision(scanBlob, {x: .5, y: .5}, userReferences);
// if (result.verdict === "MATCH" && result.target?.memory_id) {
//   router.push(`/memories/${result.target.memory_id}`);
// }
// result.secondary contiene objetos reconocidos que NO deben abrirse automaticamente.
