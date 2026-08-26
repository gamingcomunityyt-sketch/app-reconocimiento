"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { MemoryDetail, LinkedObject, MemorySummary } from "./data";
import {
  loadSessionState,
  makeLinkedObjectDurable,
  makeMemoryDurable,
  saveSessionState,
} from "./session-persist";

export interface DraftObjectLink {
  label: string;
  imageUrl: string;
  referenceCount: number;
}

export interface MemoryEditInput {
  title: string;
  happenedAt: string | null;
  location: string | null;
  description: string | null;
}

/**
 * Recuerdos creados o tocados en este navegador.
 *
 * Se guardan en IndexedDB para que sobrevivan a recargas. Cuando exista
 * Supabase, esta capa se sustituye por escrituras remotas y la interfaz no cambia.
 */
interface SessionMemoriesValue {
  createdMemories: MemoryDetail[];
  /** Objetos vinculados a recuerdos de ejemplo u otros no editables en memoria. */
  linkedObjects: Record<string, LinkedObject>;
  removedIds: string[];
  /** true cuando ya se ha leido IndexedDB (evita pisar datos al arrancar). */
  ready: boolean;
  addMemory: (memory: MemoryDetail) => Promise<void>;
  updateMemory: (memory: MemoryDetail, edit: MemoryEditInput) => Promise<void>;
  removeMemory: (id: string) => void;
  isRemoved: (id: string) => boolean;
  findMemory: (id: string) => MemoryDetail | null;
  resolveMemory: (
    id: string,
    initial: MemoryDetail | null,
  ) => MemoryDetail | null;
  applyLibrary: (samples: MemorySummary[]) => MemorySummary[];
  linkObject: (memoryId: string, draft: DraftObjectLink) => Promise<void>;
  hasLinkedObject: (memoryId: string) => boolean;
  withLinkedObject: (memory: MemoryDetail) => MemoryDetail;
}

const SessionMemoriesContext = createContext<SessionMemoriesValue | null>(null);

function toLinkedObject(memoryId: string, draft: DraftObjectLink): LinkedObject {
  return {
    id: `${memoryId}-objeto`,
    label: draft.label,
    imageUrl: draft.imageUrl,
    referenceCount: draft.referenceCount,
  };
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

function applyEdit(memory: MemoryDetail, edit: MemoryEditInput): MemoryDetail {
  const title = edit.title.trim();
  return {
    ...memory,
    title,
    coverAlt: title,
    happenedAt: edit.happenedAt,
    location: edit.location?.trim() || null,
    description: edit.description?.trim() || null,
  };
}

export function SessionMemoriesProvider({ children }: { children: ReactNode }) {
  const [createdMemories, setCreatedMemories] = useState<MemoryDetail[]>([]);
  const [linkedObjects, setLinkedObjects] = useState<Record<string, LinkedObject>>(
    {},
  );
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, MemoryDetail>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadSessionState().then((stored) => {
      if (cancelled) return;
      if (stored) {
        setCreatedMemories(stored.createdMemories);
        setLinkedObjects(stored.linkedObjects);
        setRemovedIds(stored.removedIds);
        setOverrides(stored.overrides);
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void saveSessionState({
      createdMemories,
      linkedObjects,
      removedIds,
      overrides,
    });
  }, [createdMemories, linkedObjects, removedIds, overrides, ready]);

  const isRemoved = useCallback(
    (id: string) => removedIds.includes(id),
    [removedIds],
  );

  const addMemory = useCallback(async (memory: MemoryDetail) => {
    const durable = await makeMemoryDurable(memory);
    setCreatedMemories((previous) => [durable, ...previous]);
    setRemovedIds((previous) => previous.filter((item) => item !== durable.id));
  }, []);

  const findMemory = useCallback(
    (id: string) => {
      if (removedIds.includes(id)) return null;
      return (
        createdMemories.find((item) => item.id === id) ??
        overrides[id] ??
        null
      );
    },
    [createdMemories, overrides, removedIds],
  );

  const withLinkedObject = useCallback(
    (memory: MemoryDetail): MemoryDetail => {
      const session =
        createdMemories.find((item) => item.id === memory.id) ??
        overrides[memory.id];
      if (session) return session;
      const linked = linkedObjects[memory.id];
      if (!linked) return memory;
      return { ...memory, objects: [linked], hasLinkedObject: true };
    },
    [createdMemories, overrides, linkedObjects],
  );

  const resolveMemory = useCallback(
    (id: string, initial: MemoryDetail | null) => {
      if (removedIds.includes(id)) return null;
      const local = findMemory(id);
      if (local) return local;
      if (!initial) return null;
      return withLinkedObject(initial);
    },
    [findMemory, removedIds, withLinkedObject],
  );

  const updateMemory = useCallback(
    async (memory: MemoryDetail, edit: MemoryEditInput) => {
      const next = await makeMemoryDurable(applyEdit(memory, edit));
      const isCreated = createdMemories.some((item) => item.id === memory.id);

      if (isCreated) {
        setCreatedMemories((previous) =>
          previous.map((item) => (item.id === memory.id ? next : item)),
        );
        return;
      }

      setOverrides((previous) => ({ ...previous, [memory.id]: next }));
    },
    [createdMemories],
  );

  const removeMemory = useCallback((id: string) => {
    setRemovedIds((previous) =>
      previous.includes(id) ? previous : [...previous, id],
    );
    setCreatedMemories((previous) => previous.filter((item) => item.id !== id));
    setOverrides((previous) => {
      if (!(id in previous)) return previous;
      const next = { ...previous };
      delete next[id];
      return next;
    });
    setLinkedObjects((previous) => {
      if (!(id in previous)) return previous;
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }, []);

  const applyLibrary = useCallback(
    (samples: MemorySummary[]) => {
      const createdIds = new Set(createdMemories.map((item) => item.id));
      const sampleRows = samples
        .filter((item) => !removedIds.includes(item.id) && !createdIds.has(item.id))
        .map((item) => {
          const override = overrides[item.id];
          if (override) return toSummary(override);
          if (linkedObjects[item.id]) {
            return { ...item, hasLinkedObject: true };
          }
          return item;
        });

      return [
        ...createdMemories
          .filter((item) => !removedIds.includes(item.id))
          .map(toSummary),
        ...sampleRows,
      ];
    },
    [createdMemories, linkedObjects, overrides, removedIds],
  );

  const linkObject = useCallback(async (memoryId: string, draft: DraftObjectLink) => {
    const linked = await makeLinkedObjectDurable(toLinkedObject(memoryId, draft));

    setCreatedMemories((previous) => {
      if (!previous.some((item) => item.id === memoryId)) return previous;
      return previous.map((memory) =>
        memory.id === memoryId
          ? { ...memory, objects: [linked], hasLinkedObject: true }
          : memory,
      );
    });

    setOverrides((previous) => {
      const current = previous[memoryId];
      if (!current) return previous;
      return {
        ...previous,
        [memoryId]: { ...current, objects: [linked], hasLinkedObject: true },
      };
    });

    setLinkedObjects((previous) => ({ ...previous, [memoryId]: linked }));
  }, []);

  const hasLinkedObject = useCallback(
    (memoryId: string) => {
      if (removedIds.includes(memoryId)) return false;
      const local =
        createdMemories.find((item) => item.id === memoryId) ??
        overrides[memoryId];
      if (local) return local.hasLinkedObject;
      return memoryId in linkedObjects;
    },
    [createdMemories, linkedObjects, overrides, removedIds],
  );

  const value = useMemo(
    () => ({
      createdMemories,
      linkedObjects,
      removedIds,
      ready,
      addMemory,
      updateMemory,
      removeMemory,
      isRemoved,
      findMemory,
      resolveMemory,
      applyLibrary,
      linkObject,
      hasLinkedObject,
      withLinkedObject,
    }),
    [
      createdMemories,
      linkedObjects,
      removedIds,
      ready,
      addMemory,
      updateMemory,
      removeMemory,
      isRemoved,
      findMemory,
      resolveMemory,
      applyLibrary,
      linkObject,
      hasLinkedObject,
      withLinkedObject,
    ],
  );

  return (
    <SessionMemoriesContext.Provider value={value}>
      {children}
    </SessionMemoriesContext.Provider>
  );
}

export function useSessionMemories(): SessionMemoriesValue {
  const value = useContext(SessionMemoriesContext);
  if (!value) {
    throw new Error(
      "useSessionMemories debe usarse dentro de SessionMemoriesProvider",
    );
  }
  return value;
}
