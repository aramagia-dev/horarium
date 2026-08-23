"use client";

import { useEffect, useState } from "react";
import { SubjectModal } from "@/components/subject-modal";
import { notesChangedEvent, readLocalNotes } from "@/lib/notes-storage";
import type { ScheduleEntry } from "@/lib/schedule-data";
import { supabase } from "@/lib/supabase";

export function NotesBoard({ schedule }: { schedule: ScheduleEntry[] }) {
  const [query, setQuery] = useState("");
  const [selectedCode, setSelectedCode] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [authResolved, setAuthResolved] = useState(!supabase);
  const [remoteCounts, setRemoteCounts] = useState<Record<string, number>>({});
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState("");
  const [countsVersion, setCountsVersion] = useState(0);
  const subjectGroups = Array.from(new Map(schedule.map((entry) => [entry.code, entry])).values()).map((subject) => ({
    subject,
    entries: schedule.filter((entry) => entry.code === subject.code),
  }));

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUserId(data.session?.user?.id ?? null);
      setAuthResolved(true);
      setLoading(Boolean(data.session?.user?.id));
      setRemoteCounts({});
    }).catch(() => { if (active) { setUserId(null); setAuthResolved(true); setLoading(false); } });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) { setUserId(session?.user?.id ?? null); setLoading(Boolean(session?.user?.id)); setError(""); setRemoteCounts({}); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!authResolved || !supabase || !userId) return;
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
      <label className="block w-full lg:ml-auto lg:w-[360px] lg:max-w-[360px] shrink-0"><span className="sr-only">Buscar materias</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por materia, código o sección..." aria-label="Buscar materias" className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]" /></label>
    </div>
    {error ? <p role="alert" className="mb-5 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-600">{error}</p> : null}
    {filteredSubjects.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-12 text-center"><h2 className="text-lg font-semibold text-[var(--ink)]">{subjects.length === 0 ? "No hay materias disponibles" : "No encontramos materias"}</h2><p className="mt-2 text-sm text-[var(--muted)]">{subjects.length === 0 ? "El calendario todavía no tiene materias para seleccionar." : "Probá con otro término de búsqueda."}</p></div> : <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      <nav aria-label="Materias con notas" className="space-y-2"><p className="px-1 text-xs font-bold tracking-[0.14em] text-[var(--muted)] uppercase">Materias</p>{filteredSubjects.map(({ subject, sections, count }) => <button key={subject.code} type="button" onClick={() => setSelectedCode(subject.code)} className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition ${selectedCode === subject.code ? "border-[var(--accent)] bg-[var(--sidebar-accent)]" : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--accent)]"}`}><span className="min-w-0"><span className="block text-[10px] font-bold tracking-[0.12em] text-[var(--accent)] uppercase">{subject.code}</span><strong className="mt-1 block truncate text-sm font-bold text-[var(--ink)]">{subject.subject}</strong><span className="mt-1 block truncate text-xs text-[var(--muted)]">{sections.join(" · ")}</span></span><span className="ml-3 shrink-0 text-xs font-semibold text-[var(--accent)]">{count}</span></button>)}</nav>
      {selectedSubject ? <SubjectModal workspace subject={selectedSubject} sessions={selectedSessions} legacyEntryIds={[...selectedSessions.map((entry) => entry.id)]} onClose={() => undefined} /> : null}
    </div>}
  </section>;
}
