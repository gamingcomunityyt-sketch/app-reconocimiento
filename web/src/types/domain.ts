/**
 * Tipos del dominio. Reflejan el esquema descrito en MIGRATION_PLAN.md y son
 * la referencia unica mientras las tablas no existan todavia en Supabase.
 */

export type MemberRole = "owner" | "editor" | "viewer";

export type MemoryVisibility = "private" | "shared";

export type MediaKind = "image" | "video" | "audio";

export interface Profile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface Memory {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  /** Fecha del recuerdo, distinta de la fecha de creacion del registro. */
  happenedAt: string | null;
  location: string | null;
  visibility: MemoryVisibility;
  createdAt: string;
}

export interface MemoryMember {
  memoryId: string;
  userId: string;
  role: MemberRole;
}

export interface Media {
  id: string;
  memoryId: string;
  /** Ruta dentro del bucket privado; se sirve con URL firmada. */
  storagePath: string;
  kind: MediaKind;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: string;
}

/** Objeto fisico al que se vincula un recuerdo. */
export interface PhysicalObject {
  id: string;
  memoryId: string;
  label: string;
  createdAt: string;
}

/**
 * Una vista fotografica de un objeto. Un objeto tiene varias para tolerar
 * cambios de angulo, ya que la verificacion por homografia supone superficie
 * plana y una sola vista no cubre un objeto tridimensional.
 */
export interface ObjectReference {
  id: string;
  objectId: string;
  storagePath: string;
  algorithm: FeatureAlgorithm;
  keypointCount: number;
  /** Blob con los descriptores locales, en Storage y no en la base de datos. */
  descriptorPath: string;
  createdAt: string;
}

export type FeatureAlgorithm = "ORB" | "SIFT";

export type ScanStatus = "match" | "ambiguous" | "no_match";

export type NoMatchReason = "low_texture" | "no_candidates" | "below_threshold";

export interface ScanCandidate {
  objectId: string;
  memoryId: string;
  title: string;
  /** Indice de similitud 0-100 derivado de la evidencia geometrica. */
  confidence: number;
}

/**
 * Resultado que llega al cliente. No expone descriptores, umbrales ni metricas
 * internas del algoritmo.
 */
export type ScanResult =
  | { status: "match"; objectId: string; memoryId: string; confidence: number }
  | { status: "ambiguous"; candidates: ScanCandidate[] }
  | { status: "no_match"; reason: NoMatchReason };
