/**
 * Acceso a los datos que consumen las pantallas.
 *
 * Con Supabase configurado y sesion activa: nube privada (RLS).
 * Sin eso: datos de ejemplo + IndexedDB local (demo).
 */

import { isSupabaseConfigured } from "@/lib/supabase/config";

import {
  getCloudMemory,
  getAuthUser,
  listCloudMemories,
  listCloudScanCandidates,
} from "./cloud";
import { SAMPLE_MEMORIES } from "./sample";
import type { MemoryDetail, MemorySummary, ScanCandidateView } from "./types";

export type * from "./types";
export { memoriesToScanCandidates, parseForcedOutcome, resolveScan } from "./scan";
export type { ForcedScanOutcome } from "./scan";

const QUERY_DELAY_MS = 180;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toSummary(memory: MemoryDetail): MemorySummary {
  return {
    id: memory.id,
    title: memory.title,
    happenedAt: memory.happenedAt,
    location: memory.location,
    coverUrl: memory.coverUrl,
    coverAlt: memory.coverAlt,
    mediaCount: memory.mediaCount,
    hasLinkedObject: memory.hasLinkedObject,
    isShared: memory.isShared,
  };
}

function byRecency(a: MemorySummary, b: MemorySummary): number {
  if (a.happenedAt === b.happenedAt) return 0;
  if (a.happenedAt === null) return 1;
  if (b.happenedAt === null) return -1;
  return a.happenedAt < b.happenedAt ? 1 : -1;
}

async function useCloud(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  return Boolean(await getAuthUser());
}

export async function listMemories(): Promise<MemorySummary[]> {
  if (await useCloud()) {
    return listCloudMemories();
  }
  await delay(QUERY_DELAY_MS);
  return SAMPLE_MEMORIES.map(toSummary).sort(byRecency);
}

export async function getMemory(id: string): Promise<MemoryDetail | null> {
  if (await useCloud()) {
    return getCloudMemory(id);
  }
  await delay(QUERY_DELAY_MS);
  return SAMPLE_MEMORIES.find((memory) => memory.id === id) ?? null;
}

export async function listScanCandidates(): Promise<ScanCandidateView[]> {
  if (await useCloud()) {
    return listCloudScanCandidates();
  }
  await delay(QUERY_DELAY_MS);
  return SAMPLE_MEMORIES.flatMap((memory) =>
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

export async function isCloudMode(): Promise<boolean> {
  return useCloud();
}
