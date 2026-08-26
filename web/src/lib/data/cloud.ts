import "server-only";

import { createClient } from "@/lib/supabase/server";

const BUCKET = "memory-media";
const SIGNED_URL_SECONDS = 60 * 60;

export type MemoryDetail = import("./types").MemoryDetail;
export type MemorySummary = import("./types").MemorySummary;
export type MediaItem = import("./types").MediaItem;
export type LinkedObject = import("./types").LinkedObject;
export type MemberView = import("./types").MemberView;
export type ScanCandidateView = import("./types").ScanCandidateView;

type MemoryRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  happened_at: string | null;
  location: string | null;
  visibility: "private" | "shared";
};

type MediaRow = {
  id: string;
  memory_id: string;
  storage_path: string;
  kind: "image" | "video" | "audio";
  duration_ms: number | null;
  sort_order: number;
  mime_type: string;
  bytes: number;
};

type ObjectRow = { id: string; memory_id: string; label: string };
type ObjectRefRow = { id: string; object_id: string; storage_path: string };

function byRecency(a: MemorySummary, b: MemorySummary): number {
  if (a.happenedAt === b.happenedAt) return 0;
  if (a.happenedAt === null) return 1;
  if (b.happenedAt === null) return -1;
  return a.happenedAt < b.happenedAt ? 1 : -1;
}

async function signedUrl(path: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  return data?.signedUrl ?? null;
}

export async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getProfile() {
  const user = await getAuthUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? null,
    displayName:
      data?.display_name ??
      (typeof user.user_metadata?.display_name === "string"
        ? user.user_metadata.display_name
        : null) ??
      user.email?.split("@")[0] ??
      "Tu",
    avatarUrl: data?.avatar_url ?? null,
  };
}

export async function acceptPendingInvites(): Promise<void> {
  const user = await getAuthUser();
  if (!user?.email) return;

  const supabase = await createClient();
  const { data: invites } = await supabase
    .from("share_invites")
    .select("memory_id, role, id")
    .ilike("email", user.email)
    .is("accepted_at", null);

  if (!invites?.length) return;

  for (const invite of invites) {
    await supabase.from("memory_members").upsert({
      memory_id: invite.memory_id,
      user_id: user.id,
      role: invite.role,
    });
    await supabase
      .from("share_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);
    await supabase
      .from("memories")
      .update({ visibility: "shared" })
      .eq("id", invite.memory_id);
  }
}

export async function listCloudMemories(): Promise<MemorySummary[]> {
  await acceptPendingInvites();
  const supabase = await createClient();
  const { data: memories, error } = await supabase
    .from("memories")
    .select("id, title, happened_at, location, visibility");

  if (error || !memories?.length) return [];

  const ids = memories.map((m) => m.id);
  const [{ data: mediaRows }, { data: objectRows }, { data: memberRows }] =
    await Promise.all([
      supabase
        .from("media")
        .select("id, memory_id, storage_path, kind, sort_order")
        .in("memory_id", ids)
        .order("sort_order", { ascending: true }),
      supabase.from("objects").select("id, memory_id").in("memory_id", ids),
      supabase.from("memory_members").select("memory_id").in("memory_id", ids),
    ]);

  const coverByMemory = new Map<string, string>();
  for (const row of mediaRows ?? []) {
    if (row.kind !== "image" || coverByMemory.has(row.memory_id)) continue;
    const url = await signedUrl(row.storage_path);
    if (url) coverByMemory.set(row.memory_id, url);
  }

  const objectCount = new Map<string, number>();
  for (const row of objectRows ?? []) {
    objectCount.set(row.memory_id, (objectCount.get(row.memory_id) ?? 0) + 1);
  }

  const memberCount = new Map<string, number>();
  for (const row of memberRows ?? []) {
    memberCount.set(row.memory_id, (memberCount.get(row.memory_id) ?? 0) + 1);
  }

  const mediaCount = new Map<string, number>();
  for (const row of mediaRows ?? []) {
    mediaCount.set(row.memory_id, (mediaCount.get(row.memory_id) ?? 0) + 1);
  }

  return memories
    .map((memory) => ({
      id: memory.id,
      title: memory.title,
      happenedAt: memory.happened_at,
      location: memory.location,
      coverUrl: coverByMemory.get(memory.id) ?? "/placeholder-cover.svg",
      coverAlt: memory.title,
      mediaCount: mediaCount.get(memory.id) ?? 0,
      hasLinkedObject: (objectCount.get(memory.id) ?? 0) > 0,
      isShared:
        (memberCount.get(memory.id) ?? 0) > 1 || memory.visibility === "shared",
    }))
    .sort(byRecency);
}

export async function getCloudMemory(id: string): Promise<MemoryDetail | null> {
  await acceptPendingInvites();
  const supabase = await createClient();
  const { data: memory, error } = await supabase
    .from("memories")
    .select("*")
    .eq("id", id)
    .maybeSingle<MemoryRow>();

  if (error || !memory) return null;

  const [{ data: mediaRows }, { data: objectRows }, { data: members }] =
    await Promise.all([
      supabase
        .from("media")
        .select("*")
        .eq("memory_id", id)
        .order("sort_order", { ascending: true })
        .returns<MediaRow[]>(),
      supabase.from("objects").select("*").eq("memory_id", id).returns<ObjectRow[]>(),
      supabase
        .from("memory_members")
        .select("user_id, role")
        .eq("memory_id", id),
    ]);

  const memberIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } =
    memberIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", memberIds)
      : { data: [] as Array<{ id: string; display_name: string | null }> };

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.display_name ?? "Miembro"]),
  );

  const objectIds = (objectRows ?? []).map((o) => o.id);
  const { data: refs } =
    objectIds.length > 0
      ? await supabase
          .from("object_references")
          .select("id, object_id, storage_path")
          .in("object_id", objectIds)
          .returns<ObjectRefRow[]>()
      : { data: [] as ObjectRefRow[] };

  const media: MediaItem[] = [];
  for (const row of mediaRows ?? []) {
    media.push({
      id: row.id,
      kind: row.kind,
      previewUrl:
        row.kind === "audio" ? null : await signedUrl(row.storage_path),
      alt: memory.title,
      durationMs: row.duration_ms,
      caption: null,
    });
  }

  const objects: LinkedObject[] = [];
  for (const object of objectRows ?? []) {
    const objectRefs = (refs ?? []).filter((r) => r.object_id === object.id);
    const firstPath = objectRefs[0]?.storage_path;
    objects.push({
      id: object.id,
      label: object.label,
      imageUrl: firstPath
        ? ((await signedUrl(firstPath)) ?? "/placeholder-cover.svg")
        : "/placeholder-cover.svg",
      referenceCount: Math.max(1, objectRefs.length),
    });
  }

  const coverUrl =
    media.find((item) => item.kind === "image" && item.previewUrl)?.previewUrl ??
    objects[0]?.imageUrl ??
    "/placeholder-cover.svg";

  const memberViews: MemberView[] = (members ?? []).map((m) => ({
    id: m.user_id,
    name: nameById.get(m.user_id) ?? "Miembro",
    role: m.role as MemberView["role"],
  }));

  return {
    id: memory.id,
    title: memory.title,
    happenedAt: memory.happened_at,
    location: memory.location,
    description: memory.description,
    coverUrl,
    coverAlt: memory.title,
    mediaCount: media.length,
    hasLinkedObject: objects.length > 0,
    isShared: memberViews.length > 1 || memory.visibility === "shared",
    media,
    objects,
    members: memberViews,
  };
}

export async function listCloudScanCandidates(): Promise<ScanCandidateView[]> {
  const memories = await listCloudMemories();
  const details = await Promise.all(memories.map((m) => getCloudMemory(m.id)));
  return details.flatMap((memory) => {
    if (!memory) return [];
    return memory.objects.map((object) => ({
      objectId: object.id,
      objectLabel: object.label,
      objectImageUrl: object.imageUrl,
      memoryId: memory.id,
      memoryTitle: memory.title,
      memoryCoverUrl: memory.coverUrl,
    }));
  });
}

export async function createCloudMemory(input: {
  title: string;
  description: string | null;
  happenedAt: string | null;
  location: string | null;
  coverBlob: Blob;
  coverName: string;
  extras: Array<{ blob: Blob; name: string }>;
  objectLabel: string;
  objectBlob: Blob;
}): Promise<{ id: string } | { error: string }> {
  const user = await getAuthUser();
  if (!user) return { error: "Debes iniciar sesion." };

  const supabase = await createClient();
  // Generamos el id en el servidor para NO usar `.select()` tras el insert:
  // el RETURNING aplicaria la politica de SELECT (que exige membresia, aun
  // inexistente) y Postgres lanzaria "new row violates row-level security".
  const memory = { id: crypto.randomUUID() };
  const { error: memoryError } = await supabase.from("memories").insert({
    id: memory.id,
    owner_id: user.id,
    title: input.title,
    description: input.description,
    happened_at: input.happenedAt,
    location: input.location,
    visibility: "private",
  });

  if (memoryError) {
    return { error: memoryError.message ?? "No se pudo crear el recuerdo." };
  }

  const { error: memberError } = await supabase.from("memory_members").insert({
    memory_id: memory.id,
    user_id: user.id,
    role: "owner",
  });
  if (memberError) {
    await supabase.from("memories").delete().eq("id", memory.id);
    return { error: memberError.message };
  }

  async function upload(blob: Blob, filename: string): Promise<string | null> {
    const path = `${user!.id}/${memory!.id}/${filename}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: blob.type || "image/jpeg",
      upsert: false,
    });
    return error ? null : path;
  }

  const coverPath = await upload(
    input.coverBlob,
    `cover-${Date.now()}-${input.coverName.replace(/[^\w.-]+/g, "_")}`,
  );
  if (!coverPath) {
    await supabase.from("memories").delete().eq("id", memory.id);
    return { error: "No se pudo subir la fotografia." };
  }

  const mediaInserts: Array<{
    memory_id: string;
    storage_path: string;
    kind: "image" | "video";
    mime_type: string;
    bytes: number;
    sort_order: number;
  }> = [
    {
      memory_id: memory.id,
      storage_path: coverPath,
      kind: "image",
      mime_type: input.coverBlob.type || "image/jpeg",
      bytes: input.coverBlob.size,
      sort_order: 0,
    },
  ];

  for (const [index, extra] of input.extras.entries()) {
    const path = await upload(
      extra.blob,
      `extra-${index}-${extra.name.replace(/[^\w.-]+/g, "_")}`,
    );
    if (!path) continue;
    mediaInserts.push({
      memory_id: memory.id,
      storage_path: path,
      kind: extra.blob.type.startsWith("video/") ? "video" : "image",
      mime_type: extra.blob.type || "image/jpeg",
      bytes: extra.blob.size,
      sort_order: index + 1,
    });
  }

  const { error: mediaError } = await supabase.from("media").insert(mediaInserts);
  if (mediaError) return { error: mediaError.message };

  const objectRow = { id: crypto.randomUUID() };
  const { error: objectError } = await supabase
    .from("objects")
    .insert({ id: objectRow.id, memory_id: memory.id, label: input.objectLabel });

  if (objectError) {
    return { error: objectError.message ?? "No se pudo vincular el objeto." };
  }

  const objectPath = await upload(input.objectBlob, `object-0.jpg`);
  if (objectPath) {
    await supabase.from("object_references").insert({
      object_id: objectRow.id,
      storage_path: objectPath,
      algorithm: "ORB",
      keypoint_count: 0,
      descriptor_path: null,
    });
  }

  return { id: memory.id };
}

export async function updateCloudMemory(
  id: string,
  edit: {
    title: string;
    happenedAt: string | null;
    location: string | null;
    description: string | null;
  },
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("memories")
    .update({
      title: edit.title,
      happened_at: edit.happenedAt,
      location: edit.location,
      description: edit.description,
    })
    .eq("id", id);
  return { error: error?.message ?? null };
}

export async function deleteCloudMemory(
  id: string,
): Promise<{ error: string | null }> {
  const user = await getAuthUser();
  if (!user) return { error: "Debes iniciar sesion." };

  const supabase = await createClient();
  const folder = `${user.id}/${id}`;
  const { data: files } = await supabase.storage.from(BUCKET).list(folder);
  if (files?.length) {
    await supabase.storage
      .from(BUCKET)
      .remove(files.map((file) => `${folder}/${file.name}`));
  }

  const { error } = await supabase.from("memories").delete().eq("id", id);
  return { error: error?.message ?? null };
}

export async function inviteToMemory(
  memoryId: string,
  email: string,
  role: "viewer" | "editor" = "viewer",
): Promise<{ error: string | null; pending?: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_to_memory", {
    target_memory: memoryId,
    target_email: email.trim().toLowerCase(),
    target_role: role,
  });

  if (error) {
    if (error.message.includes("not_owner")) {
      return { error: "Solo el dueño puede invitar." };
    }
    if (error.message.includes("invalid_email")) {
      return { error: "Email no valido." };
    }
    return { error: error.message };
  }

  const pending =
    data && typeof data === "object" && "pending" in data
      ? Boolean((data as { pending: boolean }).pending)
      : true;

  return { error: null, pending };
}

export async function listMemoryInvites(memoryId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("share_invites")
    .select("id, email, role, accepted_at, created_at")
    .eq("memory_id", memoryId)
    .order("created_at", { ascending: false });
  return data ?? [];
}
