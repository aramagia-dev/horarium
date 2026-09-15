-- Comisiones fixes — idempotent, safe in any order (safe to re-run and safe whether seed ran or not).
-- Each statement is guarded so re-runs are no-ops.

-- 1. Subject survivor resolution (moves only — time fixes come in section 3,
-- AFTER merge pass 1, so professor/room merging still sees the old times).
-- The seed may have created subject-ham rows while a legacy row with the
-- definitive name already exists (subjects_name_key rejects a rename). Resolve
-- ONE surviving id: prefer the legacy row with the definitive name, otherwise
-- rename the seed row. Seeded sessions + enrollments move to the survivor; the
-- redundant seed row is deleted (kept if notes still reference it — harmless,
-- it ends up session-less).
DO $$
DECLARE
  survivor text;
BEGIN
  -- HAM → 'Algoritmos Genéticos de Optimización Heurística'
  SELECT id INTO survivor FROM public.subjects
  WHERE name = 'Algoritmos Genéticos de Optimización Heurística' AND id <> 'subject-ham' LIMIT 1;
  IF survivor IS NULL THEN
    UPDATE public.subjects SET name = 'Algoritmos Genéticos de Optimización Heurística' WHERE id = 'subject-ham';
    survivor := 'subject-ham';
  ELSE
    DELETE FROM public.user_enrollments a USING public.user_enrollments b
    WHERE a.subject_id = 'subject-ham' AND b.subject_id = survivor AND a.user_id = b.user_id;
    UPDATE public.user_enrollments SET subject_id = survivor WHERE subject_id = 'subject-ham';
    DELETE FROM public.schedules a USING public.schedules b
    WHERE a.subject_id = 'subject-ham' AND a.comision_id IS NOT NULL
      AND b.subject_id = survivor AND b.comision_id IS NOT NULL
      AND a.day = b.day AND a.start_time = b.start_time AND a.section = b.section
      AND a.comision_id = b.comision_id;
    UPDATE public.schedules SET subject_id = survivor WHERE subject_id = 'subject-ham';
    BEGIN
      DELETE FROM public.subjects WHERE id = 'subject-ham';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;

-- SGC is NOT auto-merged: another subject (IyCS) may legitimately carry a similar
-- name, so a collision here needs a human decision. Rename only when free;
-- otherwise NOTICE + keep subject-sgc rows untouched (time fix still applies).
DO $$
BEGIN
  BEGIN
    UPDATE public.subjects
    SET name = 'Ingeniería y Calidad de Software'
    WHERE id = 'subject-sgc'
      AND NOT EXISTS (
        SELECT 1 FROM public.subjects
        WHERE name = 'Ingeniería y Calidad de Software' AND id <> 'subject-sgc'
      );
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'subject-sgc rename skipped: name taken by another subject — resolve manually in Supabase (subjects table)';
  END;
END $$;

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
-- HAM resolves its survivor by the definitive name (exactly one row carries it
-- after section 1, whichever id won), so this works whether the seed ran before,
-- after, or never.

-- HAM/4K6/Thursday 13:15-16:15 → 13:30-16:30
DO $$
DECLARE
  survivor text;
BEGIN
  SELECT id INTO survivor FROM public.subjects
  WHERE name = 'Algoritmos Genéticos de Optimización Heurística' LIMIT 1;
  IF survivor IS NOT NULL THEN
    UPDATE public.schedules
    SET start_time = '13:30', end_time = '16:30'
    WHERE comision_id IS NOT NULL
      AND subject_id = survivor
      AND comision_id = '4K6'
      AND day = 'Thursday'
      AND start_time = '13:15'
      AND section = 'Electivas';
  END IF;
END $$;

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
