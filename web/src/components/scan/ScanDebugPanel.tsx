"use client";

import {
  Bug,
  Check,
  ChevronDown,
  ImageOff,
  RotateCcw,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import type { ScanCandidateView, ScanOutcome } from "@/lib/data";
import type { CameraStatus } from "@/components/camera/useCamera";
import type {
  PairVerdict,
  ScanEngine,
  ScanRankingDetail,
  ScanThresholds,
} from "@/lib/scan/types";
import {
  clearScanTelemetry,
  formatScanEventTime,
  getScanTelemetryEvents,
  type ScanTelemetryEvent,
} from "@/lib/scan-telemetry";
import { needsUnoptimized } from "@/lib/media-url";

import type { ScanPhase } from "./RecognitionOverlay";

interface ScanDebugPanelProps {
  cameraStatus: CameraStatus;
  phase: ScanPhase;
  candidates: ScanCandidateView[];
  outcome: ScanOutcome | null;
  lastFrameUrl: string | null;
  forced?: string;
  simulated: boolean;
  scanEngine?: ScanEngine;
  scanReason?: string | null;
  topScore?: number | null;
  topColorSimilarity?: number | null;
  rankings?: ScanRankingDetail[];
  scanKeypoints?: number | null;
  thresholds?: ScanThresholds | null;
  onRetry?: () => void;
}

/** Ranking + su ficha de candidato (para pintar la miniatura y el nombre). */
interface RankingRow extends ScanRankingDetail {
  candidate?: ScanCandidateView;
}

const VERDICT_STYLE: Record<
  PairVerdict,
  { bar: string; text: string; chip: string; label: string }
> = {
  MATCH: {
    bar: "bg-emerald-400",
    text: "text-emerald-300",
    chip: "bg-emerald-500/20 text-emerald-200 ring-emerald-400/40",
    label: "COINCIDE",
  },
  AMBIGUOUS: {
    bar: "bg-amber-400",
    text: "text-amber-300",
    chip: "bg-amber-500/20 text-amber-200 ring-amber-400/40",
    label: "DUDOSO",
  },
  "NO MATCH": {
    bar: "bg-rose-400",
    text: "text-rose-300",
    chip: "bg-rose-500/20 text-rose-200 ring-rose-400/40",
    label: "NO COINCIDE",
  },
};

export function ScanDebugPanel({
  cameraStatus,
  phase,
  candidates,
  outcome,
  lastFrameUrl,
  forced,
  simulated,
  scanEngine = "local",
  scanReason,
  scanKeypoints,
  rankings = [],
  thresholds,
  onRetry,
}: ScanDebugPanelProps) {
  const [open, setOpen] = useState(true);
  const [showEvents, setShowEvents] = useState(false);
  const [events, setEvents] = useState<ScanTelemetryEvent[]>([]);

  useEffect(() => {
    function refresh() {
      setEvents(getScanTelemetryEvents());
    }
    refresh();
    const timer = setInterval(refresh, 400);
    return () => clearInterval(timer);
  }, [cameraStatus, phase, outcome, lastFrameUrl]);

  const candidateById = useMemo(() => {
    const map = new Map<string, ScanCandidateView>();
    for (const candidate of candidates) map.set(candidate.objectId, candidate);
    return map;
  }, [candidates]);

  const rows: RankingRow[] = useMemo(
    () =>
      [...rankings]
        .sort((a, b) => b.score - a.score)
        .map((ranking) => ({
          ...ranking,
          candidate: candidateById.get(ranking.objectId),
        })),
    [rankings, candidateById],
  );

  const best = rows[0] ?? null;
  const second = rows[1] ?? null;
  const engineLabel = simulated ? "simulado" : scanEngine === "python" ? "opencv" : "integrado";
  const engineTone = simulated ? "warn" : scanEngine === "python" ? "ok" : "warn";

  return (
    <div className="pointer-events-auto absolute inset-x-2 bottom-2 top-14 z-[60] flex flex-col overflow-hidden rounded-lg border border-white/15 bg-slate-950/90 text-white backdrop-blur-md">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <span
            className={cn(
              "grid size-6 place-items-center rounded-md",
              simulated ? "bg-amber-500/25 text-amber-300" : scanEngine === "python" ? "bg-emerald-500/25 text-emerald-300" : "bg-sky-500/25 text-sky-300",
            )}
          >
            <Bug size={14} aria-hidden />
          </span>
          Modo desarrollador
        </span>
        <span className="inline-flex items-center gap-2 text-[11px] text-white/50">
          {engineLabel}
          <ChevronDown
            size={16}
            aria-hidden
            className={cn("transition-transform", open && "rotate-180")}
          />
        </span>
      </button>

      {open ? (
        <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-[12px]">
          {/* Estado general */}
          <div className="flex flex-wrap gap-1.5">
            <Chip label="Cámara" value={cameraStatus} tone={cameraStatus === "ready" ? "ok" : "warn"} />
            <Chip label="Fase" value={phase} />
            <Chip label="Motor" value={engineLabel} tone={engineTone} />
            <Chip label="Objetos" value={String(candidates.length)} tone={candidates.length > 0 ? "ok" : "warn"} />
            {scanKeypoints !== null && scanKeypoints !== undefined ? (
              <Chip label="Keypoints" value={String(scanKeypoints)} tone={scanKeypoints > 50 ? "ok" : "warn"} />
            ) : null}
            {outcome ? <Chip label="Veredicto" value={outcome.status} /> : null}
            {forced ? <Chip label="Forzado" value={forced} tone="warn" /> : null}
          </div>

          {simulated ? (
            <p className="rounded-md bg-amber-500/15 px-2.5 py-2 text-[11px] text-amber-200 ring-1 ring-amber-400/30">
              Resultado forzado para pruebas (no es un escaneo real).
            </p>
          ) : scanEngine === "local" ? (
            <p className="rounded-md bg-sky-500/15 px-2.5 py-2 text-[11px] text-sky-200 ring-1 ring-sky-400/30">
              Motor integrado en Vercel (gratis). Para OpenCV avanzado configura
              el servicio Python o <code>SCAN_ENGINE=python</code>.
            </p>
          ) : null}

          {candidates.length === 0 ? (
            <p className="rounded-md bg-rose-500/15 px-2.5 py-2 text-[11px] text-rose-200 ring-1 ring-rose-400/30">
              No hay ningún objeto registrado. Crea un recuerdo con foto y
              vincula un objeto: su portada se usa como referencia.
            </p>
          ) : null}

          {/* Mejor coincidencia */}
          <BestMatchCard best={best} simulated={simulated} phase={phase} />

          {/* Ranking visual */}
          {rows.length > 0 ? (
            <section>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/50">
                Ranking de similitud
              </h4>
              <ul className="space-y-1.5">
                {rows.map((row, index) => (
                  <RankingBar key={row.objectId} row={row} rank={index + 1} />
                ))}
              </ul>
            </section>
          ) : null}

          {/* Diagnóstico: por qué (no) coincide el mejor candidato */}
          {best && thresholds ? (
            <DiagnosticChecklist best={best} second={second} thresholds={thresholds} />
          ) : null}

          {/* Fotograma capturado */}
          {lastFrameUrl ? (
            <section>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/50">
                Fotograma enviado
              </h4>
              <div className="relative h-28 w-full overflow-hidden rounded-md bg-white/5 ring-1 ring-white/10">
                <Image src={lastFrameUrl} alt="Fotograma escaneado" fill sizes="100vw" unoptimized className="object-contain" />
              </div>
            </section>
          ) : null}

          {/* Eventos (secundario, plegable) */}
          <section>
            <button
              type="button"
              onClick={() => setShowEvents((value) => !value)}
              className="flex w-full items-center justify-between gap-2 rounded-md bg-white/5 px-2.5 py-1.5 text-[11px] text-white/60"
            >
              <span>Trazas del escáner ({events.length})</span>
              <ChevronDown size={14} aria-hidden className={cn("transition-transform", showEvents && "rotate-180")} />
            </button>
            {showEvents ? (
              <div className="mt-1.5">
                <div className="mb-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      clearScanTelemetry();
                      setEvents([]);
                    }}
                    className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-white/50 hover:bg-white/10 hover:text-white"
                  >
                    <Trash2 size={12} aria-hidden />
                    Limpiar
                  </button>
                </div>
                <ol className="space-y-1 font-mono text-[10px] text-white/70">
                  {[...events].reverse().slice(0, 15).map((event) => (
                    <li key={event.id}>
                      <span className="text-white/30">{formatScanEventTime(event.at)}</span>{" "}
                      <span className="text-white/85">{event.kind}</span>{" "}
                      {Object.keys(event.data).length > 0 ? (
                        <span className="text-white/40">{JSON.stringify(event.data)}</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </section>

          {scanReason ? (
            <p className="text-[10px] text-white/35">Motivo interno: {scanReason}</p>
          ) : null}

          {phase === "resolved" && onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 active:scale-[0.98]"
            >
              <RotateCcw size={15} aria-hidden />
              Reintentar escaneo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BestMatchCard({
  best,
  simulated,
  phase,
}: {
  best: RankingRow | null;
  simulated: boolean;
  phase: ScanPhase;
}) {
  if (!best) {
    return (
      <div className="grid place-items-center rounded-lg border border-dashed border-white/15 bg-white/5 px-3 py-6 text-center text-[11px] text-white/50">
        {simulated
          ? "En modo simulado no hay porcentajes reales."
          : phase === "analyzing"
            ? "Analizando el fotograma…"
            : "Apunta y escanea para ver la mejor coincidencia."}
      </div>
    );
  }

  const style = VERDICT_STYLE[best.verdict];
  const score = Math.round(best.score);
  const colorPct = Math.round(best.colorSimilarity * 100);
  const label = best.candidate?.objectLabel ?? best.objectId;
  const image = best.candidate?.objectImageUrl ?? null;

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
      <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/50">
        <Trophy size={13} aria-hidden className="text-amber-300" />
        Mejor coincidencia encontrada
      </h4>
      <div className="flex items-center gap-3">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-md bg-white/10 ring-1 ring-white/15">
          {image ? (
            <Image
              src={image}
              alt={label}
              fill
              sizes="80px"
              unoptimized={needsUnoptimized(image)}
              className="object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center text-white/30">
              <ImageOff size={20} aria-hidden />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={cn("text-4xl font-bold leading-none tabular-nums", style.text)}>
              {score}
              <span className="text-lg text-white/40">%</span>
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1", style.chip)}>
              {style.label}
            </span>
          </div>
          <p className="mt-1 truncate text-sm font-medium text-white" title={label}>
            {label}
          </p>
          {best.candidate?.memoryTitle ? (
            <p className="truncate text-[11px] text-white/45">{best.candidate.memoryTitle}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <Metric label="Visual" value={`${colorPct}%`} pct={colorPct} />
        <Metric
          label="Arte"
          value={`${Math.round((best.artSimilarity ?? 0) * 100)}%`}
          pct={Math.round((best.artSimilarity ?? 0) * 100)}
        />
        <Metric
          label="Apariencia"
          value={`${Math.round((best.appearance ?? 0) * 100)}%`}
          pct={Math.round((best.appearance ?? 0) * 100)}
        />
        <Metric
          label="Dispersión"
          value={`${Math.round((best.spread ?? 0) * 100)}%`}
          pct={Math.round((best.spread ?? 0) * 100)}
        />
        <Metric label="Ratio inliers" value={`${Math.round(best.inlierRatio * 100)}%`} pct={Math.round(best.inlierRatio * 100)} />
        <Metric label="Inliers" value={String(best.inliers)} />
      </div>

      {best.message ? (
        <p className="mt-2 rounded-md bg-black/30 px-2.5 py-1.5 text-[11px] text-white/70">
          {best.message}
        </p>
      ) : null}
    </section>
  );
}

function RankingBar({ row, rank }: { row: RankingRow; rank: number }) {
  const style = VERDICT_STYLE[row.verdict];
  const score = Math.round(row.score);
  const label = row.candidate?.objectLabel ?? row.objectId;
  const image = row.candidate?.objectImageUrl ?? null;

  return (
    <li className="flex items-center gap-2">
      <span className="w-4 shrink-0 text-right text-[10px] font-semibold text-white/35">{rank}</span>
      <div className="relative size-8 shrink-0 overflow-hidden rounded-sm bg-white/10 ring-1 ring-white/10">
        {image ? (
          <Image src={image} alt={label} fill sizes="32px" unoptimized={needsUnoptimized(image)} className="object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-white/30">
            <ImageOff size={12} aria-hidden />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-[11px] text-white/80" title={label}>{label}</span>
          <span className={cn("shrink-0 text-[11px] font-semibold tabular-nums", style.text)}>{score}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className={cn("h-full rounded-full transition-[width]", style.bar)} style={{ width: `${Math.max(2, Math.min(100, score))}%` }} />
        </div>
      </div>
    </li>
  );
}

function DiagnosticChecklist({
  best,
  second,
  thresholds,
}: {
  best: RankingRow;
  second: RankingRow | null;
  thresholds: ScanThresholds;
}) {
  const isSingle = !second;
  const minScore = isSingle ? thresholds.minScoreSingleCandidate : thresholds.minScoreMatch;
  const margin = second ? best.score - second.score : null;

  const checks = [
    {
      label: "Puntuación",
      ok: best.score >= minScore,
      detail: `${Math.round(best.score)} / ${minScore} mín.`,
    },
    {
      label: "Inliers",
      ok: best.inliers >= thresholds.minInliersMatch,
      detail: `${best.inliers} / ${thresholds.minInliersMatch} mín.`,
    },
    {
      label: "Ratio inliers",
      ok: best.inlierRatio >= thresholds.minInlierRatio,
      detail: `${Math.round(best.inlierRatio * 100)}% / ${Math.round(thresholds.minInlierRatio * 100)}% mín.`,
    },
    {
      label: "Visual (color+arte)",
      ok: best.colorSimilarity >= thresholds.minColorSimilarity,
      detail: `${Math.round(best.colorSimilarity * 100)}% / ${Math.round(thresholds.minColorSimilarity * 100)}% mín.`,
    },
    {
      label: "Dispersión",
      ok: (best.spread ?? 0) >= 0.45,
      detail: `${Math.round((best.spread ?? 0) * 100)}% / 45% mín.`,
    },
    {
      label: "Geometría plausible",
      ok: best.plausible,
      detail: best.plausible ? "sí" : "no",
    },
    ...(margin !== null
      ? [
          {
            label: `Margen sobre 2º`,
            ok: margin >= thresholds.scoreMargin,
            detail: `${Math.round(margin)} / ${thresholds.scoreMargin} mín.`,
          },
        ]
      : []),
  ];

  const failing = checks.filter((check) => !check.ok);

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/50">
        Diagnóstico del mejor candidato
      </h4>
      <ul className="space-y-1">
        {checks.map((check) => (
          <li key={check.label} className="flex items-center justify-between gap-2 text-[12px]">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  "grid size-4 place-items-center rounded-full",
                  check.ok ? "bg-emerald-500/25 text-emerald-300" : "bg-rose-500/25 text-rose-300",
                )}
              >
                {check.ok ? <Check size={11} aria-hidden /> : <X size={11} aria-hidden />}
              </span>
              <span className="text-white/80">{check.label}</span>
            </span>
            <span className={cn("tabular-nums", check.ok ? "text-white/50" : "text-rose-300")}>{check.detail}</span>
          </li>
        ))}
      </ul>
      {failing.length > 0 ? (
        <p className="mt-2 rounded-md bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-200">
          Falla por: {failing.map((check) => check.label.toLowerCase()).join(", ")}. Por eso
          no se abre la colección aunque haya un candidato parecido.
        </p>
      ) : (
        <p className="mt-2 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-200">
          Cumple todos los umbrales: debería reconocerse como coincidencia.
        </p>
      )}
    </section>
  );
}

function Metric({ label, value, pct }: { label: string; value: string; pct?: number }) {
  return (
    <div className="rounded-md bg-black/25 px-2 py-1.5">
      <div className="flex items-center justify-between">
        <span className="text-white/45">{label}</span>
        <span className="font-semibold text-white/90 tabular-nums">{value}</span>
      </div>
      {pct !== undefined ? (
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function Chip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "warn";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ring-1",
        tone === "ok" && "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30",
        tone === "warn" && "bg-amber-500/15 text-amber-200 ring-amber-400/30",
        tone === "neutral" && "bg-white/5 text-white/70 ring-white/15",
      )}
    >
      <span className="text-white/40">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}
