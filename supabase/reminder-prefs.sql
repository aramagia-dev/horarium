-- Per-user reminder preferences: which lead times (days before) trigger a push, per event type.
-- Run manually in the Supabase SQL editor. Idempotent.
-- Absent row (or absent type key) = code defaults in lib/reminder-prefs.ts.
-- Stored empty array = explicitly disabled for that type.
create table if not exists public.reminder_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lead_days jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.reminder_prefs to authenticated;
alter table public.reminder_prefs enable row level security;

drop policy if exists "Users manage own reminder prefs" on public.reminder_prefs;
create policy "Users manage own reminder prefs" on public.reminder_prefs for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
