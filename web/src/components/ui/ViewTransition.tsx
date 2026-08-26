import * as React from "react";
import type { ComponentType, ReactNode } from "react";

/**
 * `<ViewTransition>` de React.
 *
 * El canal de React que usa el App Router ya la incluye y funciona sin
 * configuracion, pero `@types/react` todavia no la declara. En lugar de repartir
 * conversiones de tipo por todas las pantallas, el acceso sin tipar se resuelve
 * una unica vez aqui y el resto de la aplicacion consume una API tipada.
 *
 * Si la version de React no la expusiera, el componente se limita a renderizar
 * su contenido: la aplicacion funciona igual, solo sin animar.
 */

/** Nombre de clase CSS, o `none` / `auto`. */
export type TransitionClass = string;

/**
 * Una clase, o un mapa de tipo de transicion a clase, para reaccionar de forma
 * distinta segun si la navegacion va hacia dentro o hacia atras.
 */
export type TransitionTrigger = TransitionClass | Record<string, TransitionClass>;

export interface ViewTransitionProps {
  children: ReactNode;
  /** Identidad compartida entre dos pantallas: permite la morfologia. */
  name?: string;
  default?: TransitionTrigger;
  enter?: TransitionTrigger;
  exit?: TransitionTrigger;
  share?: TransitionTrigger;
  update?: TransitionTrigger;
}

const Implementation = (
  React as unknown as {
    ViewTransition?: ComponentType<ViewTransitionProps>;
  }
).ViewTransition;

export function ViewTransition(props: ViewTransitionProps) {
  if (!Implementation) return <>{props.children}</>;
  return <Implementation {...props} />;
}

/**
 * Deslizamiento direccional de una pantalla completa.
 *
 * Va en cada `page.tsx` y nunca en un layout: los layouts persisten entre
 * navegaciones, asi que sus animaciones de entrada y salida no se disparan
 * nunca.
 */
const DIRECTIONAL: Record<string, TransitionClass> = {
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  default: "none",
};

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={DIRECTIONAL} exit={DIRECTIONAL} default="none">
      {children}
    </ViewTransition>
  );
}
