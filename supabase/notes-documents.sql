-- Stage 1 notes migration. Run manually in the Supabase SQL editor.
-- This does not change RLS policies; it only adds document metadata safely.

alter table public.notes add column if not exists title text;
alter table public.notes add column if not exists note_date date;
alter table public.notes add column if not exists tags text[];
alter table public.notes add column if not exists status text;
alter table public.notes add column if not exists updated_at timestamptz;

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
