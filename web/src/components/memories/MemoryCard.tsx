import { ScanLine, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { ViewTransition } from "@/components/ui/ViewTransition";
import type { MemorySummary } from "@/lib/data";
import { formatMemoryDate } from "@/lib/format";
import { needsUnoptimized } from "@/lib/media-url";

interface MemoryCardProps {
  memory: MemorySummary;
  /** Solo para las primeras tarjetas visibles: adelanta la imagen mas grande. */
  priority?: boolean;
}

export function MemoryCard({ memory, priority = false }: MemoryCardProps) {
  const date = formatMemoryDate(memory.happenedAt);
  const meta = [date, memory.location].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/recuerdo/${memory.id}`}
      transitionTypes={["nav-forward"]}
      className="group flex flex-col gap-2 focus-visible:outline-none"
    >
      <div className="relative aspect-3/4 overflow-hidden rounded-md bg-surface-sunken shadow-card transition-transform duration-150 ease-out group-active:scale-[0.97] group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent">
        {/* Identidad compartida con el hero del detalle: la miniatura se
            convierte en la imagen grande en lugar de desaparecer. */}
        <ViewTransition
          name={`memory-cover-${memory.id}`}
          share="morph"
          default="none"
        >
          <Image
            src={memory.coverUrl}
            alt={memory.coverAlt}
            fill
            sizes="(min-width: 1024px) 23vw, (min-width: 640px) 31vw, 46vw"
            className="object-cover"
            priority={priority}
            // Las fotografias del dispositivo son blob:/data: y el
            // optimizador de imagenes no puede leerlas.
            unoptimized={needsUnoptimized(memory.coverUrl)}
          />
        </ViewTransition>

        {(memory.hasLinkedObject || memory.isShared) && (
          <div className="absolute top-2 right-2 flex gap-1">
            {memory.hasLinkedObject && (
              <Indicator icon={ScanLine} label="Tiene un objeto vinculado" />
            )}
            {memory.isShared && <Indicator icon={Users} label="Compartido" />}
          </div>
        )}
      </div>

      <div className="px-0.5">
        <h3 className="line-clamp-1 text-title font-medium">{memory.title}</h3>
        {meta ? (
          <p className="mt-0.5 line-clamp-1 text-meta text-ink-muted">{meta}</p>
        ) : null}
      </div>
    </Link>
  );
}

/**
 * Indicador discreto sobre la fotografia. Un icono comunica "esto tiene un
 * objeto" mas rapido que una etiqueta de texto, y no compite con la imagen.
 */
function Indicator({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span
      title={label}
      className="grid size-7 place-items-center rounded-full bg-black/45 text-white backdrop-blur-md"
    >
      <Icon size={14} strokeWidth={2} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
