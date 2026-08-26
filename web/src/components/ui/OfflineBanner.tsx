"use client";

import { WifiOff } from "lucide-react";
import { useOffline } from "next/offline";

/**
 * Aviso de falta de conexion.
 *
 * No bloquea nada: la biblioteca ya cargada sigue navegable y Next reintenta
 * solo las peticiones que se quedaron a medias al recuperar la cobertura.
 */
export function OfflineBanner() {
  const isOffline = useOffline();

  if (!isOffline) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-70 flex items-center justify-center gap-2 bg-surface-inverse px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-meta font-medium text-ink-inverse"
    >
      <WifiOff size={14} aria-hidden />
      Sin conexion. Lo nuevo llegara al recuperarla.
    </div>
  );
}
