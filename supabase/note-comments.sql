-- Run in Supabase SQL Editor
create table if not exists public.note_comments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null default auth.uid(),
  content text not null check (char_length(trim(content)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists note_comments_note_created_idx on public.note_comments(note_id, created_at);
grant select, insert, update, delete on public.note_comments to authenticated;
alter table public.note_comments enable row level security;
drop policy if exists "Users read note comments" on public.note_comments;
create policy "Users read note comments" on public.note_comments for select to authenticated using (true);
drop policy if exists "Users create note comments" on public.note_comments;
create policy "Users create note comments" on public.note_comments for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "Users update own note comments" on public.note_comments;
create policy "Users update own note comments" on public.note_comments for update to authenticated using (author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role='admin')) with check (author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role='admin'));
drop policy if exists "Users delete own note comments" on public.note_comments;
create policy "Users delete own note comments" on public.note_comments for delete to authenticated using (author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role='admin'));
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists note_comments_set_updated_at on public.note_comments;
create trigger note_comments_set_updated_at before update on public.note_comments for each row execute procedure public.set_updated_at();
