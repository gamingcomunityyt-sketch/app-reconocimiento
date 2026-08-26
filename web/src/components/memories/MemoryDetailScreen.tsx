"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { LinkObjectFlow } from "@/components/create/LinkObjectFlow";
import { buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { MemoryDetail } from "@/lib/data";
import { useSessionMemories } from "@/lib/session-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { MemoryDetailView } from "./MemoryDetailView";

interface MemoryDetailScreenProps {
  id: string;
  initialMemory?: MemoryDetail | null;
}

/**
 * Detalle editable: permite vincular un objeto fisico desde la biblioteca,
 * no solo al crear el recuerdo.
 */
export function MemoryDetailScreen({
  id,
  initialMemory = null,
}: MemoryDetailScreenProps) {
  const { resolveMemory, linkObject, ready } = useSessionMemories();
  const [linking, setLinking] = useState(false);
  const cloud = isSupabaseConfigured();

  const memory = useMemo(
    () => resolveMemory(id, initialMemory),
    [resolveMemory, id, initialMemory],
  );

  if (linking && memory) {
    return (
      <LinkObjectFlow
        memoryCoverUrl={memory.coverUrl}
        onCancel={() => setLinking(false)}
        onDone={(draft) => {
          void linkObject(memory.id, draft).then(() => setLinking(false));
        }}
      />
    );
  }

  if (!ready && !memory) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-meta text-ink-muted">Cargando recuerdo…</p>
      </div>
    );
  }

  if (!memory) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <EmptyState
          title="No encontramos este recuerdo"
          description="Puede que lo hayas eliminado o que el enlace este mal."
          action={
            <Link
              href="/"
              transitionTypes={["nav-back"]}
              className={buttonStyles("secondary")}
            >
              Volver a Recuerdos
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <MemoryDetailView
      memory={memory}
      onLinkObject={cloud ? undefined : () => setLinking(true)}
    />
  );
}
