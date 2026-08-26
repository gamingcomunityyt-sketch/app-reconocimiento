"use client";

import { ArrowLeft, MapPin, MoreHorizontal, Pencil, ScanLine, Trash2, UserPlus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button, buttonStyles } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ViewTransition } from "@/components/ui/ViewTransition";
import type { MemoryDetail } from "@/lib/data";
import {
  deleteCloudMemoryAction,
  updateCloudMemoryAction,
} from "@/lib/data/cloud-actions";
import { formatMemoryDate } from "@/lib/format";
import { vibrate } from "@/lib/haptics";
import { needsUnoptimized } from "@/lib/media-url";
import {
  useSessionMemories,
  type MemoryEditInput,
} from "@/lib/session-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { EditMemorySheet } from "./EditMemorySheet";
import { InviteSheet } from "./InviteSheet";
import { MediaGallery } from "./MediaGallery";
import { MemberAvatar } from "./MemberAvatar";
import { ObjectCard } from "./ObjectCard";

/**
 * Detalle del recuerdo.
 *
 * Presentacional a proposito respecto al contenido; las acciones de editar y
 * eliminar viven aqui porque el detalle es el sitio natural para gestionarlas.
 */
export function MemoryDetailView({
  memory,
  onLinkObject,
}: {
  memory: MemoryDetail;
  onLinkObject?: () => void;
}) {
  const router = useRouter();
  const cloud = isSupabaseConfigured();
  const { updateMemory, removeMemory } = useSessionMemories();
  const date = formatMemoryDate(memory.happenedAt);

  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  async function handleSave(edit: MemoryEditInput) {
    if (cloud) {
      const result = await updateCloudMemoryAction(memory.id, edit);
      if (result.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    } else {
      await updateMemory(memory, edit);
    }
    vibrate(12);
  }

  async function handleDelete() {
    if (cloud) {
      const result = await deleteCloudMemoryAction(memory.id);
      if (result.error) {
        window.alert(result.error);
        return;
      }
      // redirect en la action
      return;
    }
    removeMemory(memory.id);
    vibrate(18);
    setConfirmDelete(false);
    router.replace("/");
  }

  return (
    <article className="pb-24">
      <div className="relative">
        <div className="relative aspect-4/5 w-full overflow-hidden bg-surface-sunken sm:aspect-video">
          <ViewTransition
            name={`memory-cover-${memory.id}`}
            share="morph"
            default="none"
          >
            <Image
              src={memory.coverUrl}
              alt={memory.coverAlt}
              fill
              priority
              sizes="100vw"
              className="object-cover"
              unoptimized={needsUnoptimized(memory.coverUrl)}
            />
          </ViewTransition>
        </div>

        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link
            href="/"
            transitionTypes={["nav-back"]}
            aria-label="Volver a Recuerdos"
            className="inline-grid size-11 place-items-center rounded-full bg-black/40 text-white backdrop-blur-md transition-transform duration-150 ease-out active:scale-90"
          >
            <ArrowLeft size={20} aria-hidden />
          </Link>

          <div className="relative" ref={menuRef}>
            <IconButton
              label="Mas opciones"
              variant="onMedia"
              onClick={() => setMenuOpen((value) => !value)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <MoreHorizontal size={20} aria-hidden />
            </IconButton>

            {menuOpen ? (
              <div
                role="menu"
                className="absolute top-12 right-0 z-20 min-w-44 overflow-hidden rounded-md border border-border bg-surface-raised shadow-float"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditing(true);
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-label transition-colors hover:bg-surface-sunken"
                >
                  <Pencil size={16} aria-hidden />
                  Editar
                </button>
                {cloud ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setInviting(true);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-label transition-colors hover:bg-surface-sunken"
                  >
                    <UserPlus size={16} aria-hidden />
                    Invitar
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-label text-danger transition-colors hover:bg-danger-wash"
                >
                  <Trash2 size={16} aria-hidden />
                  Eliminar
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative -mt-6 rounded-t-lg bg-surface px-4 pt-6">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-display font-semibold tracking-tight text-balance">
            {memory.title}
          </h1>

          {(date || memory.location) && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-ink-muted">
              {date ? <span>{date}</span> : null}
              {date && memory.location ? (
                <span aria-hidden className="text-ink-subtle">
                  ·
                </span>
              ) : null}
              {memory.location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={13} aria-hidden />
                  {memory.location}
                </span>
              ) : null}
            </p>
          )}

          {memory.description ? (
            <p className="mt-4 text-body text-ink-muted text-pretty">
              {memory.description}
            </p>
          ) : null}

          <MediaGallery media={memory.media} />

          {memory.objects.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-label font-semibold text-ink-muted">
                Objetos que abren este recuerdo
              </h2>
              <p className="mt-1 text-meta text-ink-subtle text-pretty">
                Apunta con la camara a cualquiera de ellos para volver aqui.
              </p>
              <ul className="scrollbar-none -mx-4 mt-3 flex gap-3 overflow-x-auto px-4">
                {memory.objects.map((object) => (
                  <li key={object.id}>
                    <ObjectCard object={object} />
                  </li>
                ))}
              </ul>
              {onLinkObject ? (
                <Button
                  variant="secondary"
                  onClick={onLinkObject}
                  className="mt-4 w-full"
                >
                  <ScanLine size={17} aria-hidden />
                  Actualizar referencia del objeto
                </Button>
              ) : null}
            </section>
          ) : onLinkObject ? (
            <section className="mt-8 rounded-md border border-border bg-surface-sunken p-4">
              <h2 className="text-label font-semibold">
                Vincular un objeto fisico
              </h2>
              <p className="mt-1 text-meta text-ink-muted text-pretty">
                Fotografia el objeto para poder reabrir este recuerdo con la
                camara.
              </p>
              <Button onClick={onLinkObject} className="mt-4 w-full">
                <ScanLine size={17} aria-hidden />
                Vincular ahora
              </Button>
            </section>
          ) : null}
          {memory.members.length > 1 ? (
            <section className="mt-8">
              <h2 className="text-label font-semibold text-ink-muted">
                Con acceso
              </h2>
              <ul className="mt-3 flex items-center -space-x-2">
                {memory.members.map((member) => (
                  <li key={member.id}>
                    <MemberAvatar member={member} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      <EditMemorySheet
        open={editing}
        memory={memory}
        onClose={() => setEditing(false)}
        onSave={handleSave}
      />

      {cloud ? (
        <InviteSheet
          open={inviting}
          memoryId={memory.id}
          memoryTitle={memory.title}
          onClose={() => setInviting(false)}
        />
      ) : null}

      <BottomSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Eliminar recuerdo"
      >
        <p className="pt-1 text-body text-ink-muted text-pretty">
          Se borrara &ldquo;{memory.title}&rdquo; de este dispositivo. No se
          puede deshacer.
        </p>
        <div className="mt-5 flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setConfirmDelete(false)}
            className="flex-1"
          >
            Cancelar
          </Button>
          <button
            type="button"
            onClick={handleDelete}
            className={buttonStyles("danger", "md", "flex-1")}
          >
            Eliminar
          </button>
        </div>
      </BottomSheet>
    </article>
  );
}
