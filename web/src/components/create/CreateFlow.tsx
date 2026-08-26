"use client";

import {
  Camera,
  ChevronDown,
  ImageIcon,
  Plus,
  ScanLine,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { CameraSurface } from "@/components/camera/CameraSurface";
import { useCamera } from "@/components/camera/useCamera";
import { Button, buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { MediaItem, MemoryDetail } from "@/lib/data";
import { saveCloudMemoryAction } from "@/lib/data/cloud-actions";
import { vibrate } from "@/lib/haptics";
import { useSessionMemories } from "@/lib/session-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { LinkObjectFlow, type DraftObject } from "./LinkObjectFlow";

async function urlToFile(url: string, filename: string): Promise<File> {
  const response = await fetch(url);
  const blob = await response.blob();
  const type = blob.type || "image/jpeg";
  return new File([blob], filename, { type });
}

type Stage = "source" | "camera" | "editor";

/**
 * Creacion de un recuerdo.
 *
 * Dos datos bastan: una fotografia y un titulo. Todo lo demas aparece solo si
 * se pide, porque obligar a rellenar campos es lo que hace que la gente no
 * guarde nada.
 */
export function CreateFlow() {
  const router = useRouter();
  const { addMemory } = useSessionMemories();

  const [stage, setStage] = useState<Stage>("source");
  const [cover, setCover] = useState<string | null>(null);
  const [extras, setExtras] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [object, setObject] = useState<DraftObject | null>(null);
  const [linking, setLinking] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [happenedAt, setHappenedAt] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const extrasInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [titleHint, setTitleHint] = useState(false);

  const camera = useCamera(stage === "camera");
  const canSave = cover !== null && title.trim().length > 0;

  async function shoot() {
    const url = await camera.captureFrame();
    if (!url) return;
    vibrate(12);
    setCover(url);
    setStage("editor");
  }

  function pickCover(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      setCover(URL.createObjectURL(file));
      setStage("editor");
    }
    event.target.value = "";
  }

  function pickExtras(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) {
      setExtras((previous) => [
        ...previous,
        ...files.map((file) => URL.createObjectURL(file)),
      ]);
    }
    event.target.value = "";
  }

  async function handleSaveClick() {
    if (!canSave) {
      setTitleHint(true);
      titleInputRef.current?.focus();
      titleInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      vibrate(8);
      return;
    }
    await save();
  }

  async function save() {
    if (!cover || saving) return;
    setSaving(true);

    const cleanTitle = title.trim();

    try {
      if (isSupabaseConfigured()) {
        const form = new FormData();
        form.set("title", cleanTitle);
        form.set("happenedAt", happenedAt);
        form.set("location", location.trim());
        form.set("description", description.trim());
        form.set("cover", await urlToFile(cover, "cover.jpg"));
        form.set(
          "objectLabel",
          object?.label.trim() || cleanTitle,
        );
        form.set(
          "object",
          await urlToFile(object?.imageUrl ?? cover, "object.jpg"),
        );
        for (const [index, url] of extras.entries()) {
          form.set(`extra_${index}`, await urlToFile(url, `extra-${index}.jpg`));
        }
        const result = await saveCloudMemoryAction(form);
        if (result?.error) {
          window.alert(result.error);
          return;
        }
        // redirect lo hace la server action
        return;
      }

      const id = `sesion-${Date.now()}`;
      const media: MediaItem[] = [cover, ...extras].map((url, index) => ({
        id: `${id}-m${index}`,
        kind: "image",
        previewUrl: url,
        alt: cleanTitle,
        durationMs: null,
        caption: null,
      }));

      const linkedObject = object ?? {
        label: cleanTitle,
        imageUrl: cover,
        referenceCount: 1,
      };

      const memory: MemoryDetail = {
        id,
        title: cleanTitle,
        happenedAt: happenedAt || null,
        location: location.trim() || null,
        description: description.trim() || null,
        coverUrl: cover,
        coverAlt: cleanTitle,
        mediaCount: media.length,
        hasLinkedObject: true,
        isShared: false,
        media,
        objects: [
          {
            id: `${id}-objeto`,
            label: linkedObject.label,
            imageUrl: linkedObject.imageUrl,
            referenceCount: linkedObject.referenceCount,
          },
        ],
        members: [{ id: "u-yo", name: "Aaron", role: "owner" }],
      };

      await addMemory(memory);
      vibrate(18);
      router.push(`/recuerdo/${id}`);
    } finally {
      setSaving(false);
    }
  }

  if (linking) {
    return (
      <LinkObjectFlow
        memoryCoverUrl={cover}
        onCancel={() => setLinking(false)}
        onDone={(draft) => {
          setObject(draft);
          setLinking(false);
        }}
      />
    );
  }

  if (stage === "camera") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        <header className="flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
          <button
            type="button"
            onClick={() => setStage("source")}
            aria-label="Cancelar"
            className="grid size-11 place-items-center rounded-full text-white transition-transform duration-150 active:scale-90"
          >
            <X size={20} aria-hidden />
          </button>
        </header>

        <CameraSurface
          camera={camera}
          fallback={
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className={buttonStyles("onMedia")}
            >
              <ImageIcon size={17} aria-hidden />
              Elegir de la galeria
            </button>
          }
        />

        <div className="grid place-items-center bg-black px-6 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={shoot}
            disabled={camera.status !== "ready"}
            aria-label="Hacer la foto"
            className="grid size-18 place-items-center rounded-full border-4 border-white/85 transition-transform duration-150 ease-out active:scale-90 disabled:opacity-40"
          >
            <span className="size-14 rounded-full bg-white" />
          </button>
        </div>

        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          onChange={pickCover}
          className="hidden"
        />
      </div>
    );
  }

  if (stage === "source") {
    return (
      <div className="flex min-h-dvh flex-col px-6 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center">
          <Link
            href="/"
            transitionTypes={["nav-back"]}
            aria-label="Cancelar"
            className="-ml-3 grid size-11 place-items-center rounded-full text-ink-muted transition-transform duration-150 active:scale-90"
          >
            <X size={20} aria-hidden />
          </Link>
        </header>

        <div className="flex flex-1 flex-col justify-center gap-8 pb-16">
          <div>
            <h1 className="text-display font-semibold tracking-tight">
              Nuevo recuerdo
            </h1>
            <p className="mt-2 text-body text-ink-muted text-pretty">
              Empieza por una fotografia. Lo demas puede esperar.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <Button
              size="lg"
              onClick={() => setStage("camera")}
              className="w-full"
            >
              <Camera size={19} aria-hidden />
              Hacer una foto
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => coverInputRef.current?.click()}
              className="w-full"
            >
              <ImageIcon size={19} aria-hidden />
              Elegir de la galeria
            </Button>
          </div>
        </div>

        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          onChange={pickCover}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div className="min-h-dvh pb-32">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-surface/90 px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <Link
          href="/"
          transitionTypes={["nav-back"]}
          aria-label="Cancelar"
          className="grid size-11 place-items-center rounded-full text-ink-muted transition-transform duration-150 active:scale-90"
        >
          <X size={20} aria-hidden />
        </Link>
        <h1 className="text-label font-semibold">Nuevo recuerdo</h1>
        <Button
          onClick={handleSaveClick}
          aria-disabled={!canSave || saving}
          disabled={saving}
          className={cn("mr-1", (!canSave || saving) && "opacity-40")}
        >
          {saving ? "Guardando…" : "Guardar"}
        </Button>
      </header>

      <div className="mx-auto max-w-2xl px-4">
        <div className="relative mt-4 aspect-4/5 w-full overflow-hidden rounded-md bg-surface-sunken shadow-card sm:aspect-video">
          {cover ? (
            <Image
              src={cover}
              alt="Fotografia principal del recuerdo"
              fill
              sizes="(min-width: 640px) 42rem, 100vw"
              unoptimized
              className="object-cover"
            />
          ) : null}
          <button
            type="button"
            onClick={() => setStage("camera")}
            className={buttonStyles(
              "onMedia",
              "md",
              "absolute right-3 bottom-3",
            )}
          >
            Cambiar
          </button>
        </div>

        <label htmlFor="memory-title" className="sr-only">
          Titulo del recuerdo
        </label>
        <input
          ref={titleInputRef}
          id="memory-title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (event.target.value.trim().length > 0) setTitleHint(false);
          }}
          placeholder="Ponle un titulo"
          autoComplete="off"
          autoFocus
          aria-invalid={titleHint}
          aria-describedby={titleHint ? "memory-title-hint" : undefined}
          className={cn(
            "mt-5 w-full bg-transparent text-display font-semibold tracking-tight outline-none placeholder:text-ink-subtle",
            titleHint && "rounded-sm ring-2 ring-accent/60",
          )}
        />
        {titleHint ? (
          <p
            id="memory-title-hint"
            className="mt-2 text-meta text-accent"
            role="status"
          >
            Escribe un titulo para poder guardar
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2">
          <Row
            icon={<Plus size={18} aria-hidden />}
            label={
              extras.length > 0
                ? `${extras.length + 1} archivos en este recuerdo`
                : "Anadir fotos o videos"
            }
            onClick={() => extrasInputRef.current?.click()}
          />

          <Row
            icon={<ScanLine size={18} aria-hidden />}
            label={object ? object.label : "Vincular un objeto fisico"}
            hint={
              object
                ? "Apunta a el para volver aqui"
                : "Para volver a abrir este recuerdo con la camara"
            }
            thumbnail={object?.imageUrl}
            highlighted={object !== null}
            onClick={() => setLinking(true)}
          />

          <Row
            icon={
              <ChevronDown
                size={18}
                aria-hidden
                className={cn(
                  "transition-transform duration-150 ease-out",
                  showDetails && "rotate-180",
                )}
              />
            }
            label="Fecha, lugar y descripcion"
            onClick={() => setShowDetails((value) => !value)}
          />
        </div>

        {/* Progressive disclosure: nadie tiene que ver esto para guardar. */}
        {showDetails ? (
          <div className="mt-4 flex flex-col gap-4 rounded-md bg-surface-sunken p-4">
            <Field label="Cuando fue" htmlFor="memory-date">
              <input
                id="memory-date"
                type="date"
                value={happenedAt}
                onChange={(event) => setHappenedAt(event.target.value)}
                className="h-11 w-full rounded-sm border border-border bg-surface-raised px-3 text-body outline-none"
              />
            </Field>

            <Field label="Donde fue" htmlFor="memory-location">
              <input
                id="memory-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Lisboa, Portugal"
                autoComplete="off"
                className="h-11 w-full rounded-sm border border-border bg-surface-raised px-3 text-body outline-none placeholder:text-ink-subtle"
              />
            </Field>

            <Field label="Que paso" htmlFor="memory-description">
              <textarea
                id="memory-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Lo que quieras recordar de este dia"
                className="w-full resize-none rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-body outline-none placeholder:text-ink-subtle"
              />
            </Field>
          </div>
        ) : null}
      </div>

      <input
        ref={extrasInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={pickExtras}
        className="hidden"
      />
    </div>
  );
}

interface RowProps {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  thumbnail?: string;
  highlighted?: boolean;
  onClick: () => void;
}

function Row({
  icon,
  label,
  hint,
  thumbnail,
  highlighted = false,
  onClick,
}: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-md border px-3.5 py-2.5 text-left transition-[transform,border-color] duration-150 ease-out active:scale-[0.99]",
        highlighted
          ? "border-accent/40 bg-accent-wash"
          : "border-border bg-surface-raised hover:border-border-strong",
      )}
    >
      {thumbnail ? (
        <span className="relative size-9 shrink-0 overflow-hidden rounded-sm">
          <Image
            src={thumbnail}
            alt=""
            fill
            sizes="36px"
            unoptimized
            className="object-cover"
          />
        </span>
      ) : (
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full",
            highlighted
              ? "bg-accent text-accent-contrast"
              : "bg-surface-sunken text-ink-muted",
          )}
        >
          {icon}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-label font-medium">{label}</span>
        {hint ? (
          <span className="block truncate text-meta text-ink-subtle">
            {hint}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-meta font-medium text-ink-muted"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
