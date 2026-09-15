-- Web Push subscriptions: one row per (user, device endpoint).
-- Run manually in the Supabase SQL editor. Idempotent.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

grant select, insert, delete on public.push_subscriptions to authenticated;
alter table public.push_subscriptions enable row level security;

drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
create policy "Users manage own push subscriptions" on public.push_subscriptions for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
