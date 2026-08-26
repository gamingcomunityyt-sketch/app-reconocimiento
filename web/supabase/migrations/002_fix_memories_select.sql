-- Arregla el error "new row violates row-level security policy for table memories".
-- El dueno debe poder VER (select) su propio recuerdo, no solo los miembros.
-- Sin esto, el .select() tras el insert falla porque la membresia aun no existe.
-- Ejecutar en Supabase -> SQL Editor.

drop policy if exists "memories_select_member" on public.memories;
create policy "memories_select_member"
  on public.memories for select to authenticated
  using (owner_id = auth.uid() or public.is_memory_member(id));
