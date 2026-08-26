"use client";

import { useEffect, useState } from "react";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import type { MemoryDetail } from "@/lib/data";
import type { MemoryEditInput } from "@/lib/session-store";

interface EditMemorySheetProps {
  open: boolean;
  memory: MemoryDetail;
  onClose: () => void;
  onSave: (edit: MemoryEditInput) => Promise<void>;
}

export function EditMemorySheet({
  open,
  memory,
  onClose,
  onSave,
}: EditMemorySheetProps) {
  const [title, setTitle] = useState(memory.title);
  const [happenedAt, setHappenedAt] = useState(memory.happenedAt ?? "");
  const [location, setLocation] = useState(memory.location ?? "");
  const [description, setDescription] = useState(memory.description ?? "");
  const [saving, setSaving] = useState(false);
  const [titleHint, setTitleHint] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(memory.title);
    setHappenedAt(memory.happenedAt ?? "");
    setLocation(memory.location ?? "");
    setDescription(memory.description ?? "");
    setTitleHint(false);
    setSaving(false);
  }, [open, memory]);

  async function handleSave() {
    if (!title.trim()) {
      setTitleHint(true);
      return;
    }
    setSaving(true);
    try {
      await onSave({
        title,
        happenedAt: happenedAt || null,
        location: location.trim() || null,
        description: description.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Editar recuerdo">
      <div className="flex flex-col gap-4 pt-2">
        <Field label="Titulo" htmlFor="edit-memory-title">
          <input
            id="edit-memory-title"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              if (event.target.value.trim()) setTitleHint(false);
            }}
            autoComplete="off"
            aria-invalid={titleHint}
            className="h-11 w-full rounded-sm border border-border bg-surface px-3 text-body outline-none"
          />
          {titleHint ? (
            <p className="mt-1.5 text-meta text-accent" role="status">
              El titulo no puede estar vacio
            </p>
          ) : null}
        </Field>

        <Field label="Cuando fue" htmlFor="edit-memory-date">
          <input
            id="edit-memory-date"
            type="date"
            value={happenedAt}
            onChange={(event) => setHappenedAt(event.target.value)}
            className="h-11 w-full rounded-sm border border-border bg-surface px-3 text-body outline-none"
          />
        </Field>

        <Field label="Donde fue" htmlFor="edit-memory-location">
          <input
            id="edit-memory-location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Lisboa, Portugal"
            autoComplete="off"
            className="h-11 w-full rounded-sm border border-border bg-surface px-3 text-body outline-none placeholder:text-ink-subtle"
          />
        </Field>

        <Field label="Que paso" htmlFor="edit-memory-description">
          <textarea
            id="edit-memory-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="Lo que quieras recordar de este dia"
            className="w-full resize-none rounded-sm border border-border bg-surface px-3 py-2.5 text-body outline-none placeholder:text-ink-subtle"
          />
        </Field>

        <div className="flex gap-2 pt-1">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={saving}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </BottomSheet>
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
