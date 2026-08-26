-- Recuerdos: esquema inicial, RLS y storage privado.
-- Ejecutar en Supabase → SQL Editor (o via CLI: supabase db push).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  happened_at date,
  location text,
  visibility text not null default 'private'
    check (visibility in ('private', 'shared')),
  created_at timestamptz not null default now()
);

create table if not exists public.memory_members (
  memory_id uuid not null references public.memories (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (memory_id, user_id)
);

create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories (id) on delete cascade,
  storage_path text not null,
  kind text not null check (kind in ('image', 'video', 'audio')),
  mime_type text not null,
  bytes bigint not null default 0,
  width int,
  height int,
  duration_ms int,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.objects (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories (id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.object_references (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references public.objects (id) on delete cascade,
  storage_path text not null,
  algorithm text not null default 'ORB',
  keypoint_count int not null default 0,
  descriptor_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.share_invites (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories (id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('editor', 'viewer')),
  invited_by uuid not null references auth.users (id) on delete cascade,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (memory_id, email)
);

create index if not exists memories_owner_id_idx on public.memories (owner_id);
create index if not exists memory_members_user_id_idx on public.memory_members (user_id);
create index if not exists media_memory_id_idx on public.media (memory_id);
create index if not exists objects_memory_id_idx on public.objects (memory_id);
create index if not exists share_invites_email_idx on public.share_invites (email);

-- ---------------------------------------------------------------------------
-- Helpers RLS
-- ---------------------------------------------------------------------------

create or replace function public.is_memory_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memory_members m
    where m.memory_id = target
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.memory_role(target uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.memory_members m
  where m.memory_id = target
    and m.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_edit_memory(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.memory_role(target) in ('owner', 'editor'), false);
$$;

-- Perfil al registrarse + aceptar invitaciones pendientes
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.memory_members (memory_id, user_id, role)
  select i.memory_id, new.id, i.role
  from public.share_invites i
  where lower(i.email) = lower(new.email)
    and i.accepted_at is null
  on conflict do nothing;

  update public.share_invites
  set accepted_at = now()
  where lower(email) = lower(new.email)
    and accepted_at is null;

  update public.memories mem
  set visibility = 'shared'
  where mem.id in (
    select memory_id from public.memory_members where user_id = new.id and role <> 'owner'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.memories enable row level security;
alter table public.memory_members enable row level security;
alter table public.media enable row level security;
alter table public.objects enable row level security;
alter table public.object_references enable row level security;
alter table public.share_invites enable row level security;

-- profiles
drop policy if exists "profiles_select_own_or_shared" on public.profiles;
create policy "profiles_select_own_or_shared"
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.memory_members mine
      join public.memory_members theirs
        on mine.memory_id = theirs.memory_id
      where mine.user_id = auth.uid()
        and theirs.user_id = profiles.id
    )
  );

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- memories
drop policy if exists "memories_select_member" on public.memories;
create policy "memories_select_member"
  on public.memories for select to authenticated
  using (owner_id = auth.uid() or public.is_memory_member(id));

drop policy if exists "memories_insert_own" on public.memories;
create policy "memories_insert_own"
  on public.memories for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "memories_update_editors" on public.memories;
create policy "memories_update_editors"
  on public.memories for update to authenticated
  using (public.can_edit_memory(id))
  with check (public.can_edit_memory(id));

drop policy if exists "memories_delete_owner" on public.memories;
create policy "memories_delete_owner"
  on public.memories for delete to authenticated
  using (public.memory_role(id) = 'owner');

-- memory_members
drop policy if exists "members_select" on public.memory_members;
create policy "members_select"
  on public.memory_members for select to authenticated
  using (public.is_memory_member(memory_id));

drop policy if exists "members_insert_owner" on public.memory_members;
create policy "members_insert_owner"
  on public.memory_members for insert to authenticated
  with check (
    public.memory_role(memory_id) = 'owner'
    or (user_id = auth.uid() and role = 'owner')
  );

drop policy if exists "members_delete_owner" on public.memory_members;
create policy "members_delete_owner"
  on public.memory_members for delete to authenticated
  using (
    public.memory_role(memory_id) = 'owner'
    and user_id <> auth.uid()
  );

-- media / objects / references
drop policy if exists "media_select" on public.media;
create policy "media_select"
  on public.media for select to authenticated
  using (public.is_memory_member(memory_id));

drop policy if exists "media_write" on public.media;
create policy "media_write"
  on public.media for all to authenticated
  using (public.can_edit_memory(memory_id))
  with check (public.can_edit_memory(memory_id));

drop policy if exists "objects_select" on public.objects;
create policy "objects_select"
  on public.objects for select to authenticated
  using (public.is_memory_member(memory_id));

drop policy if exists "objects_write" on public.objects;
create policy "objects_write"
  on public.objects for all to authenticated
  using (public.can_edit_memory(memory_id))
  with check (public.can_edit_memory(memory_id));

drop policy if exists "object_refs_select" on public.object_references;
create policy "object_refs_select"
  on public.object_references for select to authenticated
  using (
    exists (
      select 1 from public.objects o
      where o.id = object_id and public.is_memory_member(o.memory_id)
    )
  );

drop policy if exists "object_refs_write" on public.object_references;
create policy "object_refs_write"
  on public.object_references for all to authenticated
  using (
    exists (
      select 1 from public.objects o
      where o.id = object_id and public.can_edit_memory(o.memory_id)
    )
  )
  with check (
    exists (
      select 1 from public.objects o
      where o.id = object_id and public.can_edit_memory(o.memory_id)
    )
  );

-- invites
drop policy if exists "invites_select" on public.share_invites;
create policy "invites_select"
  on public.share_invites for select to authenticated
  using (
    public.memory_role(memory_id) = 'owner'
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "invites_insert" on public.share_invites;
create policy "invites_insert"
  on public.share_invites for insert to authenticated
  with check (
    public.memory_role(memory_id) = 'owner'
    and invited_by = auth.uid()
  );

drop policy if exists "invites_delete" on public.share_invites;
create policy "invites_delete"
  on public.share_invites for delete to authenticated
  using (public.memory_role(memory_id) = 'owner');

-- Invitar por email: si ya hay cuenta, entra al momento; si no, queda pendiente.
create or replace function public.invite_to_memory(
  target_memory uuid,
  target_email text,
  target_role text default 'viewer'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_email text := lower(trim(target_email));
  existing_user uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if public.memory_role(target_memory) <> 'owner' then
    raise exception 'not_owner';
  end if;
  if target_role not in ('viewer', 'editor') then
    raise exception 'invalid_role';
  end if;
  if clean_email is null or position('@' in clean_email) = 0 then
    raise exception 'invalid_email';
  end if;

  select id into existing_user
  from auth.users
  where lower(email) = clean_email
  limit 1;

  insert into public.share_invites (memory_id, email, role, invited_by, accepted_at)
  values (
    target_memory,
    clean_email,
    target_role,
    auth.uid(),
    case when existing_user is not null then now() else null end
  )
  on conflict (memory_id, email) do update
    set role = excluded.role,
        invited_by = excluded.invited_by,
        accepted_at = excluded.accepted_at;

  if existing_user is not null then
    insert into public.memory_members (memory_id, user_id, role)
    values (target_memory, existing_user, target_role)
    on conflict (memory_id, user_id) do update
      set role = excluded.role;
  end if;

  update public.memories
  set visibility = 'shared'
  where id = target_memory;

  return jsonb_build_object(
    'pending', existing_user is null,
    'email', clean_email
  );
end;
$$;

revoke all on function public.invite_to_memory(uuid, text, text) from public;
grant execute on function public.invite_to_memory(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage privado
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'memory-media',
  'memory-media',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/mp4']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Rutas: {user_id}/{memory_id}/{filename}
drop policy if exists "memory_media_select" on storage.objects;
create policy "memory_media_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'memory-media'
    and public.is_memory_member((storage.foldername(name))[2]::uuid)
  );

drop policy if exists "memory_media_insert" on storage.objects;
create policy "memory_media_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'memory-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.can_edit_memory((storage.foldername(name))[2]::uuid)
  );

drop policy if exists "memory_media_update" on storage.objects;
create policy "memory_media_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'memory-media'
    and public.can_edit_memory((storage.foldername(name))[2]::uuid)
  );

drop policy if exists "memory_media_delete" on storage.objects;
create policy "memory_media_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'memory-media'
    and public.can_edit_memory((storage.foldername(name))[2]::uuid)
  );
