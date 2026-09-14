-- Community professor/room assignment.
--
-- Lets any authenticated user complete missing data on schedule sessions:
--   1. INSERT new professors and rooms (catalogue stays shared, duplicates
--      are discouraged app-side with a "did you mean ...?" warning).
--   2. UPDATE professor_id / room_id on schedules rows.
--
-- Everything else stays admin-only. RLS alone cannot scope an UPDATE to a
-- column subset, so a BEFORE UPDATE trigger rejects non-admin writes that
-- touch subject_id, day, times, section or comision_id.
--
-- Prerequisites: supabase/schema.sql and supabase/comisiones.sql
-- (the trigger references schedules.comision_id).
-- Idempotent and safe to re-run.

-- 1. Grants: broad like the rest of the app (notes, academic_events);
--    RLS policies below decide who may actually write.
grant insert, update, delete on public.professors to authenticated;
grant insert, update, delete on public.rooms to authenticated;
grant insert, update, delete on public.schedules to authenticated;

-- 2. Catalogue inserts for any logged-in user (update/delete stay admin-only
--    through the pre-existing "Admins manage ..." FOR ALL policies).
drop policy if exists "Authenticated add professors" on public.professors;
create policy "Authenticated add professors"
  on public.professors for insert to authenticated with check (true);

drop policy if exists "Authenticated add rooms" on public.rooms;
create policy "Authenticated add rooms"
  on public.rooms for insert to authenticated with check (true);

-- 3. Session assignment updates for any logged-in user. The trigger in
--    step 4 narrows this down to professor_id / room_id for non-admins.
drop policy if exists "Authenticated assign session professor and room" on public.schedules;
create policy "Authenticated assign session professor and room"
  on public.schedules for update to authenticated using (true) with check (true);

-- 4. Guard: non-admins may only change professor_id and room_id.
create or replace function public.schedules_community_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    return new;
  end if;
  if old.subject_id is distinct from new.subject_id
    or old.day is distinct from new.day
    or old.start_time is distinct from new.start_time
    or old.end_time is distinct from new.end_time
    or old.section is distinct from new.section
    or old.comision_id is distinct from new.comision_id then
    raise exception 'Solo el administrador puede modificar materia, día, horario, sección o comisión. Podés cambiar profesor y aula.';
  end if;
  return new;
end;
$$;

drop trigger if exists schedules_community_guard on public.schedules;
create trigger schedules_community_guard
  before update on public.schedules
  for each row execute function public.schedules_community_guard();
