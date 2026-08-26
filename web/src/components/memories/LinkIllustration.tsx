import { Images, ScanLine, Watch } from "lucide-react";

/**
 * El concepto del producto en una imagen: un objeto fisico a la izquierda, un
 * recuerdo a la derecha, y el escaneo uniendolos. Existe para que el estado
 * vacio no tenga que explicarlo con un muro de texto.
 */
export function LinkIllustration() {
  return (
    <div aria-hidden className="flex items-center gap-3">
      <Tile>
        <Watch size={26} strokeWidth={1.5} className="text-ink-muted" />
      </Tile>

      <div className="flex items-center gap-1.5">
        <Dot />
        <span className="grid size-9 place-items-center rounded-full bg-accent text-accent-contrast shadow-card">
          <ScanLine size={17} strokeWidth={2.25} />
        </span>
        <Dot />
      </div>

      <Tile>
        <Images size={26} strokeWidth={1.5} className="text-ink-muted" />
      </Tile>
    </div>
  );
}

function Tile({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid size-18 place-items-center rounded-md border border-border bg-surface-raised shadow-card">
      {children}
    </span>
  );
}

function Dot() {
  return <span className="size-1 rounded-full bg-border-strong" />;
}
