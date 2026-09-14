-- Comisiones and per-user enrollments — slice 1 base
-- Run manually in the Supabase SQL editor. Idempotent (safe re-run, same style as academic-events.sql).

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- 1. comisiones lookup (seeded)
create table if not exists public.comisiones (
  id text primary key,
  label text not null,
  shift text not null
);

insert into public.comisiones (id, label, shift) values
  ('4K1', '4K1', 'Noche'),
  ('4K2', '4K2', 'Noche'),
  ('4K3', '4K3', 'Noche'),
  ('4K6', '4K6', 'Noche'),
  ('4K7', '4K7', 'Noche'),
  ('4K8', '4K8', 'Noche')
on conflict (id) do update set label = excluded.label, shift = excluded.shift;

-- 2. schedules: nullable comision_id (NULL = legacy/global, existing rows untouched, no backfill)
alter table public.schedules add column if not exists comision_id text references public.comisiones(id) on delete set null;

create index if not exists schedules_comision_idx on public.schedules(comision_id);
create index if not exists schedules_subject_comision_idx on public.schedules(subject_id, comision_id);

-- 3. Rebuild unique + exclude to include comision_id so identical slots in different comisiones don't collide.
--    Keep legacy NULL rows working: Postgres treats NULLs as distinct in unique/exclude.
do $$
declare
  rec record;
begin
  -- Unique: drop any legacy unique that lacks comision_id (covers auto-named variants)
  for rec in
    select conname
    from pg_constraint
    where conrelid = 'public.schedules'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%subject_id%'
  loop
    if pg_get_constraintdef(rec.oid) not like '%comision_id%' then
      begin
        execute format('alter table public.schedules drop constraint %I', rec.conname);
      exception when others then null;
      end;
    end if;
  end loop;

  -- Drop known legacy name explicitly (fast path, idempotent)
  begin
    execute 'alter table public.schedules drop constraint if exists schedules_subject_id_day_start_time_section_key';
  exception when others then null;
  end;
  begin
    execute 'alter table public.schedules drop constraint if exists schedules_subject_day_start_section_key';
  exception when others then null;
  end;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.schedules'::regclass
      and conname = 'schedules_subject_day_start_section_comision_key'
  ) then
    begin
      execute 'alter table public.schedules add constraint schedules_subject_day_start_section_comision_key unique (subject_id, day, start_time, section, comision_id)';
    exception when duplicate_object then null;
    end;
  end if;

  -- Exclude: drop any existing exclude before recreating with comision_id
  for rec in
    select conname
    from pg_constraint
    where conrelid = 'public.schedules'::regclass
      and contype = 'x'
  loop
    begin
      execute format('alter table public.schedules drop constraint %I', rec.conname);
    exception when others then null;
    end;
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.schedules'::regclass
      and conname = 'schedules_no_overlap_per_comision_excl'
  ) then
    begin
      execute 'alter table public.schedules add constraint schedules_no_overlap_per_comision_excl exclude using gist (day with =, comision_id with =, tsrange(date ''2000-01-01'' + start_time, date ''2000-01-01'' + end_time, ''[)'') with &&)';
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- 4. academic_events: nullable comision_id (NULL = visible to everyone)
alter table public.academic_events add column if not exists comision_id text references public.comisiones(id) on delete set null;

create index if not exists academic_events_comision_idx on public.academic_events(comision_id);
create index if not exists academic_events_subject_comision_idx on public.academic_events(subject_id, comision_id);

-- 5. user_enrollments: one comisión per subject per user (mixable)
create table if not exists public.user_enrollments (
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text not null references public.subjects(id) on delete cascade,
  comision_id text not null references public.comisiones(id) on delete cascade,
  primary key (user_id, subject_id)
);

create index if not exists user_enrollments_user_idx on public.user_enrollments(user_id);
create index if not exists user_enrollments_subject_idx on public.user_enrollments(subject_id);
create index if not exists user_enrollments_comision_idx on public.user_enrollments(comision_id);

-- 6. Grants (matching existing tables style)
grant select on public.comisiones to anon, authenticated;
grant select on public.schedules to anon, authenticated;
grant select, insert, update, delete on public.user_enrollments to authenticated;
grant select on public.academic_events to anon, authenticated;

-- 7. RLS
alter table public.comisiones enable row level security;
alter table public.schedules enable row level security;
alter table public.academic_events enable row level security;
alter table public.user_enrollments enable row level security;

drop policy if exists "Public read comisiones" on public.comisiones;
create policy "Public read comisiones" on public.comisiones for select to anon, authenticated using (true);

drop policy if exists "Admins manage comisiones" on public.comisiones;
create policy "Admins manage comisiones" on public.comisiones for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "Users manage own enrollments" on public.user_enrollments;
create policy "Users manage own enrollments" on public.user_enrollments for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Admins read all enrollments" on public.user_enrollments;
create policy "Admins read all enrollments" on public.user_enrollments for select to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
