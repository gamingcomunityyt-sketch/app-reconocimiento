import type { Metadata } from "next";
import {
  ChevronRight,
  CircleQuestionMark,
  HardDrive,
  Info,
  Lock,
  Settings2,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { buttonStyles } from "@/components/ui/Button";
import { PageTransition } from "@/components/ui/ViewTransition";
import { signOut } from "@/lib/auth/actions";
import { getProfile } from "@/lib/data/cloud";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Perfil · Recuerdos",
};

const SETTINGS = [
  { icon: Users, label: "Recuerdos compartidos", hint: "Solo con invitados" },
  { icon: Lock, label: "Privacidad", hint: "Todo privado por defecto" },
  { icon: Settings2, label: "Preferencias" },
  { icon: CircleQuestionMark, label: "Ayuda" },
] as const;

export default async function ProfilePage() {
  const cloud = isSupabaseConfigured();
  const profile = cloud ? await getProfile() : null;
  const initial = (profile?.displayName ?? "A").slice(0, 1).toUpperCase();

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-2xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-32">
        <h1 className="pt-2 text-display font-semibold tracking-tight">
          Perfil
        </h1>

        {!cloud ? (
          <p className="mt-4 flex items-start gap-2 rounded-md bg-surface-sunken px-3.5 py-3 text-meta text-ink-muted text-pretty">
            <Info size={15} aria-hidden className="mt-px shrink-0" />
            Aun no hay cuenta en la nube. Configura Supabase para registrarte y
            guardar recuerdos privados.
          </p>
        ) : null}

        <section className="mt-6 flex items-center gap-3.5">
          <span
            aria-hidden
            className="grid size-14 place-items-center rounded-full bg-[#c8a48b] text-title font-semibold text-[#2b1c11]"
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-title font-semibold">
              {profile?.displayName ?? "Aaron"}
            </p>
            <p className="truncate text-meta text-ink-muted">
              {profile?.email ?? "Sin sesion"}
            </p>
          </div>
        </section>

        {!profile && cloud ? (
          <Link
            href="/entrar"
            className={buttonStyles("primary", "lg", "mt-6 w-full")}
          >
            Entrar o crear cuenta
          </Link>
        ) : null}

        <section className="mt-7">
          <h2 className="text-label font-semibold text-ink-muted">
            Almacenamiento
          </h2>
          <div className="mt-3 rounded-md border border-border bg-surface-raised p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-label font-medium">
                <HardDrive size={16} aria-hidden className="text-ink-muted" />
                {cloud
                  ? "Privado en tu cuenta"
                  : "Solo en este dispositivo"}
              </span>
            </div>
            <p className="mt-2 text-meta text-ink-subtle text-pretty">
              {cloud
                ? "Nadie ve tus recuerdos salvo las personas que invites."
                : "Los datos locales no se sincronizan entre moviles."}
            </p>
          </div>
        </section>

        <section className="mt-7">
          <h2 className="text-label font-semibold text-ink-muted">Ajustes</h2>
          <ul className="mt-3 overflow-hidden rounded-md border border-border bg-surface-raised">
            {SETTINGS.map((item, index) => (
              <li key={item.label}>
                <SettingRow {...item} divided={index > 0} />
              </li>
            ))}
          </ul>
        </section>

        {profile ? (
          <form action={signOut}>
            <button
              type="submit"
              className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-label font-medium text-danger transition-transform duration-150 ease-out active:scale-[0.97]"
            >
              Cerrar sesion
            </button>
          </form>
        ) : null}
      </div>
    </PageTransition>
  );
}

function SettingRow({
  icon: Icon,
  label,
  hint,
  divided,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  divided: boolean;
}) {
  return (
    <button
      type="button"
      className={`flex min-h-14 w-full items-center gap-3.5 px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-sunken ${divided ? "border-t border-border" : ""}`}
    >
      <Icon size={18} aria-hidden className="shrink-0 text-ink-muted" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-label font-medium">{label}</span>
        {hint ? (
          <span className="block truncate text-meta text-ink-subtle">
            {hint}
          </span>
        ) : null}
      </span>
      <ChevronRight size={17} aria-hidden className="shrink-0 text-ink-subtle" />
    </button>
  );
}
