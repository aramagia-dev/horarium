-- Shared academic events. Run manually in the Supabase SQL editor.
create extension if not exists pgcrypto;

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

create index if not exists academic_events_date_idx on public.academic_events(date, time);
create index if not exists academic_events_type_idx on public.academic_events(type);
create index if not exists academic_events_status_idx on public.academic_events(status);
create index if not exists academic_events_subject_idx on public.academic_events(subject_id);

-- Add ownership to existing installations without assigning historical rows.
alter table public.academic_events add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.academic_events alter column created_by set default auth.uid();

create or replace function public.set_updated_at()
returns trigger language plpgsql
as $$ begin new.updated_at = now(); return new; end; $$;

drop trigger if exists academic_events_set_updated_at on public.academic_events;
create trigger academic_events_set_updated_at before update on public.academic_events for each row execute procedure public.set_updated_at();
grant select on public.academic_events to anon, authenticated;
grant insert, update, delete on public.academic_events to authenticated;
alter table public.academic_events enable row level security;

drop policy if exists "Public read academic events" on public.academic_events;
create policy "Public read academic events" on public.academic_events for select to anon, authenticated using (true);
drop policy if exists "Admins manage academic events" on public.academic_events;
drop policy if exists "Authenticated create academic events" on public.academic_events;
create policy "Authenticated create academic events" on public.academic_events for insert to authenticated
  with check (created_by = auth.uid());
drop policy if exists "Authenticated update academic events" on public.academic_events;
create policy "Authenticated update academic events" on public.academic_events for update to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') or created_by = auth.uid())
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') or created_by = auth.uid());
drop policy if exists "Admins delete academic events" on public.academic_events;
drop policy if exists "Owners delete academic events" on public.academic_events;
create policy "Owners delete academic events" on public.academic_events for delete to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') or created_by = auth.uid());
