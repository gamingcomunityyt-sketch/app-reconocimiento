/**
 * Vibracion corta como confirmacion de una accion.
 *
 * Solo existe en algunos navegadores moviles, asi que se comprueba antes. No
 * vibra si el usuario ha pedido reducir el movimiento: forma parte de lo mismo.
 */
export function vibrate(durationMs: number): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  navigator.vibrate?.(durationMs);
}
