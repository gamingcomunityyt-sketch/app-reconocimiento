-- Repara cuentas y crea recuerdos sin depender de service_role en Vercel.
-- Ejecutar en Supabase -> SQL Editor (una sola vez).

-- Perfil propio si el trigger de registro no corrio (p. ej. usuario creado a mano).
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

-- Repara perfil y membresias de dueno en recuerdos huerfanos.
create or replace function public.bootstrap_user_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text;
  user_name text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select email, coalesce(raw_user_meta_data->>'display_name', split_part(email, '@', 1))
  into user_email, user_name
  from auth.users
  where id = uid;

  insert into public.profiles (id, display_name)
  values (uid, coalesce(nullif(trim(user_name), ''), 'Tu'))
  on conflict (id) do nothing;

  insert into public.memory_members (memory_id, user_id, role)
  select m.id, uid, 'owner'
  from public.memories m
  where m.owner_id = uid
    and not exists (
      select 1
      from public.memory_members mm
      where mm.memory_id = m.id and mm.user_id = uid
    );

  insert into public.memory_members (memory_id, user_id, role)
  select i.memory_id, uid, i.role
  from public.share_invites i
  where lower(i.email) = lower(coalesce(user_email, ''))
    and i.accepted_at is null
  on conflict do nothing;

  update public.share_invites
  set accepted_at = now()
  where lower(email) = lower(coalesce(user_email, ''))
    and accepted_at is null;
end;
$$;

revoke all on function public.bootstrap_user_account() from public;
grant execute on function public.bootstrap_user_account() to authenticated;

-- Crea recuerdo + membresia de dueno en una sola transaccion (evita errores RLS).
create or replace function public.create_memory_record(
  p_title text,
  p_description text default null,
  p_happened_at date default null,
  p_location text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_title is null or trim(p_title) = '' then
    raise exception 'title_required';
  end if;

  insert into public.memories (
    id, owner_id, title, description, happened_at, location, visibility
  )
  values (
    new_id,
    auth.uid(),
    trim(p_title),
    nullif(trim(coalesce(p_description, '')), ''),
    p_happened_at,
    nullif(trim(coalesce(p_location, '')), ''),
    'private'
  );

  insert into public.memory_members (memory_id, user_id, role)
  values (new_id, auth.uid(), 'owner');

  return new_id;
end;
$$;

revoke all on function public.create_memory_record(text, text, date, text) from public;
grant execute on function public.create_memory_record(text, text, date, text) to authenticated;
