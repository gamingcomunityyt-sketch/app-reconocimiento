"use client";

import { useState } from "react";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { inviteToMemoryAction } from "@/lib/data/cloud-actions";
import { vibrate } from "@/lib/haptics";

export function InviteSheet({
  open,
  memoryId,
  memoryTitle,
  onClose,
}: {
  open: boolean;
  memoryId: string;
  memoryTitle: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    setMessage(null);
    const result = await inviteToMemoryAction(memoryId, email);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    vibrate(12);
    setMessage(
      result.pending
        ? `Invitacion guardada para ${email.trim()}. Cuando cree su cuenta con ese email, vera este recuerdo.`
        : `${email.trim()} ya puede ver este recuerdo.`,
    );
    setEmail("");
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Invitar a alguien">
      <p className="pt-1 text-body text-ink-muted text-pretty">
        Comparte &ldquo;{memoryTitle}&rdquo; solo con quien invites. Nadie mas
        puede verlo.
      </p>

      <label htmlFor="invite-email" className="mt-4 block text-meta font-medium text-ink-muted">
        Email
      </label>
      <input
        id="invite-email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="persona@email.com"
        autoComplete="email"
        className="mt-1.5 h-11 w-full rounded-sm border border-border bg-surface px-3 text-body outline-none"
      />

      {error ? (
        <p className="mt-2 text-meta text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-2 text-meta text-ink-muted" role="status">
          {message}
        </p>
      ) : null}

      <div className="mt-5 flex gap-2">
        <Button variant="secondary" onClick={onClose} className="flex-1">
          Cerrar
        </Button>
        <Button
          onClick={submit}
          disabled={pending || !email.trim()}
          className="flex-1"
        >
          {pending ? "Invitando…" : "Invitar"}
        </Button>
      </div>
    </BottomSheet>
  );
}
