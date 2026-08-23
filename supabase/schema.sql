-- Horarium normalized foundation schema.
-- Run this script in the Supabase SQL editor before configuring the browser app.

create extension if not exists pgcrypto;
-- btree_gist lets the schedule exclusion constraint compare text days and time ranges.
create extension if not exists btree_gist;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists avatar_url text;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.subjects (
  id text primary key,
  code text not null unique,
  name text not null unique,
  accent text not null check (accent in ('violet', 'amber', 'blue', 'rose', 'teal')),
  created_at timestamptz not null default now()
);

create table if not exists public.professors (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null references public.subjects(id) on delete cascade,
  professor_id uuid references public.professors(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  day text not null check (day in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday')),
  start_time time not null,
  end_time time not null,
  section text not null,
  check (end_time > start_time),
  unique (subject_id, day, start_time, section),
  -- PostgreSQL has no native time range. A fixed date preserves time-of-day
  -- ordering while the day column keeps Monday and Tuesday independent.
  exclude using gist (
    day with =,
    tsrange(
      date '2000-01-01' + start_time,
      date '2000-01-01' + end_time,
      '[)'
    ) with &&
  )
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null references public.subjects(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null default auth.uid(),
  title text not null default 'Sin título',
  content text not null check (char_length(trim(content)) between 1 and 2000),
  blocks jsonb not null default '[{"id":"initial","type":"paragraph","text":""}]'::jsonb,
  note_date date,
  tags text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  session_id uuid references public.schedules(id) on delete set null
);

create or replace function public.set_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at before update on public.notes
for each row execute procedure public.set_updated_at();

create index if not exists schedules_day_start_idx on public.schedules(day, start_time);
create index if not exists schedules_subject_idx on public.schedules(subject_id);
create index if not exists schedules_professor_idx on public.schedules(professor_id);
create index if not exists schedules_room_idx on public.schedules(room_id);
create index if not exists notes_subject_created_idx on public.notes(subject_id, created_at desc);
create index if not exists notes_author_idx on public.notes(author_id);

create table if not exists public.academic_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 160),
  type text not null check (type in ('parcial', 'entrega', 'recuperatorio', 'exposición', 'otro')),
  date date not null,
  time time,
  subject_id text references public.subjects(id) on delete set null,
  description text check (description is null or char_length(description) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.academic_events add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.academic_events alter column created_by set default auth.uid();
create index if not exists academic_events_date_idx on public.academic_events(date, time);
create index if not exists academic_events_type_idx on public.academic_events(type);
create index if not exists academic_events_status_idx on public.academic_events(status);
create index if not exists academic_events_subject_idx on public.academic_events(subject_id);
drop trigger if exists academic_events_set_updated_at on public.academic_events;
create trigger academic_events_set_updated_at before update on public.academic_events for each row execute procedure public.set_updated_at();

create table if not exists public.note_attachments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  name text not null,
  mime_type text not null,
  size integer not null check (size > 0 and size <= 10485760),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists note_attachments_note_idx on public.note_attachments(note_id, created_at);

grant usage on schema public to anon, authenticated;
grant select on public.subjects, public.professors, public.rooms, public.schedules, public.notes to anon, authenticated;
grant insert, update, delete on public.notes to authenticated;
grant select on public.profiles to authenticated;

alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.professors enable row level security;
alter table public.rooms enable row level security;
alter table public.schedules enable row level security;
alter table public.notes enable row level security;
alter table public.academic_events enable row level security;
alter table public.note_attachments enable row level security;

drop policy if exists "Public read subjects" on public.subjects;
create policy "Public read subjects" on public.subjects for select to anon, authenticated using (true);
drop policy if exists "Admins manage subjects" on public.subjects;
create policy "Admins manage subjects" on public.subjects for all to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "Public read professors" on public.professors;
create policy "Public read professors" on public.professors for select to anon, authenticated using (true);
drop policy if exists "Admins manage professors" on public.professors;
create policy "Admins manage professors" on public.professors for all to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "Public read rooms" on public.rooms;
create policy "Public read rooms" on public.rooms for select to anon, authenticated using (true);
drop policy if exists "Admins manage rooms" on public.rooms;
create policy "Admins manage rooms" on public.rooms for all to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "Public read schedules" on public.schedules;
create policy "Public read schedules" on public.schedules for select to anon, authenticated using (true);
drop policy if exists "Admins manage schedules" on public.schedules;
create policy "Admins manage schedules" on public.schedules for all to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "Public read notes" on public.notes;
create policy "Public read notes" on public.notes for select to anon, authenticated using (true);
drop policy if exists "Authenticated insert notes" on public.notes;
create policy "Authenticated insert notes" on public.notes for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "Authenticated update notes" on public.notes;
create policy "Authenticated update notes" on public.notes for update to authenticated using (author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')) with check (author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
drop policy if exists "Authenticated delete notes" on public.notes;
create policy "Authenticated delete notes" on public.notes for delete to authenticated using (author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

grant select, insert, update, delete on public.note_attachments to authenticated;
drop policy if exists "Users read own note attachments" on public.note_attachments;
create policy "Users read own note attachments" on public.note_attachments for select to authenticated using (exists (select 1 from public.notes where notes.id = note_attachments.note_id));
drop policy if exists "Users create own note attachments" on public.note_attachments;
create policy "Users create own note attachments" on public.note_attachments for insert to authenticated with check (exists (select 1 from public.notes where notes.id = note_attachments.note_id and (notes.author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))));
drop policy if exists "Users update own note attachments" on public.note_attachments;
create policy "Users update own note attachments" on public.note_attachments for update to authenticated using (exists (select 1 from public.notes where notes.id = note_attachments.note_id and (notes.author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')))) with check (exists (select 1 from public.notes where notes.id = note_attachments.note_id and (notes.author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))));
drop policy if exists "Users delete own note attachments" on public.note_attachments;
create policy "Users delete own note attachments" on public.note_attachments for delete to authenticated using (exists (select 1 from public.notes where notes.id = note_attachments.note_id and (notes.author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))));

grant select on public.academic_events to anon, authenticated;
grant insert, update, delete on public.academic_events to authenticated;
drop policy if exists "Public read academic events" on public.academic_events;
create policy "Public read academic events" on public.academic_events for select to anon, authenticated using (true);
drop policy if exists "Authenticated create academic events" on public.academic_events;
create policy "Authenticated create academic events" on public.academic_events for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "Authenticated update academic events" on public.academic_events;
create policy "Authenticated update academic events" on public.academic_events for update to authenticated using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') or created_by = auth.uid()) with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') or created_by = auth.uid());
drop policy if exists "Admins delete academic events" on public.academic_events;
drop policy if exists "Owners delete academic events" on public.academic_events;
create policy "Owners delete academic events" on public.academic_events for delete to authenticated using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') or created_by = auth.uid());

insert into storage.buckets (id, name, public) values ('note-attachments', 'note-attachments', false) on conflict (id) do nothing;
drop policy if exists "Users upload note attachments" on storage.objects;
create policy "Users upload note attachments" on storage.objects for insert to authenticated with check (bucket_id = 'note-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')));
drop policy if exists "Users read note attachments" on storage.objects;
create policy "Users read note attachments" on storage.objects for select to authenticated using (bucket_id = 'note-attachments' and exists (select 1 from public.note_attachments where storage_path = name));
drop policy if exists "Users delete note attachments" on storage.objects;
create policy "Users delete note attachments" on storage.objects for delete to authenticated using (bucket_id = 'note-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or exists (select 1 from public.note_attachments where storage_path = name and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))));
drop policy if exists "Users update note attachments" on storage.objects;
create policy "Users update note attachments" on storage.objects for update to authenticated using (bucket_id = 'note-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or exists (select 1 from public.note_attachments where storage_path = name and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')))) with check (bucket_id = 'note-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')));

drop policy if exists "Users read own profile" on public.profiles;
drop policy if exists "Authenticated read profiles (alias+avatar)" on public.profiles;
create policy "Authenticated read profiles (alias+avatar)" on public.profiles for select to anon, authenticated using (true);
grant select on public.profiles to anon, authenticated;
grant update on public.profiles to authenticated;
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "Admins update any profile" on public.profiles;
create policy "Admins update any profile" on public.profiles for update to authenticated using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')) with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Avatars storage (public read, owner write, 2MB client-validated jpg/png/webp)
insert into storage.buckets (id, name, public) values ('avatars','avatars', true) on conflict (id) do update set public = true;
drop policy if exists "Public read avatars" on storage.objects;
create policy "Public read avatars" on storage.objects for select to anon, authenticated using (bucket_id = 'avatars');
drop policy if exists "Users upload own avatar" on storage.objects;
create policy "Users upload own avatar" on storage.objects for insert to authenticated with check (bucket_id='avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users update own avatar" on storage.objects;
create policy "Users update own avatar" on storage.objects for update to authenticated using (bucket_id='avatars' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id='avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users delete own avatar" on storage.objects;
create policy "Users delete own avatar" on storage.objects for delete to authenticated using (bucket_id='avatars' and (storage.foldername(name))[1] = auth.uid()::text);
alter table public.profiles add column if not exists avatar_url text;

-- Canonical subjects from lib/schedule-data.ts. Schedule rows are intentionally
-- not seeded until professor/room mappings are confirmed by an administrator.
insert into public.subjects (id, code, name, accent) values
  ('subject-asi', 'ASI', 'Administración de Sistemas de Información', 'violet'),
  ('subject-red', 'RED', 'Redes de Datos', 'blue'),
  ('subject-ics', 'ICS', 'Ingeniería y Calidad de Software', 'amber'),
  ('subject-ta', 'TA', 'Tecnología para la Automatización', 'teal'),
  ('subject-pad', 'PAD', 'Programación de Aplicaciones Distribuidas', 'violet'),
  ('subject-ago', 'AGO', 'Algoritmos Genéticos de Optimización Heurística', 'blue')
on conflict (id) do update set code = excluded.code, name = excluded.name, accent = excluded.accent;

insert into public.professors (normalized_name, display_name) values
  ('canto', 'Canto'), ('cele', 'Cele'), ('chibilisco', 'Chibilisco'), ('cordero', 'Cordero'),
  ('de la cruz', 'De la Cruz'), ('ibarra', 'Ibarra'), ('nazar patricia', 'Nazar Patricia'),
  ('vega caro', 'Vega Caro'), ('vicente', 'Vicente'), ('willy y lizondo', 'Willy y Lizondo')
on conflict (normalized_name) do update set display_name = excluded.display_name;
insert into public.rooms (name) values ('Aula por confirmar') on conflict (name) do nothing;

-- After creating the first Auth user, promote it with:
-- update public.profiles set role = 'admin' where id = 'USER-UUID';
