-- Event Completion Social — hybrid model (PR1 DDL)
-- Run manually in Supabase SQL editor. Idempotent (IF NOT EXISTS guards).
-- Adds grupal shared cols + per-user completions table, RLS, indexes.

create extension if not exists pgcrypto;

-- 1. academic_events: event_type + completed_by/at for grupal
alter table public.academic_events add column if not exists event_type text;
alter table public.academic_events add column if not exists completed_by uuid references public.profiles(id) on delete set null;
alter table public.academic_events add column if not exists completed_at timestamptz;

-- Backfill default for existing rows (if null)
update public.academic_events set event_type = 'individual' where event_type is null;

-- Ensure default + check constraint (idempotent via DO block)
do $$
begin
  -- set default
  begin
    execute 'alter table public.academic_events alter column event_type set default ''individual''';
  exception when others then null;
  end;
  -- add check constraint if missing
  if not exists (select 1 from pg_constraint where conname = 'academic_events_event_type_check' and conrelid = 'public.academic_events'::regclass) then
    -- drop any stray check created by add column without name, then add named one
    begin
      execute 'alter table public.academic_events add constraint academic_events_event_type_check check (event_type in (''individual'',''grupal''))';
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- 2. academic_event_completions: per-user completions for individual
create table if not exists public.academic_event_completions (
  id uuid not null default gen_random_uuid(),
  event_id uuid not null references public.academic_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (event_id, user_id),
  unique (id)
);

-- Ensure id unique index exists when table pre-existed without id (compat)
create unique index if not exists academic_event_completions_id_uidx on public.academic_event_completions(id);

-- 3. Indexes (task 1.4)
create index if not exists academic_event_completions_event_user_idx on public.academic_event_completions(event_id, user_id);
create index if not exists academic_events_completed_at_idx on public.academic_events(completed_at);
create index if not exists academic_event_completions_user_idx on public.academic_event_completions(user_id);
create index if not exists academic_event_completions_event_idx on public.academic_event_completions(event_id);

-- 4. notifications: add event_completed to type check + partial unique for grouped upsert (task 1.4)
do $$
declare rec record;
begin
  if exists (select 1 from pg_constraint where conname = 'notifications_type_check' and conrelid = 'public.notifications'::regclass) then
    begin execute 'alter table public.notifications drop constraint notifications_type_check'; exception when others then null; end;
  end if;
  for rec in select conname from pg_constraint where conrelid = 'public.notifications'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%type in%' loop
    begin execute format('alter table public.notifications drop constraint %I', rec.conname); exception when others then null; end;
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'notifications_type_check_v2' and conrelid = 'public.notifications'::regclass) then
    execute 'alter table public.notifications add constraint notifications_type_check_v2 check (type in (''new_comment'',''mention'',''new_event'',''live_note'',''event_completed''))';
  end if;
end $$;

-- Partial unique for grouped upsert per user per event when type=event_completed
create unique index if not exists notifications_user_event_completed_uidx
  on public.notifications(user_id, event_id) where type = 'event_completed';

-- 5. Grants
grant select, insert, delete on public.academic_event_completions to authenticated;
grant select, update on public.academic_events to anon, authenticated;

-- 6. RLS enable
alter table public.academic_event_completions enable row level security;
alter table public.academic_events enable row level security; -- already enabled, idempotent

-- 7. RLS policies (task 1.3)
-- academic_event_completions: SELECT any auth can read (for board join), INSERT own-row, DELETE own-row
drop policy if exists "Auth read completions" on public.academic_event_completions;
create policy "Auth read completions" on public.academic_event_completions for select to authenticated using (true);

drop policy if exists "Auth insert own completion" on public.academic_event_completions;
create policy "Auth insert own completion" on public.academic_event_completions for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Auth delete own completion" on public.academic_event_completions;
create policy "Auth delete own completion" on public.academic_event_completions for delete to authenticated using (user_id = auth.uid());

-- academic_events: allow any authenticated to toggle grupal shared state (completed_by/at)
-- Keep existing policies; add grupal toggle policy via permissive update
drop policy if exists "Auth toggle grupal completion" on public.academic_events;
create policy "Auth toggle grupal completion" on public.academic_events for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null and (completed_by = auth.uid() or completed_by is null));

-- Also ensure anon can read events (already exists, but keep grant)

-- Verify helper (manual): select * from pg_policies where tablename in ('academic_events','academic_event_completions','notifications');
