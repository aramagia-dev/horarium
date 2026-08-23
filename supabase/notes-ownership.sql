-- Secure note mutations for an already-running Supabase project.
-- Notes remain shared and readable; authors and admins may mutate them.

grant select on public.notes to authenticated;
drop policy if exists "Public read notes" on public.notes;
drop policy if exists "Authenticated read notes" on public.notes;
create policy "Authenticated read notes" on public.notes for select to authenticated using (true);

drop policy if exists "Authenticated insert notes" on public.notes;
create policy "Authenticated insert notes" on public.notes
  for insert to authenticated
  with check (author_id = auth.uid());

drop policy if exists "Authenticated update notes" on public.notes;
create policy "Authenticated update notes" on public.notes
  for update to authenticated
  using (author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "Authenticated delete notes" on public.notes;
create policy "Authenticated delete notes" on public.notes
  for delete to authenticated
  using (author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

grant select, insert, update, delete on public.note_attachments to authenticated;
drop policy if exists "Users read own note attachments" on public.note_attachments;
create policy "Users read own note attachments" on public.note_attachments for select to authenticated
  using (exists (select 1 from public.notes where notes.id = note_attachments.note_id));
drop policy if exists "Users create own note attachments" on public.note_attachments;
create policy "Users create own note attachments" on public.note_attachments for insert to authenticated
  with check (exists (select 1 from public.notes where notes.id = note_attachments.note_id and (notes.author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))));
drop policy if exists "Users update own note attachments" on public.note_attachments;
create policy "Users update own note attachments" on public.note_attachments for update to authenticated
  using (exists (select 1 from public.notes where notes.id = note_attachments.note_id and (notes.author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))))
  with check (exists (select 1 from public.notes where notes.id = note_attachments.note_id and (notes.author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))));
drop policy if exists "Users delete own note attachments" on public.note_attachments;
create policy "Users delete own note attachments" on public.note_attachments for delete to authenticated
  using (exists (select 1 from public.notes where notes.id = note_attachments.note_id and (notes.author_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))));

drop policy if exists "Users upload note attachments" on storage.objects;
create policy "Users upload note attachments" on storage.objects for insert to authenticated
  with check (bucket_id = 'note-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')));
drop policy if exists "Users read note attachments" on storage.objects;
create policy "Users read note attachments" on storage.objects for select to authenticated
  using (bucket_id = 'note-attachments' and exists (select 1 from public.note_attachments where storage_path = name));
drop policy if exists "Users delete note attachments" on storage.objects;
create policy "Users delete note attachments" on storage.objects for delete to authenticated
  using (bucket_id = 'note-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or exists (select 1 from public.note_attachments where storage_path = name and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))));
drop policy if exists "Users update note attachments" on storage.objects;
create policy "Users update note attachments" on storage.objects for update to authenticated
  using (bucket_id = 'note-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or exists (select 1 from public.note_attachments where storage_path = name and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))))
  with check (bucket_id = 'note-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')));
