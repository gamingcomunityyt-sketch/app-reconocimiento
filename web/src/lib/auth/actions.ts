"use server";

import { redirect } from "next/navigation";

import { ensureCloudAccountReady } from "@/lib/data/cloud";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = {
  error: string | null;
};

function mapAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login")) {
    return "Email o contraseña incorrectos.";
  }
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return "Ya existe una cuenta con ese email.";
  }
  if (lower.includes("password")) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }
  if (lower.includes("email")) {
    return "Revisa el email: no parece válido.";
  }
  return message || "No se ha podido completar la acción.";
}

export async function signUp(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) {
    return { error: "Falta configurar Supabase en las variables de entorno." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!email || !password) {
    return { error: "Email y contraseña son obligatorios." };
  }
  if (password.length < 6) {
    return { error: "La contraseña debe tener al menos 6 caracteres." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName || email.split("@")[0] },
    },
  });

  if (error) return { error: mapAuthError(error.message) };

  if (!data.session) {
    return {
      error:
        "Cuenta creada. Revisa tu email para confirmarla y luego entra con tu contraseña.",
    };
  }

  await ensureCloudAccountReady();
  redirect("/");
}

export async function signIn(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) {
    return { error: "Falta configurar Supabase en las variables de entorno." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/").trim() || "/";

  if (!email || !password) {
    return { error: "Email y contraseña son obligatorios." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: mapAuthError(error.message) };

  await ensureCloudAccountReady();
  redirect(next.startsWith("/") ? next : "/");
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}
