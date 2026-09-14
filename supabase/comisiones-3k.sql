-- Comisiones 3K — slice 3
-- Run manually in the Supabase SQL editor AFTER supabase/comisiones.sql and supabase/comisiones-seed.sql.
-- Idempotent (safe re-run, safe whether older seeds ran or not).
-- Extends CHECK whitelists, inserts comisiones 3K1-3K5, subjects, and roster sessions.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- 1. Extend every comision_id CHECK constraint that whitelists values to also allow 3K1..3K5.
--    Defensive style: drop-by-known-name + recreate, match bodies by '%4K1%' never by '%in%'.
--    Covers schedules, user_enrollments, academic_events and any future table with such a check.

-- schedules
do $$
declare
  rec record;
  dropped boolean := false;
begin
  -- drop known old whitelist names that still contain 4K1 (defensive, covers explicit names)
  for rec in select conname, oid from pg_constraint where conrelid='public.schedules'::regclass and contype='c' and conname in ('schedules_comision_id_check','schedules_comision_check') and pg_get_constraintdef(oid) like '%4K1%' and pg_get_constraintdef(oid) not like '%3K1%' loop
    begin execute format('alter table public.schedules drop constraint %I', rec.conname); dropped := true; exception when others then null; end;
  end loop;
  -- drop any other residual CHECK whose body still whitelists 4K1 but lacks 3K1 (auto-named variants)
  for rec in select conname, oid from pg_constraint where conrelid='public.schedules'::regclass and contype='c' and pg_get_constraintdef(oid) like '%4K1%' and pg_get_constraintdef(oid) not like '%3K1%' loop
    begin execute format('alter table public.schedules drop constraint %I', rec.conname); dropped := true; exception when others then null; end;
  end loop;
  if dropped and not exists (select 1 from pg_constraint where conrelid='public.schedules'::regclass and conname='schedules_comision_id_check_3k') then
    begin execute 'alter table public.schedules add constraint schedules_comision_id_check_3k check (comision_id in (''4K1'',''4K2'',''4K3'',''4K6'',''4K7'',''4K8'',''3K1'',''3K2'',''3K3'',''3K4'',''3K5''))'; exception when duplicate_object then null; end;
  end if;
end $$;

-- user_enrollments
do $$
declare
  rec record;
  dropped boolean := false;
begin
  for rec in select conname, oid from pg_constraint where conrelid='public.user_enrollments'::regclass and contype='c' and conname in ('user_enrollments_comision_id_check','user_enrollments_comision_check') and pg_get_constraintdef(oid) like '%4K1%' and pg_get_constraintdef(oid) not like '%3K1%' loop
    begin execute format('alter table public.user_enrollments drop constraint %I', rec.conname); dropped := true; exception when others then null; end;
  end loop;
  for rec in select conname, oid from pg_constraint where conrelid='public.user_enrollments'::regclass and contype='c' and pg_get_constraintdef(oid) like '%4K1%' and pg_get_constraintdef(oid) not like '%3K1%' loop
    begin execute format('alter table public.user_enrollments drop constraint %I', rec.conname); dropped := true; exception when others then null; end;
  end loop;
  if dropped and not exists (select 1 from pg_constraint where conrelid='public.user_enrollments'::regclass and conname='user_enrollments_comision_id_check_3k') then
    begin execute 'alter table public.user_enrollments add constraint user_enrollments_comision_id_check_3k check (comision_id in (''4K1'',''4K2'',''4K3'',''4K6'',''4K7'',''4K8'',''3K1'',''3K2'',''3K3'',''3K4'',''3K5''))'; exception when duplicate_object then null; end;
  end if;
end $$;

-- academic_events
do $$
declare
  rec record;
  dropped boolean := false;
begin
  for rec in select conname, oid from pg_constraint where conrelid='public.academic_events'::regclass and contype='c' and conname in ('academic_events_comision_id_check','academic_events_comision_check') and pg_get_constraintdef(oid) like '%4K1%' and pg_get_constraintdef(oid) not like '%3K1%' loop
    begin execute format('alter table public.academic_events drop constraint %I', rec.conname); dropped := true; exception when others then null; end;
  end loop;
  for rec in select conname, oid from pg_constraint where conrelid='public.academic_events'::regclass and contype='c' and pg_get_constraintdef(oid) like '%4K1%' and pg_get_constraintdef(oid) not like '%3K1%' loop
    begin execute format('alter table public.academic_events drop constraint %I', rec.conname); dropped := true; exception when others then null; end;
  end loop;
  if dropped and not exists (select 1 from pg_constraint where conrelid='public.academic_events'::regclass and conname='academic_events_comision_id_check_3k') then
    begin execute 'alter table public.academic_events add constraint academic_events_comision_id_check_3k check (comision_id in (''4K1'',''4K2'',''4K3'',''4K6'',''4K7'',''4K8'',''3K1'',''3K2'',''3K3'',''3K4'',''3K5''))'; exception when duplicate_object then null; end;
  end if;
end $$;

-- Generic catch-all: any other table with a CHECK containing 4K1 on a comision_id column
do $$
declare
  rec record;
  tbl regclass;
begin
  for rec in select conname, conrelid, oid from pg_constraint where contype='c' and pg_get_constraintdef(oid) like '%4K1%' and pg_get_constraintdef(oid) not like '%3K1%' and pg_get_constraintdef(oid) like '%comision_id%' loop
    tbl := rec.conrelid;
    if tbl = 'public.schedules'::regclass or tbl = 'public.user_enrollments'::regclass or tbl = 'public.academic_events'::regclass then continue; end if;
    begin
      execute format('alter table %s drop constraint %I', tbl, rec.conname);
    exception when others then null;
    end;
    begin
      execute format('alter table %s add constraint %s check (comision_id in (''4K1'',''4K2'',''4K3'',''4K6'',''4K7'',''4K8'',''3K1'',''3K2'',''3K3'',''3K4'',''3K5''))', tbl, 'comision_id_check_3k');
    exception when duplicate_object then null;
      when others then null;
    end;
  end loop;
end $$;

-- 2. Insert comisiones 3K1-3K5 if missing
insert into public.comisiones (id, label, shift) values
  ('3K1', '3K1', 'Tarde'),
  ('3K2', '3K2', 'Tarde'),
  ('3K3', '3K3', 'Tarde'),
  ('3K4', '3K4', 'Noche'),
  ('3K5', '3K5', 'Noche')
on conflict (id) do update set label = excluded.label, shift = excluded.shift;

-- 3. Insert 8 subjects (ON CONFLICT DO NOTHING by id AND skip when name already exists under another id)
insert into public.subjects (id, code, name, accent)
select 'subject-dsi', 'DSI', 'Diseño de Sistemas de Información', 'violet'
where not exists (select 1 from public.subjects where id='subject-dsi')
  and not exists (select 1 from public.subjects where name='Diseño de Sistemas de Información');

insert into public.subjects (id, code, name, accent)
select 'subject-anu', 'ANU', 'Análisis Numérico', 'amber'
where not exists (select 1 from public.subjects where id='subject-anu')
  and not exists (select 1 from public.subjects where name='Análisis Numérico');

insert into public.subjects (id, code, name, accent)
select 'subject-eco', 'ECO', 'Economía', 'teal'
where not exists (select 1 from public.subjects where id='subject-eco')
  and not exists (select 1 from public.subjects where name='Economía');

insert into public.subjects (id, code, name, accent)
select 'subject-cdd', 'CDD', 'Comunicación de Datos', 'blue'
where not exists (select 1 from public.subjects where id='subject-cdd')
  and not exists (select 1 from public.subjects where name='Comunicación de Datos');

insert into public.subjects (id, code, name, accent)
select 'subject-dsw', 'DSW', 'Desarrollo de Software', 'rose'
where not exists (select 1 from public.subjects where id='subject-dsw')
  and not exists (select 1 from public.subjects where name='Desarrollo de Software');

insert into public.subjects (id, code, name, accent)
select 'subject-sin', 'SIN', 'Seguridad Informática', 'blue'
where not exists (select 1 from public.subjects where id='subject-sin')
  and not exists (select 1 from public.subjects where name='Seguridad Informática');

insert into public.subjects (id, code, name, accent)
select 'subject-fux', 'FUX', 'Fundamentos del Diseño UX/UI', 'rose'
where not exists (select 1 from public.subjects where id='subject-fux')
  and not exists (select 1 from public.subjects where name='Fundamentos del Diseño UX/UI');

insert into public.subjects (id, code, name, accent)
select 'subject-dux', 'DUX', 'Diseño UX para Productos Digitales', 'violet'
where not exists (select 1 from public.subjects where id='subject-dux')
  and not exists (select 1 from public.subjects where name='Diseño UX para Productos Digitales');

-- 4. Roster sessions (NOT EXISTS guard on subject,comision,day,start,section; professor/room NULL)
-- Section rule: FIRST listed slot = Teoría, SECOND = Práctica, single-slot electives = Electivas. Day names in English.

-- 3K1
insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-dsi', '3K1', 'Monday', '14:00', '16:15', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-dsi' and comision_id='3K1' and day='Monday' and start_time='14:00' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-dsi', '3K1', 'Wednesday', '16:15', '18:30', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-dsi' and comision_id='3K1' and day='Wednesday' and start_time='16:15' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-anu', '3K1', 'Monday', '16:15', '18:30', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-anu' and comision_id='3K1' and day='Monday' and start_time='16:15' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-anu', '3K1', 'Tuesday', '16:15', '18:30', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-anu' and comision_id='3K1' and day='Tuesday' and start_time='16:15' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-sin', '3K1', 'Tuesday', '13:15', '16:15', 'Electivas'
where not exists (select 1 from public.schedules where subject_id='subject-sin' and comision_id='3K1' and day='Tuesday' and start_time='13:15' and section='Electivas');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-eco', '3K1', 'Wednesday', '13:15', '16:15', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-eco' and comision_id='3K1' and day='Wednesday' and start_time='13:15' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-eco', '3K1', 'Friday', '13:15', '14:45', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-eco' and comision_id='3K1' and day='Friday' and start_time='13:15' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-cdd', '3K1', 'Thursday', '14:45', '17:00', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-cdd' and comision_id='3K1' and day='Thursday' and start_time='14:45' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-cdd', '3K1', 'Friday', '14:45', '17:00', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-cdd' and comision_id='3K1' and day='Friday' and start_time='14:45' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-dsw', '3K1', 'Thursday', '17:00', '18:30', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-dsw' and comision_id='3K1' and day='Thursday' and start_time='17:00' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-dsw', '3K1', 'Friday', '17:00', '18:30', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-dsw' and comision_id='3K1' and day='Friday' and start_time='17:00' and section='Práctica');

-- 3K2
insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-anu', '3K2', 'Monday', '14:00', '16:15', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-anu' and comision_id='3K2' and day='Monday' and start_time='14:00' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-anu', '3K2', 'Wednesday', '14:00', '16:15', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-anu' and comision_id='3K2' and day='Wednesday' and start_time='14:00' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-dsi', '3K2', 'Monday', '16:15', '18:30', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-dsi' and comision_id='3K2' and day='Monday' and start_time='16:15' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-dsi', '3K2', 'Thursday', '14:45', '17:00', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-dsi' and comision_id='3K2' and day='Thursday' and start_time='14:45' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-dsw', '3K2', 'Tuesday', '14:45', '17:00', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-dsw' and comision_id='3K2' and day='Tuesday' and start_time='14:45' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-dsw', '3K2', 'Friday', '18:30', '20:00', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-dsw' and comision_id='3K2' and day='Friday' and start_time='18:30' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-eco', '3K2', 'Wednesday', '16:15', '18:30', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-eco' and comision_id='3K2' and day='Wednesday' and start_time='16:15' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-eco', '3K2', 'Friday', '14:45', '17:00', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-eco' and comision_id='3K2' and day='Friday' and start_time='14:45' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-cdd', '3K2', 'Thursday', '17:00', '18:30', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-cdd' and comision_id='3K2' and day='Thursday' and start_time='17:00' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-cdd', '3K2', 'Friday', '17:00', '18:30', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-cdd' and comision_id='3K2' and day='Friday' and start_time='17:00' and section='Práctica');

-- 3K3
insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-eco', '3K3', 'Monday', '13:15', '15:30', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-eco' and comision_id='3K3' and day='Monday' and start_time='13:15' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-eco', '3K3', 'Friday', '17:00', '19:15', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-eco' and comision_id='3K3' and day='Friday' and start_time='17:00' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-anu', '3K3', 'Monday', '15:30', '17:45', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-anu' and comision_id='3K3' and day='Monday' and start_time='15:30' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-anu', '3K3', 'Thursday', '15:30', '17:45', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-anu' and comision_id='3K3' and day='Thursday' and start_time='15:30' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-dsw', '3K3', 'Tuesday', '14:00', '15:30', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-dsw' and comision_id='3K3' and day='Tuesday' and start_time='14:00' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-dsw', '3K3', 'Friday', '15:30', '17:00', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-dsw' and comision_id='3K3' and day='Friday' and start_time='15:30' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-cdd', '3K3', 'Tuesday', '17:00', '18:30', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-cdd' and comision_id='3K3' and day='Tuesday' and start_time='17:00' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-cdd', '3K3', 'Wednesday', '15:30', '17:00', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-cdd' and comision_id='3K3' and day='Wednesday' and start_time='15:30' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-dsi', '3K3', 'Wednesday', '17:00', '19:15', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-dsi' and comision_id='3K3' and day='Wednesday' and start_time='17:00' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-dsi', '3K3', 'Friday', '13:15', '15:30', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-dsi' and comision_id='3K3' and day='Friday' and start_time='13:15' and section='Práctica');

-- 3K4
insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-eco', '3K4', 'Monday', '19:00', '21:15', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-eco' and comision_id='3K4' and day='Monday' and start_time='19:00' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-eco', '3K4', 'Friday', '18:15', '20:30', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-eco' and comision_id='3K4' and day='Friday' and start_time='18:15' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-dsi', '3K4', 'Monday', '21:15', '23:30', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-dsi' and comision_id='3K4' and day='Monday' and start_time='21:15' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-dsi', '3K4', 'Wednesday', '20:30', '22:45', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-dsi' and comision_id='3K4' and day='Wednesday' and start_time='20:30' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-cdd', '3K4', 'Tuesday', '19:00', '20:30', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-cdd' and comision_id='3K4' and day='Tuesday' and start_time='19:00' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-cdd', '3K4', 'Wednesday', '19:00', '20:30', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-cdd' and comision_id='3K4' and day='Wednesday' and start_time='19:00' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-dsw', '3K4', 'Tuesday', '20:30', '22:00', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-dsw' and comision_id='3K4' and day='Tuesday' and start_time='20:30' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-dsw', '3K4', 'Thursday', '19:00', '20:30', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-dsw' and comision_id='3K4' and day='Thursday' and start_time='19:00' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-anu', '3K4', 'Thursday', '20:30', '22:45', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-anu' and comision_id='3K4' and day='Thursday' and start_time='20:30' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-anu', '3K4', 'Friday', '20:30', '22:45', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-anu' and comision_id='3K4' and day='Friday' and start_time='20:30' and section='Práctica');

-- 3K5 electives
insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-fux', '3K5', 'Tuesday', '19:00', '22:00', 'Electivas'
where not exists (select 1 from public.schedules where subject_id='subject-fux' and comision_id='3K5' and day='Tuesday' and start_time='19:00' and section='Electivas');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-dux', '3K5', 'Thursday', '19:00', '22:00', 'Electivas'
where not exists (select 1 from public.schedules where subject_id='subject-dux' and comision_id='3K5' and day='Thursday' and start_time='19:00' and section='Electivas');

-- 5. Survivor repair + diagnostics: if a slice subject id is missing (its insert
-- was skipped because a legacy row already owns the name), re-point any dangling
-- sessions to that legacy row and NOTICE; if neither exists, NOTICE for manual fix.
DO $$
DECLARE
  r record;
  other_id text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('subject-dsi', 'Diseño de Sistemas de Información'),
    ('subject-anu', 'Análisis Numérico'),
    ('subject-eco', 'Economía'),
    ('subject-cdd', 'Comunicación de Datos'),
    ('subject-dsw', 'Desarrollo de Software'),
    ('subject-sin', 'Seguridad Informática'),
    ('subject-fux', 'Fundamentos del Diseño UX/UI'),
    ('subject-dux', 'Diseño UX para Productos Digitales')
  ) AS v(id, name)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.subjects WHERE id = r.id) THEN
      SELECT s.id INTO other_id FROM public.subjects s WHERE s.name = r.name LIMIT 1;
      IF other_id IS NOT NULL THEN
        UPDATE public.schedules SET subject_id = other_id WHERE subject_id = r.id;
        RAISE NOTICE 'comisiones-3k: subject % missing, sessions re-pointed to existing % (%)', r.id, other_id, r.name;
      ELSE
        RAISE NOTICE 'comisiones-3k: subject % (%) missing and no same-name row exists — its sessions were skipped', r.id, r.name;
      END IF;
    END IF;
  END LOOP;
END $$;
