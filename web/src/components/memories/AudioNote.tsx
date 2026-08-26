"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import type { MediaItem } from "@/lib/data";
import { formatDuration } from "@/lib/format";

const BAR_COUNT = 32;
const TICK_MS = 100;

/** Alturas estables por identificador: la misma nota se dibuja siempre igual. */
function waveform(seed: string): number[] {
  let state = 0;
  for (const character of seed) {
    state = (state * 31 + character.codePointAt(0)!) % 100_000;
  }
  return Array.from({ length: BAR_COUNT }, (_, index) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    const normalized = (state / 2147483648 + Math.sin(index)) / 2;
    return 0.25 + Math.abs(normalized) * 0.75;
  });
}

/**
 * Nota de audio del recuerdo.
 *
 * La reproduccion es simulada porque los datos de ejemplo no incluyen archivos
 * reales. Cuando existan, se sustituye el temporizador por un elemento `audio`
 * y el aspecto no cambia.
 */
export function AudioNote({ item }: { item: MediaItem }) {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const duration = item.durationMs ?? 0;
  const bars = useMemo(() => waveform(item.id), [item.id]);
  const progress = duration > 0 ? Math.min(1, elapsed / duration) : 0;

  useEffect(() => {
    if (!playing) return;

    const timer = setInterval(() => {
      setElapsed((previous) => {
        const next = previous + TICK_MS;
        if (next >= duration) {
          setPlaying(false);
          return 0;
        }
        return next;
      });
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [playing, duration]);

  const remaining = playing
    ? formatDuration(duration - elapsed)
    : formatDuration(duration);

  return (
    <div className="flex items-center gap-3 rounded-md bg-surface-sunken p-3">
      <button
        type="button"
        aria-label={playing ? "Pausar" : `Reproducir: ${item.alt}`}
        onClick={() => setPlaying((value) => !value)}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-contrast transition-transform duration-150 ease-out active:scale-90"
      >
        {playing ? (
          <Pause size={18} fill="currentColor" aria-hidden />
        ) : (
          <Play size={18} fill="currentColor" className="ml-0.5" aria-hidden />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-label font-medium">
          {item.caption ?? "Nota de audio"}
        </p>

        <div aria-hidden className="mt-1.5 flex h-6 items-center gap-[3px]">
          {bars.map((height, index) => (
            <span
              key={index}
              style={{ height: `${Math.round(height * 100)}%` }}
              className={cn(
                "w-full rounded-full transition-colors duration-150",
                index / BAR_COUNT <= progress
                  ? "bg-accent"
                  : "bg-border-strong",
              )}
            />
          ))}
        </div>
      </div>

      <span className="shrink-0 font-mono text-meta text-ink-muted tabular-nums">
        {remaining}
      </span>
    </div>
  );
}
