import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/AuthForm";
import { PageTransition } from "@/components/ui/ViewTransition";

export const metadata: Metadata = {
  title: "Entrar · Recuerdos",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") ? params.next : "/";

  return (
    <PageTransition>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
        <h1 className="text-display font-semibold tracking-tight">Entrar</h1>
        <p className="mt-2 text-body text-ink-muted text-pretty">
          Tus recuerdos son privados. Solo tu y a quien invites podeis verlos.
        </p>
        <div className="mt-8">
          <AuthForm mode="signin" nextPath={nextPath} />
        </div>
      </div>
    </PageTransition>
  );
}
