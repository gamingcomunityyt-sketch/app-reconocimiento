import type { ReactNode } from "react";

import { AppNavigation } from "@/components/nav/AppNavigation";

/**
 * Pantallas que llevan navegacion inferior. El detalle, la creacion y el
 * escaneo quedan fuera a proposito: son experiencias inmersivas donde la barra
 * estorbaria.
 */
export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="flex-1">{children}</div>
      <AppNavigation />
    </>
  );
}
