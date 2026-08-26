"use client";

import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";

import { CAMERA_MESSAGES, type Camera } from "./useCamera";

interface CameraSurfaceProps {
  camera: Camera;
  /** Controles y overlays que se dibujan sobre la imagen en directo. */
  children?: ReactNode;
  /** Alternativa cuando la camara no esta disponible. Siempre debe haber una. */
  fallback?: ReactNode;
}

export function CameraSurface({
  camera,
  children,
  fallback,
}: CameraSurfaceProps) {
  const { videoRef, status } = camera;
  const failed = status !== "ready" && status !== "starting";

  return (
    <div className="relative flex-1 overflow-hidden bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        aria-label="Vista de la camara"
        className={cn(
          "absolute inset-0 size-full object-cover transition-opacity duration-300 ease-out",
          status === "ready" ? "opacity-100" : "opacity-0",
        )}
      />

      {status === "starting" ? (
        <p className="absolute inset-0 grid place-items-center text-label text-white/60">
          Abriendo la camara...
        </p>
      ) : null}

      {failed ? (
        <div className="absolute inset-0 grid place-items-center px-2">
          <div className="text-white [&_h2]:text-white [&_p]:text-white/70">
            <EmptyState
              title={CAMERA_MESSAGES[status].title}
              description={CAMERA_MESSAGES[status].description}
              action={fallback}
            />
          </div>
        </div>
      ) : null}

      {status === "ready" ? children : null}
    </div>
  );
}
