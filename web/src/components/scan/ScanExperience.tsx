"use client";

import { Bug, Images, ImageIcon, RotateCcw, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { CameraSurface } from "@/components/camera/CameraSurface";
import { useCamera } from "@/components/camera/useCamera";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button, buttonStyles } from "@/components/ui/Button";
import type { ScanCandidateView, ScanOutcome } from "@/lib/data";
import type { ForcedScanOutcome } from "@/lib/data/scan";
import type { ScanRankingDetail, ScanThresholds } from "@/lib/scan/types";
import { cn } from "@/lib/cn";
import { memoriesToScanCandidates } from "@/lib/data/scan";
import { vibrate } from "@/lib/haptics";
import { needsUnoptimized } from "@/lib/media-url";
import { useSessionMemories } from "@/lib/session-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  configureScanTelemetry,
  trackScanEvent,
} from "@/lib/scan-telemetry";
import { submitLocalScan } from "@/lib/scan/local-client";

import { ScanDebugPanel } from "./ScanDebugPanel";
import { RecognitionOverlay, type ScanPhase } from "./RecognitionOverlay";

/** Tiempo para encuadrar antes de analizar por primera vez. */
const AIM_MS = 1500;
/** Duracion del analisis simulado. */
const ANALYZE_MS = 1100;
/** Cuanto se ve la miniatura del acierto antes de abrir el recuerdo. */
const CELEBRATE_MS = 850;

interface ScanExperienceProps {
  candidates: ScanCandidateView[];
  forced?: ForcedScanOutcome;
  debug?: boolean;
}

/**
 * Escanear.
 *
 * Sin pantalla intermedia, sin elegir camara y sin confirmar la foto: se abre
 * la camara, se apunta, y el recuerdo se abre. El analisis arranca solo.
 */
export function ScanExperience({ candidates, forced, debug = false }: ScanExperienceProps) {
  const router = useRouter();
  const camera = useCamera(true);
  const { createdMemories, removedIds } = useSessionMemories();

  const [phase, setPhase] = useState<ScanPhase>("aiming");
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [lastFrameUrl, setLastFrameUrl] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);
  const [scanEngine, setScanEngine] = useState<"python" | "local">("local");
  const [scanReason, setScanReason] = useState<string | null>(null);
  const [topScore, setTopScore] = useState<number | null>(null);
  const [topColorSimilarity, setTopColorSimilarity] = useState<number | null>(null);
  const [rankings, setRankings] = useState<ScanRankingDetail[]>([]);
  const [scanKeypoints, setScanKeypoints] = useState<number | null>(null);
  const [thresholds, setThresholds] = useState<ScanThresholds | null>(null);
  // El flag `debug` de la URL enciende el modo por defecto; el boton permite
  // activarlo/desactivarlo sin recargar.
  const [devMode, setDevMode] = useState(debug);

  const sessionCandidates = useMemo(
    () => memoriesToScanCandidates(createdMemories),
    [createdMemories],
  );

  // En la nube usamos solo candidatos del servidor (RLS). En local, los de sesion.
  const allCandidates = useMemo(() => {
    if (isSupabaseConfigured()) {
      return candidates.filter(
        (candidate) => !removedIds.includes(candidate.memoryId),
      );
    }
    const base =
      sessionCandidates.length > 0 ? sessionCandidates : candidates;
    return base.filter((candidate) => !removedIds.includes(candidate.memoryId));
  }, [sessionCandidates, candidates, removedIds]);

  useEffect(() => {
    configureScanTelemetry({
      debug,
      sessionId: `scan-${Date.now()}`,
    });
    trackScanEvent("scan_mount", {
      debug,
      forced: forced ?? null,
      serverCandidates: candidates.length,
      sessionCandidates: createdMemories.flatMap((memory) => memory.objects).length,
    });

    // En produccion, despierta Render (plan free) mientras el usuario encuadra.
    void fetch("/api/scan/warmup", { method: "POST" }).catch(() => undefined);
  }, [debug, forced, candidates.length, createdMemories]);

  useEffect(() => {
    trackScanEvent("camera_status", { status: camera.status });
  }, [camera.status]);

  useEffect(() => {
    trackScanEvent("phase_change", { phase });
  }, [phase]);

  useEffect(() => {
    trackScanEvent("candidates_ready", {
      total: allCandidates.length,
      labels: allCandidates.map((candidate) => candidate.objectLabel),
    });
  }, [allCandidates]);

  // Encuadrar -> analizar. Arranca solo en cuanto la camara esta lista.
  useEffect(() => {
    if (camera.status !== "ready" || phase !== "aiming") return;
    const timer = setTimeout(() => setPhase("analyzing"), AIM_MS);
    return () => clearTimeout(timer);
  }, [camera.status, phase]);

  // Analizar -> desenlace.
  useEffect(() => {
    if (phase !== "analyzing") return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      trackScanEvent("resolve_start", { candidateCount: allCandidates.length });
      const startedAt = performance.now();

      // El fotograma ya reducido es exactamente lo que se enviara a /api/scan
      // cuando exista el servicio de reconocimiento.
      const frameUrl = await camera.captureFrame();
      if (cancelled) return;

      if (frameUrl) {
        setLastFrameUrl(frameUrl);
        trackScanEvent("frame_captured", {
          frameUrl: frameUrl.slice(0, 48),
          hasFrame: true,
        });
      } else {
        trackScanEvent("frame_captured", { hasFrame: false });
        setOutcome({ status: "no_match" });
        setPhase("resolved");
        return;
      }

      try {
        const frameResponse = await fetch(frameUrl);
        const frameBlob = await frameResponse.blob();
        const apiResult = await submitLocalScan(frameBlob, allCandidates, forced);
        if (cancelled) return;

        setSimulated(apiResult.simulated);
        setScanEngine(apiResult.engine ?? "local");
        setScanReason(apiResult.reason);
        setTopScore(apiResult.topScore);
        setTopColorSimilarity(apiResult.topColorSimilarity);
        setRankings(apiResult.rankings ?? []);
        setScanKeypoints(apiResult.scanKeypoints ?? null);
        setThresholds(apiResult.thresholds ?? null);
        trackScanEvent("resolve_done", {
          status: apiResult.outcome.status,
          latencyMs: apiResult.latencyMs ?? Math.round(performance.now() - startedAt),
          forced: forced ?? null,
          simulated: apiResult.simulated,
          rankingCount: apiResult.rankingCount,
          reason: apiResult.reason,
          topScore: apiResult.topScore,
          topColorSimilarity: apiResult.topColorSimilarity,
        });
        setOutcome(apiResult.outcome);
        setPhase("resolved");
        if (apiResult.outcome.status === "match") vibrate(20);
      } catch (error) {
        if (cancelled) return;
        trackScanEvent("resolve_done", {
          status: "error",
          latencyMs: Math.round(performance.now() - startedAt),
          message: error instanceof Error ? error.message : "unknown",
        });
        setScanReason("service_unavailable");
        setOutcome({ status: "no_match" });
        setPhase("resolved");
      }
    }, ANALYZE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phase, camera, allCandidates, forced]);

  // Acierto -> abrir el recuerdo. En modo dev no navegamos: hay que leer el panel.
  useEffect(() => {
    if (devMode || phase !== "resolved" || outcome?.status !== "match") return;
    const timer = setTimeout(() => {
      trackScanEvent("navigate", {
        memoryId: outcome.candidate.memoryId,
        objectLabel: outcome.candidate.objectLabel,
      });
      router.push(`/recuerdo/${outcome.candidate.memoryId}`);
    }, CELEBRATE_MS);
    return () => clearTimeout(timer);
  }, [devMode, phase, outcome, router]);

  function retry() {
    trackScanEvent("retry");
    setOutcome(null);
    setSimulated(false);
    setScanEngine("local");
    setScanReason(null);
    setTopScore(null);
    setTopColorSimilarity(null);
    setRankings([]);
    setScanKeypoints(null);
    setThresholds(null);
    setPhase("aiming");
  }

  const noMatchHint = scanReasonMessage(
    scanReason,
    allCandidates.length,
    topScore,
    topColorSimilarity,
  );

  const match = outcome?.status === "match" ? outcome.candidate : null;

  return (
    <div className="fixed inset-0 flex flex-col bg-black">
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link
          href="/"
          transitionTypes={["nav-back"]}
          aria-label="Cerrar el escaneo"
          className="grid size-11 place-items-center rounded-full bg-black/40 text-white backdrop-blur-md transition-transform duration-150 active:scale-90"
        >
          <X size={20} aria-hidden />
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDevMode((value) => !value);
              vibrate(10);
            }}
            aria-pressed={devMode}
            aria-label="Activar modo desarrollador de escaneo"
            className={cn(
              "grid size-11 place-items-center rounded-full backdrop-blur-md transition-[transform,background-color] duration-150 active:scale-90",
              devMode
                ? "bg-emerald-500 text-white shadow-[0_0_0_2px_rgba(255,255,255,0.25)]"
                : "bg-black/40 text-white",
            )}
          >
            <Bug size={19} aria-hidden />
          </button>

          <Link
            href="/"
            aria-label="Buscar el recuerdo a mano"
            className="grid size-11 place-items-center rounded-full bg-black/40 text-white backdrop-blur-md transition-transform duration-150 active:scale-90"
          >
            <Images size={19} aria-hidden />
          </Link>
        </div>
      </header>

      <CameraSurface
        camera={camera}
        fallback={
          <Link href="/" className={buttonStyles("onMedia")}>
            <ImageIcon size={17} aria-hidden />
            Buscar en mis recuerdos
          </Link>
        }
      >
        <RecognitionOverlay phase={phase} match={match} />
        {devMode ? (
          <ScanDebugPanel
            cameraStatus={camera.status}
            phase={phase}
            candidates={allCandidates}
            outcome={outcome}
            lastFrameUrl={lastFrameUrl}
            forced={forced}
            simulated={simulated}
            scanEngine={scanEngine}
            scanReason={scanReason}
            topScore={topScore}
            topColorSimilarity={topColorSimilarity}
            rankings={rankings}
            scanKeypoints={scanKeypoints}
            thresholds={thresholds}
            onRetry={retry}
          />
        ) : null}
      </CameraSurface>

      {/* Analizar a mano. Existe para el teclado y los lectores de pantalla, y
          como reintento: no es un paso de confirmacion. */}
      {/* Analizar a mano. En modo dev el panel incluye reintentar. */}
      {!devMode ? (
        <div className="grid place-items-center bg-black px-6 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <Button
            variant="onMedia"
            onClick={() => setPhase("analyzing")}
            disabled={camera.status !== "ready" || phase !== "aiming"}
          >
            <RotateCcw size={16} aria-hidden />
            Analizar ahora
          </Button>
        </div>
      ) : null}

      {/* En modo dev los modales tapan el panel de diagnostico. */}
      <BottomSheet
        open={!devMode && outcome?.status === "ambiguous"}
        onClose={retry}
        title="¿Es uno de estos?"
      >
        <ul className="mt-3 flex flex-col gap-2">
          {outcome?.status === "ambiguous"
            ? outcome.candidates.map((candidate) => (
                <li key={candidate.objectId}>
                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/recuerdo/${candidate.memoryId}`)
                    }
                    className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-surface-sunken active:scale-[0.99]"
                  >
                    <span className="relative size-16 shrink-0 overflow-hidden rounded-sm bg-surface-sunken">
                      <Image
                        src={candidate.objectImageUrl}
                        alt=""
                        fill
                        sizes="64px"
                        className="object-cover"
                        unoptimized={needsUnoptimized(candidate.objectImageUrl)}
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-title font-medium">
                        {candidate.objectLabel}
                      </span>
                      <span className="block truncate text-meta text-ink-muted">
                        {candidate.memoryTitle}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            : null}
        </ul>

        <button
          type="button"
          onClick={retry}
          className={buttonStyles("ghost", "md", "mt-3 w-full")}
        >
          Ninguno, volver a intentar
        </button>
      </BottomSheet>

      <BottomSheet
        open={!devMode && outcome?.status === "no_match"}
        onClose={retry}
        title="No hemos reconocido este objeto"
      >
        <p className="mt-1 text-body text-ink-muted text-pretty">
          {noMatchHint}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button size="lg" onClick={retry} className="w-full">
            Volver a intentar
          </Button>
          <Link href="/" className={buttonStyles("secondary", "lg", "w-full")}>
            Elegir a mano
          </Link>
        </div>
      </BottomSheet>
    </div>
  );
}

function scanReasonMessage(
  reason: string | null,
  candidateCount: number,
  topScore: number | null,
  topColorSimilarity: number | null,
): string {
  const isProduction =
    typeof window !== "undefined" &&
    !/localhost|127\.0\.0\.1/.test(window.location.hostname);

  if (reason === "simulated_no_service") {
    if (isProduction) {
      return "El escaner avanzado (Python) no esta configurado. El escaneo integrado sigue activo: prueba con buena luz y el mismo objeto que guardaste.";
    }
    return "El motor avanzado no esta activo. Arranca el servicio Python (puerto 8000) o usa el escaneo integrado.";
  }
  if (reason === "service_unavailable") {
    return "No se pudo analizar la imagen. Vuelve a intentar o crea un recuerdo con una foto mas clara del objeto.";
  }
  if (reason === "service_timeout") {
    return "El analisis tardo demasiado. Vuelve a intentar con buena luz.";
  }
  if (reason === "local_fallback") {
    if (topScore !== null && topScore > 0) {
      return `Hay algo parecido (similitud ${topScore}/100) pero no suficiente. Acercate, mejora la luz o cambia el angulo.`;
    }
    return "No hemos reconocido este objeto. Acercate, mejora la luz y apunta al mismo objeto que guardaste.";
  }
  if (reason === "no_candidates") {
    return "No hay objetos registrados. Crea un recuerdo con foto y titulo antes de escanear.";
  }
  if (reason === "no_references") {
    return "No se han podido cargar las imagenes de referencia de tus recuerdos.";
  }
  if (reason === "scan_low_texture") {
    return "La imagen esta muy borrosa o sin detalle. Mejora la luz y mantén el objeto quieto.";
  }
  if (topColorSimilarity !== null && topColorSimilarity < 0.72 && topScore !== null && topScore > 30) {
    return "La forma es parecida pero el color no coincide. Es otra carta u objeto distinto.";
  }
  if (topScore !== null && topScore > 0) {
    return `Hay algo parecido (similitud ${topScore}/100) pero no suficiente. Acercate, mejora la luz o cambia el angulo.`;
  }
  if (candidateCount === 0) {
    return "Crea un recuerdo con foto antes de escanear. La portada se usa como referencia automaticamente.";
  }
  return "Prueba acercandote un poco o cambiando el angulo. Con mas luz tambien funciona mejor.";
}
