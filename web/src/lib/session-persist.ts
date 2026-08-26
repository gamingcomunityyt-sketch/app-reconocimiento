import type { LinkedObject, MemoryDetail } from "./data";
import { toDurableUrl } from "./media-url";

const DB_NAME = "recuerdos-session";
const DB_VERSION = 1;
const STORE = "state";
const STATE_KEY = "memories";

export interface SessionPersistState {
  createdMemories: MemoryDetail[];
  linkedObjects: Record<string, LinkedObject>;
  /** Ids ocultos (propios o de ejemplo). */
  removedIds: string[];
  /** Ediciones de recuerdos de ejemplo (no viven en createdMemories). */
  overrides: Record<string, MemoryDetail>;
}

function normalizeState(
  value: Partial<SessionPersistState> | null | undefined,
): SessionPersistState | null {
  if (!value) return null;
  return {
    createdMemories: value.createdMemories ?? [],
    linkedObjects: value.linkedObjects ?? {},
    removedIds: value.removedIds ?? [],
    overrides: value.overrides ?? {},
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("idb_open_failed"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

export async function loadSessionState(): Promise<SessionPersistState | null> {
  if (typeof indexedDB === "undefined") return null;

  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(STATE_KEY);
      request.onerror = () => reject(request.error ?? new Error("idb_get_failed"));
      request.onsuccess = () => {
        resolve(normalizeState(request.result as Partial<SessionPersistState> | undefined));
      };
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

export async function saveSessionState(state: SessionPersistState): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(state, STATE_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error ?? new Error("idb_put_failed"));
    });
  } catch {
    // Quota u otro fallo de almacenamiento: la sesion sigue en memoria.
  }
}

async function mapUrls(
  urls: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = [...new Set(urls.filter((url): url is string => Boolean(url)))];
  const entries = await Promise.all(
    unique.map(async (url) => [url, await toDurableUrl(url)] as const),
  );
  return new Map(entries);
}

function rewrite(url: string, map: Map<string, string>): string {
  return map.get(url) ?? url;
}

/** Sustituye blob: por data: en todo el recuerdo antes de persistir. */
export async function makeMemoryDurable(
  memory: MemoryDetail,
): Promise<MemoryDetail> {
  const map = await mapUrls([
    memory.coverUrl,
    ...memory.media.map((item) => item.previewUrl),
    ...memory.objects.map((object) => object.imageUrl),
  ]);

  return {
    ...memory,
    coverUrl: rewrite(memory.coverUrl, map),
    media: memory.media.map((item) => ({
      ...item,
      previewUrl: item.previewUrl ? rewrite(item.previewUrl, map) : null,
    })),
    objects: memory.objects.map((object) => ({
      ...object,
      imageUrl: rewrite(object.imageUrl, map),
    })),
  };
}

export async function makeLinkedObjectDurable(
  object: LinkedObject,
): Promise<LinkedObject> {
  return {
    ...object,
    imageUrl: await toDurableUrl(object.imageUrl),
  };
}
