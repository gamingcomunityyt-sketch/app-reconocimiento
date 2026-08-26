import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface EmptyStateProps {
  /** Se prefiere una ilustracion que ensene el concepto a un parrafo que lo cuente. */
  illustration?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  illustration,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center px-6 py-12 text-center",
        className,
      )}
    >
      {illustration ? <div className="mb-7">{illustration}</div> : null}

      <h2 className="text-title font-semibold text-balance">{title}</h2>

      {description ? (
        <p className="mt-2 max-w-xs text-body text-ink-muted text-pretty">
          {description}
        </p>
      ) : null}

      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
