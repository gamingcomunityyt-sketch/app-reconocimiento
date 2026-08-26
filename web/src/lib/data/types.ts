/**
 * Modelos de vista.
 *
 * Los tipos de `src/types/domain.ts` reflejan las tablas: estan normalizados y
 * separan recuerdo, multimedia y objeto. Las pantallas necesitan lo contrario,
 * el recuerdo ya compuesto, asi que esta capa define esa forma. Cuando la
 * consulta pase a Supabase cambia como se rellenan, no como se consumen.
 */

import type { MediaKind, MemberRole } from "@/types/domain";

export interface MediaItem {
  id: string;
  kind: MediaKind;
  /** Imagen, o fotograma de portada si es video. Los audios no tienen. */
  previewUrl: string | null;
  /** Texto alternativo real, no el titulo del recuerdo repetido. */
  alt: string;
  durationMs: number | null;
  caption: string | null;
}

/** Objeto fisico que abre el recuerdo al apuntarle con la camara. */
export interface LinkedObject {
  id: string;
  label: string;
  imageUrl: string;
  /** Numero de vistas fotograficas registradas del objeto. */
  referenceCount: number;
}

export interface MemberView {
  id: string;
  name: string;
  role: MemberRole;
}

/** Lo que necesita una tarjeta de la biblioteca, y nada mas. */
export interface MemorySummary {
  id: string;
  title: string;
  happenedAt: string | null;
  location: string | null;
  coverUrl: string;
  coverAlt: string;
  mediaCount: number;
  hasLinkedObject: boolean;
  isShared: boolean;
}

export interface MemoryDetail extends MemorySummary {
  description: string | null;
  media: MediaItem[];
  objects: LinkedObject[];
  members: MemberView[];
}

/**
 * Candidato de un escaneo, tal y como lo ve la interfaz. Deliberadamente sin
 * puntuaciones ni metricas: eso pertenece al sistema, no al usuario.
 */
export interface ScanCandidateView {
  objectId: string;
  objectLabel: string;
  objectImageUrl: string;
  memoryId: string;
  memoryTitle: string;
  memoryCoverUrl: string;
}

export type ScanOutcome =
  | { status: "match"; candidate: ScanCandidateView }
  | { status: "ambiguous"; candidates: ScanCandidateView[] }
  | { status: "no_match" };
