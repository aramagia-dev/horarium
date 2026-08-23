-- Delta: avatars + alias libre 2-24 con warning. Aplicar solo este archivo si schema.sql ya fue ejecutado.
alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public) values ('avatars','avatars', true) on conflict (id) do update set public = true;

drop policy if exists "Public read avatars" on storage.objects;
create policy "Public read avatars" on storage.objects for select to anon, authenticated using (bucket_id = 'avatars');
drop policy if exists "Users upload own avatar" on storage.objects;
create policy "Users upload own avatar" on storage.objects for insert to authenticated with check (bucket_id='avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users update own avatar" on storage.objects;
create policy "Users update own avatar" on storage.objects for update to authenticated using (bucket_id='avatars' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id='avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users delete own avatar" on storage.objects;
create policy "Users delete own avatar" on storage.objects for delete to authenticated using (bucket_id='avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users read own profile" on public.profiles;
drop policy if exists "Authenticated read profiles (alias+avatar)" on public.profiles;
create policy "Authenticated read profiles (alias+avatar)" on public.profiles for select to anon, authenticated using (true);
grant select on public.profiles to anon, authenticated;
grant update on public.profiles to authenticated;
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "Admins update any profile" on public.profiles;
create policy "Admins update any profile" on public.profiles for update to authenticated using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')) with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
alter table public.profiles add column if not exists avatar_url text;
