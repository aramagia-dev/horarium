-- Stage 2 migration. Run manually in the Supabase SQL editor.
-- This is intentionally never executed by the browser application.

-- Include the Stage 1 columns so this migration is safe to run by itself.
alter table public.notes add column if not exists title text;
alter table public.notes add column if not exists note_date date;
alter table public.notes add column if not exists tags text[];
alter table public.notes add column if not exists status text;
alter table public.notes add column if not exists updated_at timestamptz;
alter table public.notes add column if not exists session_id uuid references public.schedules(id) on delete set null;

update public.notes
set title = coalesce(nullif(trim(title), ''), 'Sin título'),
    tags = coalesce(tags, '{}'),
    status = case when status = 'archived' then 'archived' else 'active' end,
    updated_at = coalesce(updated_at, created_at, now())
where title is null or trim(title) = '' or tags is null or status is null or updated_at is null;

alter table public.notes alter column title set default 'Sin título';
alter table public.notes alter column title set not null;
alter table public.notes alter column tags set default '{}';
alter table public.notes alter column tags set not null;
alter table public.notes alter column status set default 'active';
alter table public.notes alter column status set not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notes_status_check') then
    alter table public.notes add constraint notes_status_check check (status in ('active', 'archived'));
  end if;
end $$;
alter table public.notes alter column updated_at set default now();
alter table public.notes alter column updated_at set not null;

alter table public.notes add column if not exists blocks jsonb;
update public.notes set blocks = jsonb_build_array(jsonb_build_object('id', id::text || '-paragraph', 'type', 'paragraph', 'text', content)) where blocks is null;
alter table public.notes alter column blocks set default '[{"id":"initial","type":"paragraph","text":""}]'::jsonb;
alter table public.notes alter column blocks set not null;

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
grant select, insert, update, delete on public.note_attachments to authenticated;
alter table public.note_attachments enable row level security;
drop policy if exists "Users read own note attachments" on public.note_attachments;
create policy "Users read own note attachments" on public.note_attachments for select to authenticated using (exists (select 1 from public.notes where notes.id = note_attachments.note_id));
drop policy if exists "Users create own note attachments" on public.note_attachments;
create policy "Users create own note attachments" on public.note_attachments for insert to authenticated with check (exists (select 1 from public.notes where notes.id = note_attachments.note_id and (notes.author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))));
drop policy if exists "Users update own note attachments" on public.note_attachments;
create policy "Users update own note attachments" on public.note_attachments for update to authenticated using (exists (select 1 from public.notes where notes.id = note_attachments.note_id and (notes.author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')))) with check (exists (select 1 from public.notes where notes.id = note_attachments.note_id and (notes.author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))));
drop policy if exists "Users delete own note attachments" on public.note_attachments;
create policy "Users delete own note attachments" on public.note_attachments for delete to authenticated using (exists (select 1 from public.notes where notes.id = note_attachments.note_id and (notes.author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))));

insert into storage.buckets (id, name, public) values ('note-attachments', 'note-attachments', false) on conflict (id) do nothing;
drop policy if exists "Users upload note attachments" on storage.objects;
create policy "Users upload note attachments" on storage.objects for insert to authenticated with check (bucket_id = 'note-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')));
drop policy if exists "Users read note attachments" on storage.objects;
create policy "Users read note attachments" on storage.objects for select to authenticated using (bucket_id = 'note-attachments' and exists (select 1 from public.note_attachments where storage_path = name));
drop policy if exists "Users delete note attachments" on storage.objects;
create policy "Users delete note attachments" on storage.objects for delete to authenticated using (bucket_id = 'note-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or exists (select 1 from public.note_attachments where storage_path = name and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))));
drop policy if exists "Users update note attachments" on storage.objects;
create policy "Users update note attachments" on storage.objects for update to authenticated using (bucket_id = 'note-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or exists (select 1 from public.note_attachments where storage_path = name and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')))) with check (bucket_id = 'note-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')));
