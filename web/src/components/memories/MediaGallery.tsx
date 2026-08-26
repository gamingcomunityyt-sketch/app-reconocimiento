"use client";

import { Play } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import type { MediaItem } from "@/lib/data";
import { formatCount, formatDuration } from "@/lib/format";
import { needsUnoptimized } from "@/lib/media-url";

import { AudioNote } from "./AudioNote";
import { MediaViewer } from "./MediaViewer";

export function MediaGallery({ media }: { media: MediaItem[] }) {
  const visual = media.filter((item) => item.kind !== "audio");
  const audios = media.filter((item) => item.kind === "audio");
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (media.length === 0) return null;

  return (
    <>
      {visual.length > 0 ? (
        <section className="mt-8">
          <SectionTitle>
            {visual.some((item) => item.kind === "video")
              ? `${visual.length} fotos y videos`
              : formatCount(visual.length, "foto", "fotos")}
          </SectionTitle>

          <ul className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {visual.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpenIndex(index)}
                  aria-label={`Abrir: ${item.alt}`}
                  className="relative block aspect-square w-full overflow-hidden rounded-sm bg-surface-sunken transition-transform duration-150 ease-out active:scale-[0.96]"
                >
                  {item.previewUrl ? (
                    <Image
                      src={item.previewUrl}
                      alt={item.alt}
                      fill
                      sizes="(min-width: 640px) 22vw, 32vw"
                      className="object-cover"
                      unoptimized={needsUnoptimized(item.previewUrl)}
                    />
                  ) : null}

                  {/* Los videos del grid nunca se cargan: solo su fotograma de
                      portada. Cargarlos aqui consumiria la tarifa de datos. */}
                  {item.kind === "video" ? (
                    <span className="absolute inset-x-1 bottom-1 flex items-center gap-1 text-[0.6875rem] font-medium text-white drop-shadow-md">
                      <Play size={11} fill="currentColor" aria-hidden />
                      {formatDuration(item.durationMs)}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {audios.length > 0 ? (
        <section className="mt-8">
          <SectionTitle>
            {formatCount(audios.length, "nota de audio", "notas de audio")}
          </SectionTitle>
          <ul className="mt-3 flex flex-col gap-2">
            {audios.map((item) => (
              <li key={item.id}>
                <AudioNote item={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <MediaViewer
        items={visual}
        index={openIndex}
        onClose={() => setOpenIndex(null)}
        onNavigate={setOpenIndex}
      />
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-label font-semibold text-ink-muted">{children}</h2>
  );
}
