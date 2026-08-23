-- Fix: shared read for note attachments — companions were getting 400 Object not found
-- on createSignedUrl because the storage SELECT policy did a nested exists() on
-- note_attachments that was itself RLS-filtered. Make both policies permissive
-- for any authenticated user (notes are already shared, so attachments must be).
-- Run this once in Supabase SQL Editor.

-- 1. note_attachments: any authenticated can read any attachment (notes are shared)
drop policy if exists "Users read own note attachments" on public.note_attachments;
drop policy if exists "Users read note attachments" on public.note_attachments;
create policy "Users read note attachments" on public.note_attachments
  for select to authenticated using (true);

-- 2. storage.objects: any authenticated can sign/read any object in the bucket
-- Previously: exists (select from note_attachments where storage_path = name)
-- which failed for companions due to nested RLS evaluation.
drop policy if exists "Users read note attachments" on storage.objects;
create policy "Users read note attachments" on storage.objects
  for select to authenticated using (bucket_id = 'note-attachments');
