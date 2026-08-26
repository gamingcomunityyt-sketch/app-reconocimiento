"use client";

import { motion } from "motion/react";
import Image from "next/image";

import { FramingBracket } from "@/components/camera/FramingBracket";
import { ViewTransition } from "@/components/ui/ViewTransition";
import type { ScanCandidateView } from "@/lib/data";
import { needsUnoptimized } from "@/lib/media-url";

export type ScanPhase = "aiming" | "analyzing" | "resolved";

/**
 * Lo que se dibuja encima de la imagen en directo.
 *
 * Deliberadamente minimo: cuatro esquinas, una linea de texto y, cuando hay
 * acierto, la miniatura del recuerdo. Nada de overlays enormes ni de ventanas
 * de exito.
 */
export function RecognitionOverlay({
  phase,
  match,
}: {
  phase: ScanPhase;
  match: ScanCandidateView | null;
}) {
  return (
    <>
      <FramingBracket analyzing={phase === "analyzing"} />

      {!match ? (
        <p
          aria-live="polite"
          className="absolute inset-x-0 bottom-6 px-8 text-center text-label font-medium text-white drop-shadow-lg"
        >
          {phase === "analyzing" ? "Analizando..." : "Apunta a un objeto"}
        </p>
      ) : null}

      {match ? <MatchCard candidate={match} /> : null}
    </>
  );
}

/**
 * Feedback del acierto. La portada lleva la misma identidad de transicion que
 * el hero del detalle, asi que al navegar esta miniatura crece hasta ocupar la
 * pantalla: el objeto reconocido se convierte en el recuerdo, y eso es todo el
 * mensaje de exito que hace falta.
 */
function MatchCard({ candidate }: { candidate: ScanCandidateView }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
      className="absolute inset-x-4 bottom-6 flex items-center gap-3 rounded-md bg-black/55 p-3 backdrop-blur-xl"
    >
      <ViewTransition
        name={`memory-cover-${candidate.memoryId}`}
        share="morph"
        default="none"
      >
        <div className="relative size-14 shrink-0 overflow-hidden rounded-sm bg-white/10">
          <Image
            src={candidate.memoryCoverUrl}
            alt=""
            fill
            sizes="56px"
            className="object-cover"
            unoptimized={needsUnoptimized(candidate.memoryCoverUrl)}
          />
        </div>
      </ViewTransition>

      <div className="min-w-0">
        <p className="text-meta text-white/60">{candidate.objectLabel}</p>
        <p className="truncate text-title font-semibold text-white">
          {candidate.memoryTitle}
        </p>
      </div>
    </motion.div>
  );
}
