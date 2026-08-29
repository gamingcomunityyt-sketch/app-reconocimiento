"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ensureCloudAccountReady,
  createCloudMemory,
  deleteCloudMemory,
  inviteToMemory,
  updateCloudMemory,
} from "@/lib/data/cloud";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type ActionResult = { error: string | null };

async function blobFromFile(file: File | null): Promise<Blob | null> {
  if (!file || file.size === 0) return null;
  return file;
}

export async function saveCloudMemoryAction(formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase no esta configurado." };
  }

  await ensureCloudAccountReady();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "El titulo es obligatorio." };

  const cover = await blobFromFile(formData.get("cover") as File | null);
  if (!cover) return { error: "Falta la fotografia principal." };

  const objectFile =
    (await blobFromFile(formData.get("object") as File | null)) ?? cover;
  const objectLabel =
    String(formData.get("objectLabel") ?? "").trim() || title;

  const extras: Array<{ blob: Blob; name: string }> = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("extra_") || !(value instanceof File)) continue;
    if (value.size === 0) continue;
    extras.push({ blob: value, name: value.name || `${key}.jpg` });
  }

  const result = await createCloudMemory({
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    happenedAt: String(formData.get("happenedAt") ?? "").trim() || null,
    location: String(formData.get("location") ?? "").trim() || null,
    coverBlob: cover,
    coverName: (formData.get("cover") as File).name || "cover.jpg",
    extras,
    objectLabel,
    objectBlob: objectFile,
  });

  if ("error" in result) return { error: result.error };

  revalidatePath("/");
  revalidatePath(`/recuerdo/${result.id}`);
  redirect(`/recuerdo/${result.id}`);
}

export async function updateCloudMemoryAction(
  memoryId: string,
  edit: {
    title: string;
    happenedAt: string | null;
    location: string | null;
    description: string | null;
  },
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase no esta configurado." };
  }
  const { error } = await updateCloudMemory(memoryId, {
    title: edit.title.trim(),
    happenedAt: edit.happenedAt,
    location: edit.location?.trim() || null,
    description: edit.description?.trim() || null,
  });
  if (!error) {
    revalidatePath("/");
    revalidatePath(`/recuerdo/${memoryId}`);
  }
  return { error };
}

export async function deleteCloudMemoryAction(memoryId: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase no esta configurado." };
  }
  const { error } = await deleteCloudMemory(memoryId);
  if (!error) {
    revalidatePath("/");
    redirect("/");
  }
  return { error };
}

export async function inviteToMemoryAction(
  memoryId: string,
  email: string,
): Promise<ActionResult & { pending?: boolean }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase no esta configurado." };
  }
  const result = await inviteToMemory(memoryId, email, "viewer");
  if (!result.error) {
    revalidatePath(`/recuerdo/${memoryId}`);
  }
  return result;
}
