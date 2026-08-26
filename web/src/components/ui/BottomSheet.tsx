"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Oculta el titulo visualmente cuando el contenido ya se explica solo. */
  hideTitle?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Hoja inferior con arrastre para cerrar.
 *
 * Es el unico sitio, junto al overlay de escaneo, donde se usa una libreria de
 * animacion: seguir el dedo y decidir si el gesto cierra o vuelve a su sitio a
 * mano sale mal.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  hideTitle = false,
  children,
  className,
}: BottomSheetProps) {
  const titleId = useId();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    // Bloquear el desplazamiento del fondo evita que el gesto de arrastre de la
    // hoja mueva la pagina que hay detras.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            drag={reduceMotion ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              // Un gesto rapido cierra aunque sea corto; uno lento necesita
              // recorrido. Asi responde a la intencion y no solo a la distancia.
              if (info.offset.y > 110 || info.velocity.y > 500) onClose();
            }}
            initial={reduceMotion ? { opacity: 0 } : { y: "100%" }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            className={cn(
              "relative w-full max-w-lg overflow-hidden rounded-t-lg bg-surface-raised shadow-float",
              "sm:rounded-lg",
              className,
            )}
          >
            {/* Asa: comunica que la hoja se puede arrastrar sin decirlo. */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-border-strong" />
            </div>

            <h2
              id={titleId}
              className={cn(
                "px-5 pb-1 text-title font-semibold",
                hideTitle && "sr-only",
              )}
            >
              {title}
            </h2>

            <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {children}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
