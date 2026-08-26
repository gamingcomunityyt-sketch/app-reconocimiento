"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default function AppError({ reset }: { reset: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center">
      <EmptyState
        title="Algo no ha ido bien"
        description="No hemos podido cargar esta pantalla. Vuelve a intentarlo."
        action={
          <Button onClick={reset}>
            <RotateCcw size={16} aria-hidden />
            Volver a intentarlo
          </Button>
        }
      />
    </div>
  );
}
