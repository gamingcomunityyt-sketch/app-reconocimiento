"use client";

import { ArrowLeft, Box, ImageIcon, ScanLine, Square } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

import { CameraSurface } from "@/components/camera/CameraSurface";
import { FramingBracket } from "@/components/camera/FramingBracket";
import { useCamera } from "@/components/camera/useCamera";
import { Button, buttonStyles } from "@/components/ui/Button";
import { vibrate } from "@/lib/haptics";

export interface DraftObject {
  label: string;
  imageUrl: string;
  referenceCount: number;
}

interface LinkObjectFlowProps {
  /** Se muestra en la confirmacion, unido al objeto. */
  memoryCoverUrl: string | null;
  onCancel: () => void;
  onDone: (object: DraftObject) => void;
}

type Step = "capture" | "kind" | "confirm";

/**
 * Prompts de las vistas adicionales de un objeto con volumen.
 *
 * La verificacion geometrica supone superficie plana, asi que un objeto
 * tridimensional necesita varias vistas para reconocerse desde cualquier
 * angulo. Se piden tres y se para: convertirlo en un escaneo 3D completo
 * arruinaria el flujo por una mejora marginal.
 */
const VIEW_PROMPTS = [
  "Encuadra el objeto de frente",
  "Ahora ligeramente desde la izquierda",
  "Y por ultimo desde la derecha",
];

export function LinkObjectFlow({
  memoryCoverUrl,
  onCancel,
  onDone,
}: LinkObjectFlowProps) {
  const [step, setStep] = useState<Step>("capture");
  const [views, setViews] = useState<string[]>([]);
  const [hasVolume, setHasVolume] = useState(false);
  const [label, setLabel] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const camera = useCamera(step === "capture");

  function addView(url: string) {
    vibrate(12);
    const next = [...views, url];
    setViews(next);

    if (next.length === 1) {
      setStep("kind");
      return;
    }
    if (next.length >= VIEW_PROMPTS.length) setStep("confirm");
  }

  async function capture() {
    const url = await camera.captureFrame();
    if (url) addView(url);
  }

  function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) addView(URL.createObjectURL(file));
    event.target.value = "";
  }

  function finish() {
    onDone({
      label: label.trim() || "Objeto vinculado",
      imageUrl: views[0],
      referenceCount: views.length,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <header className="flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancelar"
          className="grid size-11 place-items-center rounded-full text-white transition-transform duration-150 active:scale-90"
        >
          <ArrowLeft size={20} aria-hidden />
        </button>
        <h2 className="text-label font-semibold text-white">
          Vincular un objeto
        </h2>
      </header>

      {step === "capture" ? (
        <>
          <CameraSurface
            camera={camera}
            fallback={
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={buttonStyles("onMedia")}
              >
                <ImageIcon size={17} aria-hidden />
                Elegir una foto
              </button>
            }
          >
            <FramingBracket />
            <p className="absolute inset-x-0 bottom-6 px-8 text-center text-label font-medium text-white drop-shadow-lg">
              {VIEW_PROMPTS[views.length] ?? VIEW_PROMPTS[0]}
            </p>
          </CameraSurface>

          <div className="flex items-center justify-center gap-6 bg-black px-6 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {views.length > 0 ? (
              <span className="font-mono text-meta text-white/60 tabular-nums">
                {views.length} / {hasVolume ? VIEW_PROMPTS.length : 1}
              </span>
            ) : (
              <span className="w-12" />
            )}

            <button
              type="button"
              onClick={capture}
              disabled={camera.status !== "ready"}
              aria-label="Capturar el objeto"
              className="grid size-18 place-items-center rounded-full border-4 border-white/85 transition-transform duration-150 ease-out active:scale-90 disabled:opacity-40"
            >
              <span className="size-14 rounded-full bg-white" />
            </button>

            <span className="w-12" />
          </div>
        </>
      ) : null}

      {step === "kind" ? (
        <div className="flex flex-1 flex-col justify-center gap-6 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {views[0] ? (
            <div className="relative mx-auto aspect-square w-48 overflow-hidden rounded-md">
              <Image
                src={views[0]}
                alt="Objeto capturado"
                fill
                sizes="192px"
                unoptimized
                className="object-cover"
              />
            </div>
          ) : null}

          <div>
            <h3 className="text-center text-title font-semibold text-white text-balance">
              ¿Como es este objeto?
            </h3>
            <p className="mt-1 text-center text-body text-white/60 text-pretty">
              Si tiene volumen necesitamos un par de fotos mas para reconocerlo
              desde cualquier angulo.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <KindOption
              icon={<Square size={20} aria-hidden />}
              title="Es plano"
              description="Una foto, una entrada, un dibujo"
              onClick={() => {
                setHasVolume(false);
                setStep("confirm");
              }}
            />
            <KindOption
              icon={<Box size={20} aria-hidden />}
              title="Tiene volumen"
              description="Un reloj, un iman, una figura"
              onClick={() => {
                setHasVolume(true);
                setStep("capture");
              }}
            />
          </div>
        </div>
      ) : null}

      {step === "confirm" ? (
        <div className="flex flex-1 flex-col justify-center gap-7 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {/* Esta es la pantalla que explica el producto entero: el objeto y el
              recuerdo, unidos, y para que sirve eso. */}
          <div className="flex items-center justify-center gap-3">
            <Thumbnail src={views[0]} alt="El objeto" />
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-contrast">
              <ScanLine size={17} strokeWidth={2.25} aria-hidden />
            </span>
            <Thumbnail src={memoryCoverUrl} alt="El recuerdo" />
          </div>

          <p className="text-center text-title font-semibold text-white text-balance">
            Apunta a este objeto para volver a este recuerdo
          </p>

          <div>
            <label
              htmlFor="object-label"
              className="text-label font-medium text-white/70"
            >
              ¿Que es?
            </label>
            <input
              id="object-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="El iman de la nevera"
              autoComplete="off"
              className="mt-1.5 h-12 w-full rounded-sm border border-white/15 bg-white/10 px-3.5 text-body text-white outline-none placeholder:text-white/40 focus-visible:border-white/40"
            />
          </div>

          <Button size="lg" onClick={finish} className="w-full">
            Vincular objeto
          </Button>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onPickFile}
        className="hidden"
      />
    </div>
  );
}

function KindOption({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3.5 rounded-md border border-white/15 bg-white/5 px-4 py-3.5 text-left transition-transform duration-150 ease-out active:scale-[0.98]"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-white">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-label font-semibold text-white">
          {title}
        </span>
        <span className="block text-meta text-white/55">{description}</span>
      </span>
    </button>
  );
}

function Thumbnail({ src, alt }: { src: string | null | undefined; alt: string }) {
  return (
    <span className="relative block size-24 shrink-0 overflow-hidden rounded-md bg-white/10">
      {src ? (
        <Image src={src} alt={alt} fill sizes="96px" unoptimized className="object-cover" />
      ) : null}
    </span>
  );
}
