import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "onMedia";
type Size = "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-contrast hover:bg-accent-hover shadow-card",
  secondary:
    "bg-surface-raised text-ink border border-border hover:border-border-strong shadow-card",
  ghost: "text-ink-muted hover:bg-surface-sunken hover:text-ink",
  danger: "bg-danger-wash text-danger hover:brightness-95",
  // Sobre fotografia o camara: el unico sitio donde se usa cristal.
  onMedia:
    "bg-black/45 text-white backdrop-blur-md hover:bg-black/60 border border-white/10",
};

const SIZES: Record<Size, string> = {
  // 44 px de alto minimo: es el objetivo tactil por debajo del cual la gente falla.
  md: "min-h-11 px-4 text-label",
  lg: "min-h-13 px-5 text-title",
};

export function buttonStyles(
  variant: Variant = "primary",
  size: Size = "md",
  className?: string,
): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium",
    "transition-[background-color,border-color,transform,filter] duration-150 ease-out",
    "active:scale-[0.97]",
    "disabled:pointer-events-none disabled:opacity-40",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

interface ButtonProps extends ComponentProps<"button"> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonStyles(variant, size, className)}
      {...props}
    />
  );
}
