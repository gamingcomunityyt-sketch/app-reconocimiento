"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { signIn, signUp, type AuthActionState } from "@/lib/auth/actions";
import { cn } from "@/lib/cn";

const initial: AuthActionState = { error: null };

export function AuthForm({
  mode,
  nextPath = "/",
}: {
  mode: "signin" | "signup";
  nextPath?: string;
}) {
  const action = mode === "signup" ? signUp : signIn;
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {mode === "signup" ? (
        <Field label="Nombre" htmlFor="displayName">
          <input
            id="displayName"
            name="displayName"
            autoComplete="name"
            placeholder="Como te llamas"
            className={fieldClass}
          />
        </Field>
      ) : null}

      <Field label="Email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="tu@email.com"
          className={fieldClass}
        />
      </Field>

      <Field label="Contraseña" htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder={mode === "signup" ? "Minimo 6 caracteres" : "Tu contraseña"}
          className={fieldClass}
        />
      </Field>

      {mode === "signin" ? (
        <input type="hidden" name="next" value={nextPath} />
      ) : null}

      {state.error ? (
        <p className="rounded-md bg-danger-wash px-3 py-2 text-meta text-danger" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
        {pending
          ? "Un momento…"
          : mode === "signup"
            ? "Crear cuenta"
            : "Entrar"}
      </Button>

      <p className="text-center text-meta text-ink-muted">
        {mode === "signup" ? (
          <>
            ¿Ya tienes cuenta?{" "}
            <Link href="/entrar" className="font-medium text-accent">
              Entrar
            </Link>
          </>
        ) : (
          <>
            ¿Nuevo aqui?{" "}
            <Link href="/registro" className="font-medium text-accent">
              Crear cuenta
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

const fieldClass = cn(
  "h-11 w-full rounded-sm border border-border bg-surface-raised px-3 text-body outline-none",
  "placeholder:text-ink-subtle focus:border-border-strong",
);

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
