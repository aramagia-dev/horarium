-- Comisiones roster seed — slice 2
-- Run manually in the Supabase SQL editor AFTER supabase/comisiones.sql.
-- Idempotent (safe re-run): UPSERT subjects by id, INSERT sessions with NOT EXISTS guard on (subject_id, comision_id, day, start_time, section).
-- Does NOT touch legacy sessions (comision_id stays NULL) and does NOT touch user_enrollments (empty = global fallback).

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- 1. Subjects: UPSERT 4 core + 5 electives.
--    Core ids/codes reuse existing rows (no duplicate/rename).
--    PAD already exists (subject-pad) — re-upserting keeps it intact.
--    New elective ids/codes follow existing pattern: subject-<lowercase code>, code uppercase 3 letters.
--    Elective accents reuse the 5-value enum (violet/amber/blue/rose/teal).
insert into public.subjects (id, code, name, accent) values
  ('subject-asi', 'ASI', 'Administración de Sistemas de Información', 'violet'),
  ('subject-red', 'RED', 'Redes de Datos', 'blue'),
  ('subject-ics', 'ICS', 'Ingeniería y Calidad de Software', 'amber'),
  ('subject-ta',  'TA',  'Tecnología para la Automatización', 'teal'),
  ('subject-ham', 'HAM', 'Heurísticas y Auto Maching Learning', 'rose'),
  ('subject-sig', 'SIG', 'Sistemas de Información Geográficos', 'teal'),
  ('subject-sri', 'SRI', 'Seguridad en Redes e Infraestructura', 'blue'),
  ('subject-sgc', 'SGC', 'Sistemas de Gestión de la Calidad', 'amber'),
  ('subject-pad', 'PAD', 'Programación de Aplicaciones Distribuidas', 'violet')
on conflict (id) do update set
  code   = excluded.code,
  name   = excluded.name,
  accent = excluded.accent;

-- 2. Roster sessions — professor_id/room_id left NULL (schema allows NULL, UI maps NULL to "Sin asignar" in lib/schedule-data.ts:mapRemoteSchedule and components/schedule-board.tsx).
--    Section follows demo convention: Teoría / Práctica for cores, Electivas for electives (the only 3 values in lib/schedule-data.ts demoSchedule; UI renders any string but slice keeps it canonical).
--    Times are exact from engram topic data/comision-timetables (canonical roster).
--    Guard: NOT EXISTS on (subject_id, comision_id, day, start_time, section) — re-runnable, preserves legacy NULL-comision rows.

-- ── 4K1 (9) ──────────────────────────────────────────────────────────────
insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-asi', '4K1', 'Monday',  '14:00', '16:15', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-asi' and comision_id='4K1' and day='Monday' and start_time='14:00' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-asi', '4K1', 'Friday',  '14:00', '16:15', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-asi' and comision_id='4K1' and day='Friday' and start_time='14:00' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-red', '4K1', 'Monday',    '16:15', '18:30', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-red' and comision_id='4K1' and day='Monday' and start_time='16:15' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-red', '4K1', 'Tuesday',   '14:45', '16:15', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-red' and comision_id='4K1' and day='Tuesday' and start_time='14:45' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-red', '4K1', 'Thursday',  '14:00', '16:15', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-red' and comision_id='4K1' and day='Thursday' and start_time='14:00' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-ics', '4K1', 'Tuesday',   '16:15', '17:45', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-ics' and comision_id='4K1' and day='Tuesday' and start_time='16:15' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-ics', '4K1', 'Thursday',  '16:15', '18:30', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-ics' and comision_id='4K1' and day='Thursday' and start_time='16:15' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-ta', '4K1', 'Wednesday', '14:00', '16:15', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-ta' and comision_id='4K1' and day='Wednesday' and start_time='14:00' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-ta', '4K1', 'Friday',    '16:15', '18:30', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-ta' and comision_id='4K1' and day='Friday' and start_time='16:15' and section='Práctica');

-- ── 4K2 (9) ──────────────────────────────────────────────────────────────
insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-asi', '4K2', 'Monday',  '16:15', '18:30', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-asi' and comision_id='4K2' and day='Monday' and start_time='16:15' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-asi', '4K2', 'Friday',  '16:15', '18:30', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-asi' and comision_id='4K2' and day='Friday' and start_time='16:15' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-red', '4K2', 'Monday',    '14:00', '16:15', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-red' and comision_id='4K2' and day='Monday' and start_time='14:00' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-red', '4K2', 'Tuesday',   '17:00', '18:30', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-red' and comision_id='4K2' and day='Tuesday' and start_time='17:00' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-red', '4K2', 'Thursday',  '16:15', '18:30', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-red' and comision_id='4K2' and day='Thursday' and start_time='16:15' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-ics', '4K2', 'Wednesday', '14:00', '16:15', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-ics' and comision_id='4K2' and day='Wednesday' and start_time='14:00' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-ics', '4K2', 'Thursday',  '14:00', '16:15', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-ics' and comision_id='4K2' and day='Thursday' and start_time='14:00' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-ta', '4K2', 'Wednesday', '16:15', '18:30', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-ta' and comision_id='4K2' and day='Wednesday' and start_time='16:15' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-ta', '4K2', 'Friday',    '14:00', '16:15', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-ta' and comision_id='4K2' and day='Friday' and start_time='14:00' and section='Práctica');

-- ── 4K3 night (9) ───────────────────────────────────────────────────────
insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-asi', '4K3', 'Monday',  '21:15', '23:30', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-asi' and comision_id='4K3' and day='Monday' and start_time='21:15' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-asi', '4K3', 'Friday',  '21:15', '23:30', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-asi' and comision_id='4K3' and day='Friday' and start_time='21:15' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-red', '4K3', 'Monday',    '19:00', '21:15', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-red' and comision_id='4K3' and day='Monday' and start_time='19:00' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-red', '4K3', 'Tuesday',   '19:00', '20:30', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-red' and comision_id='4K3' and day='Tuesday' and start_time='19:00' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-red', '4K3', 'Thursday',  '19:00', '21:15', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-red' and comision_id='4K3' and day='Thursday' and start_time='19:00' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-ics', '4K3', 'Tuesday',   '20:30', '22:45', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-ics' and comision_id='4K3' and day='Tuesday' and start_time='20:30' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-ics', '4K3', 'Wednesday', '21:15', '23:30', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-ics' and comision_id='4K3' and day='Wednesday' and start_time='21:15' and section='Práctica');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-ta', '4K3', 'Wednesday', '19:00', '21:15', 'Teoría'
where not exists (select 1 from public.schedules where subject_id='subject-ta' and comision_id='4K3' and day='Wednesday' and start_time='19:00' and section='Teoría');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-ta', '4K3', 'Friday',    '19:00', '21:15', 'Práctica'
where not exists (select 1 from public.schedules where subject_id='subject-ta' and comision_id='4K3' and day='Friday' and start_time='19:00' and section='Práctica');

-- ── 4K6 electives (3) ───────────────────────────────────────────────────
insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-ham', '4K6', 'Thursday',  '13:15', '16:15', 'Electivas'
where not exists (select 1 from public.schedules where subject_id='subject-ham' and comision_id='4K6' and day='Thursday' and start_time='13:15' and section='Electivas');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-sig', '4K6', 'Tuesday',   '16:15', '19:15', 'Electivas'
where not exists (select 1 from public.schedules where subject_id='subject-sig' and comision_id='4K6' and day='Tuesday' and start_time='16:15' and section='Electivas');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-sri', '4K6', 'Wednesday', '16:15', '19:15', 'Electivas'
where not exists (select 1 from public.schedules where subject_id='subject-sri' and comision_id='4K6' and day='Wednesday' and start_time='16:15' and section='Electivas');

-- ── 4K7 electives (2) ───────────────────────────────────────────────────
insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-sgc', '4K7', 'Tuesday',  '16:15', '18:30', 'Electivas'
where not exists (select 1 from public.schedules where subject_id='subject-sgc' and comision_id='4K7' and day='Tuesday' and start_time='16:15' and section='Electivas');

insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-sgc', '4K7', 'Thursday', '16:15', '18:30', 'Electivas'
where not exists (select 1 from public.schedules where subject_id='subject-sgc' and comision_id='4K7' and day='Thursday' and start_time='16:15' and section='Electivas');

-- ── 4K8 electives (1) ───────────────────────────────────────────────────
insert into public.schedules (subject_id, comision_id, day, start_time, end_time, section)
select 'subject-pad', '4K8', 'Wednesday', '17:45', '20:45', 'Electivas'
where not exists (select 1 from public.schedules where subject_id='subject-pad' and comision_id='4K8' and day='Wednesday' and start_time='17:45' and section='Electivas');
