"use client";

import { Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import type { MemorySummary } from "@/lib/data";
import { formatCount } from "@/lib/format";
import { useSessionMemories } from "@/lib/session-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { LinkIllustration } from "./LinkIllustration";
import { MemoryGrid } from "./MemoryGrid";

/**
 * Acentos fuera para que "cadaques" encuentre "Cadaques" y viceversa. Quien
 * busca en el movil no pone tildes.
 */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matches(memory: MemorySummary, query: string): boolean {
  const haystack = normalize(`${memory.title} ${memory.location ?? ""}`);
  return normalize(query)
    .split(/\s+/)
    .every((term) => haystack.includes(term));
}

export function LibraryView({ memories }: { memories: MemorySummary[] }) {
  const [query, setQuery] = useState("");
  const { applyLibrary } = useSessionMemories();
  const cloud = isSupabaseConfigured();

  const all = useMemo(
    () => (cloud ? memories : applyLibrary(memories)),
    [applyLibrary, cloud, memories],
  );

  const visible = useMemo(
    () => (query.trim() ? all.filter((memory) => matches(memory, query)) : all),
    [all, query],
  );

  const isSearching = query.trim().length > 0;

  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-baseline justify-between gap-3 pt-2">
          <h1 className="text-display font-semibold tracking-tight">
            Recuerdos
          </h1>
          {all.length > 0 ? (
            <p className="shrink-0 text-meta text-ink-muted">
              {formatCount(all.length, "recuerdo", "recuerdos")}
            </p>
          ) : null}
        </header>

        {all.length > 0 ? (
          <div className="mt-4">
            <label className="relative block">
              <span className="sr-only">Buscar recuerdos</span>
              <Search
                size={17}
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-subtle"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por titulo o lugar"
                className="h-11 w-full rounded-full bg-surface-sunken pr-11 pl-10 text-body outline-none placeholder:text-ink-subtle [&::-webkit-search-cancel-button]:hidden"
              />
              {isSearching ? (
                <IconButton
                  label="Borrar la busqueda"
                  onClick={() => setQuery("")}
                  className="absolute top-1/2 right-0.5 size-10 -translate-y-1/2"
                >
                  <X size={17} aria-hidden />
                </IconButton>
              ) : null}
            </label>
          </div>
        ) : null}

        <div className="mt-5 pb-32">
          {visible.length > 0 ? (
            <MemoryGrid memories={visible} />
          ) : isSearching ? (
            <EmptyState
              title="Sin resultados"
              description={`No hay recuerdos que coincidan con "${query.trim()}".`}
              action={
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className={buttonStyles("secondary")}
                >
                  Ver todos
                </button>
              }
            />
          ) : (
            <EmptyState
              illustration={<LinkIllustration />}
              title="Guarda un recuerdo y vinculalo a un objeto"
              description="Despues apunta con la camara a ese objeto y el recuerdo se abre solo."
              action={
                <Link
                  href="/crear"
                  transitionTypes={["nav-forward"]}
                  className={buttonStyles("primary", "lg")}
                >
                  <Plus size={19} aria-hidden />
                  Crear mi primer recuerdo
                </Link>
              }
            />
          )}
        </div>
      </div>

      {all.length > 0 ? (
        <Link
          href="/crear"
          transitionTypes={["nav-forward"]}
          className="fixed right-4 bottom-27 z-30 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-label font-semibold text-accent-contrast shadow-float transition-transform duration-150 ease-out active:scale-[0.97]"
        >
          <Plus size={18} strokeWidth={2.5} aria-hidden />
          Crear
        </Link>
      ) : null}
    </>
  );
}
