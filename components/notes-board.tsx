"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SubjectModal } from "@/components/subject-modal";
import { notesChangedEvent, readLocalNotes } from "@/lib/notes-storage";
import type { ScheduleEntry } from "@/lib/schedule-data";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cardHover, hoverTransition, staggerContainer, staggerItem, useReducedMotion } from "@/lib/motion";

type NotesFocus = { subjectId: string | null; noteId: string | null; commentId: string | null } | null;

export function NotesBoard({ schedule, focus }: { schedule: ScheduleEntry[]; focus?: NotesFocus }) {
  const [query, setQuery] = useState("");
  const [selectedCode, setSelectedCode] = useState("");
  const { userId } = useAuth();
  const reduced = useReducedMotion();
  const authResolved = true;
  const [remoteCounts, setRemoteCounts] = useState<Record<string, number>>({});
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countsVersion, setCountsVersion] = useState(0);
  const subjectGroups = Array.from(new Map(schedule.map((entry) => [entry.code, entry])).values()).map((subject) => ({
    subject,
    entries: schedule.filter((entry) => entry.code === subject.code),
  }));

  useEffect(() => {
    setRemoteCounts({});
    setError("");
    setLoading(Boolean(supabase && userId));
  }, [userId]);

  useEffect(() => {
    if (!authResolved || !supabase || !userId) {
      if (!userId) setLoading(false);
      return;
    }
    let active = true;
    const subjectIds = Array.from(new Set(schedule.map((entry) => entry.subjectId)));
    if (subjectIds.length === 0) return () => { active = false; };
    void supabase.from("notes").select("subject_id").in("subject_id", subjectIds).then(({ data, error: queryError }) => {
      if (!active) return;
      if (queryError) { setError("No se pudieron cargar las notas compartidas."); setRemoteCounts({}); }
      else { setError(""); const next: Record<string, number> = {}; for (const note of data ?? []) next[note.subject_id] = (next[note.subject_id] ?? 0) + 1; setRemoteCounts(next); }
      setLoading(false);
    });
    return () => { active = false; };
  }, [authResolved, countsVersion, schedule, userId]);

  useEffect(() => {
    const refresh = () => setCountsVersion((version) => version + 1);
    window.addEventListener(notesChangedEvent, refresh);
    return () => window.removeEventListener(notesChangedEvent, refresh);
  }, []);

  useEffect(() => {
    if (!focus?.subjectId) return;
    const entry = schedule.find((item) => item.subjectId === focus.subjectId);
    if (entry && entry.code !== selectedCode) setSelectedCode(entry.code);
  }, [focus, schedule, selectedCode]);

  const subjects = subjectGroups.map(({ subject, entries }) => ({
    subject,
    sections: Array.from(new Set(entries.map((entry) => entry.section))),
    count: supabase && userId ? remoteCounts[subject.subjectId] ?? 0 : readLocalNotes(subject.code, entries.map((entry) => entry.id)).length,
  }));
  const filteredSubjects = subjects.filter(({ subject, sections }) => `${subject.subject} ${subject.code} ${sections.join(" ")}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const selectedSubject = subjectGroups.find(({ subject }) => subject.code === selectedCode)?.subject ?? subjectGroups[0]?.subject;
  const selectedSessions = selectedSubject ? schedule.filter((entry) => entry.subjectId === selectedSubject.subjectId) : [];

  return <section aria-label="Notas" className="mx-auto w-full max-w-[1440px]">
    <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div><p className="text-xs font-bold tracking-[0.14em] text-[var(--accent)] uppercase">Espacio de estudio</p><h1 className="mt-1 text-[28px] font-bold tracking-[-0.04em] text-[var(--ink)]">Notas elaboradas</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">Organizá documentos con bloques, fechas, etiquetas y adjuntos. Las notas rápidas siguen disponibles desde Horario.</p></div>
      <motion.label whileFocus={{ scale: 1.01 }} transition={{ duration: 0.15 }} className="block w-full lg:ml-auto lg:w-[360px] lg:max-w-[360px] shrink-0 lg:mr-16 xl:mr-16"><span className="sr-only">Buscar materias</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por materia, código o sección..." aria-label="Buscar materias" className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15" /></motion.label>
    </div>
    {error ? <p role="alert" className="mb-5 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-600">{error}</p> : null}
    {filteredSubjects.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-12 text-center"><h2 className="text-lg font-semibold text-[var(--ink)]">{subjects.length === 0 ? "No hay materias disponibles" : "No encontramos materias"}</h2><p className="mt-2 text-sm text-[var(--muted)]">{subjects.length === 0 ? "El calendario todavía no tiene materias para seleccionar." : "Probá con otro término de búsqueda."}</p></div> : <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      <motion.nav
        aria-label="Materias con notas"
        className="space-y-2"
        variants={reduced ? undefined : staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <p className="px-1 text-xs font-bold tracking-[0.14em] text-[var(--muted)] uppercase">Materias</p>
        {filteredSubjects.map(({ subject, sections, count }) => (
          <motion.button
            key={subject.code}
            type="button"
            onClick={() => setSelectedCode(subject.code)}
            variants={reduced ? undefined : staggerItem}
            whileHover={reduced ? undefined : cardHover}
            whileTap={reduced ? undefined : { scale: 0.99 }}
            transition={hoverTransition}
            className={`notes-subject-card flex w-full items-center justify-between rounded-xl border p-4 text-left ${selectedCode === subject.code ? "border-[var(--accent)] bg-[var(--sidebar-accent)]" : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--accent)]"}`}
          >
            <span className="min-w-0"><span className="block text-[10px] font-bold tracking-[0.12em] text-[var(--accent)] uppercase">{subject.code}</span><strong className="mt-1 block truncate text-sm font-bold text-[var(--ink)]">{subject.subject}</strong><span className="mt-1 block truncate text-xs text-[var(--muted)]">{sections.join(" · ")}</span></span><span className="ml-3 shrink-0 text-xs font-semibold text-[var(--accent)]">{count}</span>
          </motion.button>
        ))}
      </motion.nav>
      {selectedSubject ? <SubjectModal workspace subject={selectedSubject} sessions={selectedSessions} legacyEntryIds={[...selectedSessions.map((entry) => entry.id)]} highlightNoteId={focus?.subjectId === selectedSubject.subjectId ? focus.noteId : null} highlightCommentId={focus?.subjectId === selectedSubject.subjectId ? focus.commentId : null} onClose={() => undefined} /> : null}
    </div>}
  </section>;
}
