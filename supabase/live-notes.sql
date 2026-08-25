-- Live collaborative notes via Google Docs link (MVP A)
-- Run in Supabase SQL Editor. Idempotent.
-- PR1 Foundation: live_notes + subject_drive_folders + partial unique index + RLS + notifications live_note

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- subject_drive_folders: manual mapping Horarium/{Materia} -> Drive folderId
-- ---------------------------------------------------------------------------
create table if not exists public.subject_drive_folders (
  subject_id text primary key references public.subjects(id) on delete cascade,
  folder_id text not null unique,
  folder_name text not null
);

-- ---------------------------------------------------------------------------
-- live_notes: one SA-owned Google Doc per subject, pinned EN VIVO 4h
-- ---------------------------------------------------------------------------
create table if not exists public.live_notes (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null references public.subjects(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  drive_file_id text not null unique,
  drive_web_view_link text not null,
  folder_id text not null,
  status text not null check (status in ('live','archived')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  archived_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create unique index if not exists live_one_per_subject
  on public.live_notes(subject_id) where status = 'live';

create index if not exists live_expires_idx
  on public.live_notes(expires_at) where status = 'live';

create index if not exists live_notes_subject_status_idx
  on public.live_notes(subject_id, status);

-- ---------------------------------------------------------------------------
-- RLS: live_notes — select for authenticated, no insert/update/delete for client (service_role only)
-- ---------------------------------------------------------------------------
alter table public.live_notes enable row level security;
alter table public.subject_drive_folders enable row level security;

drop policy if exists "Auth read live_notes" on public.live_notes;
create policy "Auth read live_notes"
  on public.live_notes for select to authenticated using (true);

-- Intentionally NO insert/update/delete policies for authenticated.
-- Writes must go through service_role via server API routes.

drop policy if exists "Auth read subject_drive_folders" on public.subject_drive_folders;
create policy "Auth read subject_drive_folders"
  on public.subject_drive_folders for select to authenticated using (true);

-- No insert/update/delete for authenticated on subject_drive_folders either.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select on public.live_notes to authenticated;
grant select on public.subject_drive_folders to authenticated;
grant all on public.live_notes to service_role;
grant all on public.subject_drive_folders to service_role;

-- ---------------------------------------------------------------------------
-- Notifications: extend check to include live_note (idempotent)
-- ---------------------------------------------------------------------------
-- Drop named constraint if it exists (design name)
alter table public.notifications drop constraint if exists notifications_type_check;

-- Drop any auto-generated check constraints on type that don't include live_note.
-- We use a DO block to be idempotent regardless of the original constraint name.
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%type%in%'
  loop
    execute format('alter table public.notifications drop constraint if exists %I', r.conname);
  end loop;
end
$$;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('new_comment','mention','new_event','live_note'));
