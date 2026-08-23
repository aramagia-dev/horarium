-- Hybrid notifications (option A): persisted types new_comment, mention, new_event; event_due derived client-side.
-- Run in Supabase SQL Editor. Idempotent.

create extension if not exists pgcrypto;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('new_comment','mention','new_event')),
  title text not null,
  body text not null,
  note_id uuid references public.notes(id) on delete cascade,
  event_id uuid references public.academic_events(id) on delete cascade,
  comment_id uuid references public.note_comments(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_read_created_idx on public.notifications(user_id, read, created_at desc);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);

grant select, insert, update, delete on public.notifications to authenticated;
alter table public.notifications enable row level security;

drop policy if exists "Users select own notifications" on public.notifications;
create policy "Users select own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Actors insert notifications" on public.notifications;
create policy "Actors insert notifications" on public.notifications
  for insert to authenticated with check (actor_id = auth.uid());

drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users delete own notifications" on public.notifications;
create policy "Users delete own notifications" on public.notifications
  for delete to authenticated using (user_id = auth.uid());
