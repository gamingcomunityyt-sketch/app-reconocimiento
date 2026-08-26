"use client";

import { Images, ScanLine, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

const DESTINATIONS = [
  { href: "/", label: "Recuerdos", icon: Images },
  { href: "/perfil", label: "Perfil", icon: User },
] as const;

/**
 * Tres destinos y nada mas. Escanear va en el centro, elevado y en color de
 * acento, porque es la accion diferencial del producto y la que tiene que
 * encontrarse sin que nadie la explique.
 *
 * `viewTransitionName` la ancla durante los deslizamientos de navegacion: el
 * usuario necesita un punto fijo para entender que se movio el contenido y no
 * la pantalla entera.
 */
export function AppNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegacion principal"
      style={{ viewTransitionName: "app-nav" }}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto flex items-stretch gap-1 rounded-full border border-border bg-surface-raised/80 px-2 pt-2 pb-1.5 shadow-float backdrop-blur-xl">
        <NavItem {...DESTINATIONS[0]} active={pathname === "/"} />

        <Link
          href="/escanear"
          aria-label="Escanear un objeto"
          className="group flex w-20 flex-col items-center gap-1 focus-visible:outline-none"
        >
          <span
            className={cn(
              "-mt-5 grid size-13 place-items-center rounded-full bg-accent text-accent-contrast shadow-float",
              "transition-transform duration-150 ease-out group-active:scale-90",
              "group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent",
            )}
          >
            <ScanLine size={24} strokeWidth={2} aria-hidden />
          </span>
          <span className="text-[0.6875rem] leading-none font-semibold text-accent-ink">
            Escanear
          </span>
        </Link>

        <NavItem {...DESTINATIONS[1]} active={pathname.startsWith("/perfil")} />
      </div>
    </nav>
  );
}

interface NavItemProps {
  href: string;
  label: string;
  icon: typeof Images;
  active: boolean;
}

function NavItem({ href, label, icon: Icon, active }: NavItemProps) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex w-20 flex-col items-center justify-center gap-1 rounded-full py-1.5",
        "transition-colors duration-150 ease-out",
        active ? "text-ink" : "text-ink-subtle hover:text-ink-muted",
      )}
    >
      <Icon
        size={21}
        strokeWidth={active ? 2.25 : 1.75}
        aria-hidden
        className="transition-transform duration-150 ease-out group-active:scale-90"
      />
      <span
        className={cn(
          "text-[0.6875rem] leading-none",
          active ? "font-semibold" : "font-medium",
        )}
      >
        {label}
      </span>
    </Link>
  );
}
