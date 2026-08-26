import { cn } from "@/lib/cn";

const CORNERS = [
  "top-0 left-0 border-t-2 border-l-2 rounded-tl-md",
  "top-0 right-0 border-t-2 border-r-2 rounded-tr-md",
  "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-md",
  "bottom-0 right-0 border-b-2 border-r-2 rounded-br-md",
];

/**
 * Area de deteccion. Cuatro esquinas en lugar de un marco cerrado: indica donde
 * encuadrar sin tapar el objeto ni convertirse en un overlay enorme.
 */
export function FramingBracket({ analyzing = false }: { analyzing?: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 grid place-items-center"
    >
      <div className="relative aspect-square w-[70%] max-w-sm">
        {CORNERS.map((corner) => (
          <span
            key={corner}
            className={cn("absolute size-9 border-white/85", corner)}
          />
        ))}

        {analyzing ? (
          <span
            className="absolute inset-0 rounded-md ring-2 ring-white/60"
            style={{ animation: "scan-pulse 1.4s ease-in-out infinite" }}
          />
        ) : null}
      </div>
    </div>
  );
}
