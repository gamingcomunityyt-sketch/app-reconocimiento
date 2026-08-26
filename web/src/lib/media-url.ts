/**
 * URLs de medios creados en el navegador (subidas / camara).
 * No pasan por el optimizador de Next/Image ni por fetch remoto en el servidor.
 */

const MAX_PERSIST_DIMENSION = 1280;
const JPEG_QUALITY = 0.82;

export function isClientMediaUrl(url: string): boolean {
  return url.startsWith("blob:") || url.startsWith("data:");
}

/** Alias semantico para next/image: no optimizar blobs, data URLs ni firmadas. */
export function needsUnoptimized(url: string): boolean {
  return (
    isClientMediaUrl(url) ||
    url.includes(".supabase.co/") ||
    url.startsWith("/")
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Convierte un blob: en data: durable (JPEG comprimido si es imagen).
 * data: y http(s) se dejan igual. Asi el contenido sobrevive a un reload.
 */
export async function toDurableUrl(url: string): Promise<string> {
  if (!url.startsWith("blob:")) return url;

  const response = await fetch(url);
  const blob = await response.blob();

  if (!blob.type.startsWith("image/")) {
    return blobToDataUrl(blob);
  }

  try {
    return await compressImageBlob(blob);
  } catch {
    return blobToDataUrl(blob);
  }
}

async function compressImageBlob(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(
    1,
    MAX_PERSIST_DIMENSION / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return blobToDataUrl(blob);
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const compressed = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
  });
  if (!compressed) return blobToDataUrl(blob);
  return blobToDataUrl(compressed);
}
