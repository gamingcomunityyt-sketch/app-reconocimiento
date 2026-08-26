import Image from "next/image";

import type { LinkedObject } from "@/lib/data";
import { formatCount } from "@/lib/format";
import { needsUnoptimized } from "@/lib/media-url";

/**
 * Objeto fisico vinculado. La fotografia del objeto es lo importante: es lo que
 * el usuario tiene que reconocer para saber a que apuntar.
 */
export function ObjectCard({ object }: { object: LinkedObject }) {
  return (
    <div className="flex w-32 shrink-0 flex-col gap-2">
      <div className="relative aspect-square overflow-hidden rounded-md bg-surface-sunken shadow-card">
        <Image
          src={object.imageUrl}
          alt={object.label}
          fill
          sizes="128px"
          className="object-cover"
          unoptimized={needsUnoptimized(object.imageUrl)}
        />
      </div>
      <div>
        <p className="line-clamp-2 text-label font-medium">{object.label}</p>
        <p className="mt-0.5 text-meta text-ink-subtle">
          {formatCount(object.referenceCount, "vista", "vistas")}
        </p>
      </div>
    </div>
  );
}
