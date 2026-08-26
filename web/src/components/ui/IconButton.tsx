import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

type Variant = "plain" | "onMedia" | "raised";

const VARIANTS: Record<Variant, string> = {
  plain: "text-ink-muted hover:bg-surface-sunken hover:text-ink",
  onMedia: "bg-black/45 text-white backdrop-blur-md hover:bg-black/60",
  raised: "bg-surface-raised text-ink shadow-card hover:bg-surface-sunken",
};

interface IconButtonProps extends ComponentProps<"button"> {
  /** Obligatorio: un boton que solo tiene icono no dice nada por si mismo. */
  label: string;
  variant?: Variant;
}

export function IconButton({
  label,
  variant = "plain",
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-grid size-11 shrink-0 place-items-center rounded-full",
        "transition-[background-color,transform] duration-150 ease-out",
        "active:scale-90",
        "disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
