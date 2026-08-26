"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Video, X } from "lucide-react";
import { useEffect } from "react";

import { IconButton } from "@/components/ui/IconButton";
import type { MediaItem } from "@/lib/data";
import { formatDuration } from "@/lib/format";
import { needsUnoptimized } from "@/lib/media-url";

interface MediaViewerProps {
  items: MediaItem[];
  /** Indice abierto, o null cuando esta cerrado. */
  index: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

/**
 * Visor a pantalla completa. Aqui el contenido es lo unico que importa, asi que
 * la interfaz se reduce a cerrar y moverse, sobre fondo negro.
 */
export function MediaViewer({
  items,
  index,
  onClose,
  onNavigate,
}: MediaViewerProps) {
  const reduceMotion = useReducedMotion();
  const isOpen = index !== null;
  const item = isOpen ? items[index] : null;

  useEffect(() => {
    if (index === null) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && index! > 0) onNavigate(index! - 1);
      if (event.key === "ArrowRight" && index! < items.length - 1) {
        onNavigate(index! + 1);
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [index, items.length, onClose, onNavigate]);

  return (
    <AnimatePresence>
      {isOpen && item ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={item.alt}
          className="fixed inset-0 z-60 flex flex-col bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
        >
          <header className="flex items-center justify-between px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
            <IconButton
              label="Cerrar"
              variant="onMedia"
              onClick={onClose}
              className="bg-white/10 text-white"
            >
              <X size={20} aria-hidden />
            </IconButton>
            <span className="font-mono text-meta text-white/70 tabular-nums">
              {index + 1} / {items.length}
            </span>
            <span className="size-11" />
          </header>

          <motion.div
            key={item.id}
            drag={reduceMotion ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.3}
            onDragEnd={(_, info) => {
              if (Math.abs(info.offset.y) > 120) onClose();
            }}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="relative min-h-0 flex-1"
          >
            {item.previewUrl ? (
              <Image
                src={item.previewUrl}
                alt={item.alt}
                fill
                sizes="100vw"
                className="object-contain"
                unoptimized={needsUnoptimized(item.previewUrl)}
              />
            ) : null}

            {/* Un video sin archivo real no lleva boton de reproducir: un
                control que no hace nada es peor que no tenerlo. */}
            {item.kind === "video" ? (
              <span className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-meta text-white backdrop-blur-md">
                <Video size={14} aria-hidden />
                Video · {formatDuration(item.durationMs)}
              </span>
            ) : null}
          </motion.div>

          <footer className="flex items-center justify-between gap-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <IconButton
              label="Anterior"
              variant="onMedia"
              disabled={index === 0}
              onClick={() => onNavigate(index - 1)}
              className="bg-white/10 text-white"
            >
              <ChevronLeft size={20} aria-hidden />
            </IconButton>

            <p className="min-w-0 flex-1 text-center text-meta text-white/80">
              {item.caption ?? ""}
            </p>

            <IconButton
              label="Siguiente"
              variant="onMedia"
              disabled={index === items.length - 1}
              onClick={() => onNavigate(index + 1)}
              className="bg-white/10 text-white"
            >
              <ChevronRight size={20} aria-hidden />
            </IconButton>
          </footer>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
