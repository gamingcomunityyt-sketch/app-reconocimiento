import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/AuthForm";
import { PageTransition } from "@/components/ui/ViewTransition";

export const metadata: Metadata = {
  title: "Crear cuenta · Recuerdos",
};

export default function SignUpPage() {
  return (
    <PageTransition>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
        <h1 className="text-display font-semibold tracking-tight">
          Crear cuenta
        </h1>
        <p className="mt-2 text-body text-ink-muted text-pretty">
          Registrate para guardar tus recuerdos en la nube, solo para ti.
        </p>
        <div className="mt-8">
          <AuthForm mode="signup" />
        </div>
      </div>
    </PageTransition>
  );
}
