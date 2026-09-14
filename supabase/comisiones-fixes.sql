-- Comisiones fixes — idempotent, safe in any order (safe to re-run and safe whether seed ran or not).
-- Each statement is guarded so re-runs are no-ops.

-- 1. Subject renames (UPDATE by id, only if row exists — no row → 0 rows affected)
UPDATE public.subjects
SET name = 'Algoritmos Genéticos de Optimización Heurística'
WHERE id = 'subject-ham';

UPDATE public.subjects
SET name = 'Ingeniería y Calidad de Software'
WHERE id = 'subject-sgc';

-- 2. Merge pass 1 (BEFORE time fixes): copy professor_id/room_id from legacy
-- duplicates into seeded rows. Matches on the OLD start_time, which is what
-- legacy rows most likely carry. Never touches times/names; only fills NULL
-- professor/room on seeded rows. Re-runs are no-ops once filled.
UPDATE public.schedules AS s
SET professor_id = l.professor_id,
    room_id = l.room_id
FROM public.schedules AS l
WHERE l.comision_id IS NULL
  AND s.comision_id IS NOT NULL
  AND l.subject_id = s.subject_id
  AND l.day = s.day
  AND l.start_time = s.start_time
  AND (s.professor_id IS NULL OR s.room_id IS NULL);
-- 3. Time fixes on SEEDED rows only (comision_id IS NOT NULL, match old start_time so re-runs are no-ops)
-- HAM/4K6/Thursday 13:15-16:15 → 13:30-16:30
UPDATE public.schedules
SET start_time = '13:30', end_time = '16:30'
WHERE comision_id IS NOT NULL
  AND subject_id = 'subject-ham'
  AND comision_id = '4K6'
  AND day = 'Thursday'
  AND start_time = '13:15'
  AND section = 'Electivas';

-- PAD/4K8/Wednesday 17:45-20:45 → 18:30-21:30
UPDATE public.schedules
SET start_time = '18:30', end_time = '21:30'
WHERE comision_id IS NOT NULL
  AND subject_id = 'subject-pad'
  AND comision_id = '4K8'
  AND day = 'Wednesday'
  AND start_time = '17:45'
  AND section = 'Electivas';

-- SGC/4K7/Tuesday 16:15-18:30 → 16:15-18:15 (Thursday unchanged)
UPDATE public.schedules
SET end_time = '18:15'
WHERE comision_id IS NOT NULL
  AND subject_id = 'subject-sgc'
  AND comision_id = '4K7'
  AND day = 'Tuesday'
  AND start_time = '16:15'
  AND end_time = '18:30'
  AND section = 'Electivas';

-- 4. Merge pass 2 (AFTER time fixes): same statement catches legacy rows that
-- already carried the corrected times. Then delete legacy rows ONLY for
-- subjects that have comisión coverage (safe whether or not the seed ran).
UPDATE public.schedules AS s
SET professor_id = l.professor_id,
    room_id = l.room_id
FROM public.schedules AS l
WHERE l.comision_id IS NULL
  AND s.comision_id IS NOT NULL
  AND l.subject_id = s.subject_id
  AND l.day = s.day
  AND l.start_time = s.start_time
  AND (s.professor_id IS NULL OR s.room_id IS NULL);

-- 5. Delete legacy rows ONLY for subjects that have comisión coverage (safe whether or not the seed ran)
DELETE FROM public.schedules
WHERE comision_id IS NULL
  AND subject_id IN (SELECT DISTINCT subject_id FROM public.schedules WHERE comision_id IS NOT NULL);
