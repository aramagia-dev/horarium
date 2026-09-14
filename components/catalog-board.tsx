"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { dayLabel, type CatalogProfessor, type CatalogRoom, type Day, type ScheduleEntry, type Subject } from "@/lib/schedule-data";
import { catalogCardHover, hoverTransition, pageVariants, staggerContainer, staggerItem, useReducedMotion, withReducedMotion } from "@/lib/motion";
import { useSchedule } from "@/lib/schedule-context";
import { useAuth } from "@/lib/auth-context";
import { deriveAvailableComisiones, findEnrollmentOverlaps, getSubjectYears, sortSubjectsForPicking } from "@/lib/enrollments";

type CatalogKind = "subjects" | "professors" | "rooms";

export function CatalogBoard({ schedule, subjects = [], professors = [], rooms = [], kind, onSelectSubject }: { schedule: ScheduleEntry[]; subjects?: Subject[]; professors?: CatalogProfessor[]; rooms?: CatalogRoom[]; kind: CatalogKind; onSelectSubject: (entry: ScheduleEntry) => void }) {
  const title = kind === "subjects" ? "Materias" : kind === "professors" ? "Profesores" : "Aulas";
  const description = kind === "subjects" ? "Catálogo de materias y sus categorías." : kind === "professors" ? "Docentes y clases asociadas en tu semana." : "Aulas asignadas a cada clase.";
  const groups = kind === "subjects" ? subjects.map((subject) => ({ label: subject.code, title: subject.name, items: schedule.filter((entry) => entry.subjectId === subject.id), key: subject.id })) : kind === "professors" ? professors.map((professor) => ({ label: professor.display_name, title: professor.display_name, items: schedule.filter((entry) => entry.professor === professor.display_name), key: professor.id })) : rooms.map((room) => ({ label: room.name, title: room.name, items: schedule.filter((entry) => entry.room === room.name), key: room.id }));
  const visibleGroups = groups.filter((g) => g.items.length > 0);
  const reduced = useReducedMotion();
  const { publicData, enrollments, saveEnrollment, removeEnrollment } = useSchedule();
  const { userId } = useAuth();
  const availableForEditor = useMemo(() => deriveAvailableComisiones(publicData?.schedule ?? []), [publicData]);
  const subjectYearsForEditor = useMemo(() => getSubjectYears(availableForEditor), [availableForEditor]);
  const [selectedYearEditor, setSelectedYearEditor] = useState<"all" | "3" | "4">("all");
  // Cursando (enrolled only, default) vs Todas — restored enrolled-only default
  const [editorFilter, setEditorFilter] = useState<"cursando" | "todas">("cursando");
  // Single-expand accordion: the expanded row shows the subject's sessions,
  // absorbing the old bottom catalog grid into the same list.
  const [expandedSubjectId, setExpandedSubjectId] = useState<string | null>(null);
  // blocked comision changes: error only, no force — overlaps are never saved
  const [changeError, setChangeError] = useState<{ subjectId: string; comisionId: string; lines: string[] } | null>(null);
  const subjectsForEditor = useMemo(() => {
    const filtered = subjects.filter((s) => availableForEditor.has(s.id));
    const byYear =
      selectedYearEditor === "all"
        ? filtered
        : filtered.filter((s) => {
            const years = subjectYearsForEditor.get(s.id);
            if (!years || years.length === 0) return false;
            return years.includes(selectedYearEditor);
          });
    const schedule = publicData?.schedule ?? [];
    return sortSubjectsForPicking(byYear, availableForEditor, schedule as unknown as Array<{ subjectId: string; section: string }>);
  }, [subjects, availableForEditor, subjectYearsForEditor, selectedYearEditor, publicData]);

  // pre-existing overlaps (e.g. forced earlier) are informational; new changes block
  const enrollmentOverlaps = useMemo(() => {
    if (enrollments.size < 2) return [];
    return findEnrollmentOverlaps(publicData?.schedule ?? [], enrollments);
  }, [enrollments, publicData]);
  const editorCodeOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of subjects) map.set(s.id, s.code);
    return map;
  }, [subjects]);

  // Enrolled-only default: "Cursando" hides the rest to reduce clutter.
  const editorSubjects = useMemo(
    () => (editorFilter === "cursando" ? subjectsForEditor.filter((s) => enrollments.has(s.id)) : subjectsForEditor),
    [subjectsForEditor, editorFilter, enrollments],
  );

  // Sessions shown inside an expanded row: the enrolled comision when there
  // is one, legacy comision-less rows always, everything when not enrolled.
  function sessionsForSubject(subjectId: string): ScheduleEntry[] {
    const full = (publicData?.schedule ?? []) as ScheduleEntry[];
    const enrolled = enrollments.get(subjectId);
    return full.filter(
      (entry) => entry.subjectId === subjectId && (!enrolled || entry.comisionId === enrolled || !entry.comisionId),
    );
  }

  function describeChangeConflicts(subjectId: string, comisionId: string): string[] {
    const hypo = new Map(enrollments);
    hypo.set(subjectId, comisionId);
    const sched = publicData?.schedule ?? [];
    return findEnrollmentOverlaps(sched, hypo)
      .filter((o) => o.a.subjectId === subjectId || o.b.subjectId === subjectId)
      .map((o) => {
        const other = o.a.subjectId === subjectId ? o.b : o.a;
        const mine = o.a.subjectId === subjectId ? o.a : o.b;
        const otherCode = editorCodeOf.get(other.subjectId) ?? other.subjectId;
        return `${dayLabel(mine.day as Day)} ${mine.start}–${mine.end} choca con ${otherCode} (${other.comisionId}) ${other.start}–${other.end}`;
      });
  }

  function handleEditorSelect(subjectId: string, value: string) {
    if (!userId) return;
    if (value === "__no__") {
      setChangeError(null);
      void removeEnrollment(subjectId);
      return;
    }
    if (!value || value === enrollments.get(subjectId)) {
      if (value === enrollments.get(subjectId)) setChangeError(null);
      return;
    }
    const lines = describeChangeConflicts(subjectId, value);
    if (lines.length > 0) {
      // hard block: the select stays on the enrolled value
      setChangeError({ subjectId, comisionId: value, lines });
      return;
    }
    setChangeError(null);
    void saveEnrollment(subjectId, value);
  }

  const LIVE_NOTES_ENABLED = process.env.NEXT_PUBLIC_LIVE_NOTES_ENABLED !== "false";

  return (
    <section aria-label={title} className="mx-auto w-full max-w-5xl min-w-0 max-w-full overflow-x-hidden px-4 sm:px-0">
      <motion.div variants={withReducedMotion(pageVariants, reduced)} initial="initial" animate="animate" className="mb-8">
        <h1 className="text-[22px] font-bold tracking-[-0.03em] text-[var(--ink)]">{title}</h1>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{description}</p>
      </motion.div>
      {kind === "subjects" ? (
        <div className="mb-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--ink)]">Mis materias</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {userId ? "Seleccioná tu comisión por materia. Si choca con tu semana, se bloquea." : "Inicia sesión para seleccionar tus comisiones."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div role="group" aria-label="Filtro de materias" className="flex rounded-full border border-[var(--line)] p-0.5 text-xs font-semibold">
                {(["cursando", "todas"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setEditorFilter(f)}
                    aria-pressed={editorFilter === f}
                    className={`rounded-full px-3 py-1 transition ${editorFilter === f ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}
                  >
                    {f === "cursando" ? `Cursando${enrollments.size > 0 ? ` (${enrollments.size})` : ""}` : "Todas"}
                  </button>
                ))}
              </div>
              <label className="text-xs font-semibold text-[var(--muted)]">
                Año
                <select
                  value={selectedYearEditor}
                  onChange={(e) => setSelectedYearEditor(e.target.value as "all" | "3" | "4")}
                  className="ml-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--ink)]"
                  aria-label="Año"
                >
                  <option value="all">Todas</option>
                  <option value="3">3er año</option>
                  <option value="4">4to año</option>
                </select>
              </label>
            </div>
          </div>
          {changeError ? (
            <div role="alert" className="mt-4 rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2.5 text-xs leading-5 text-red-800 dark:text-red-200">
              <p className="font-semibold">
                No se puede cambiar a {editorCodeOf.get(changeError.subjectId)} ({changeError.comisionId}): se superpone con tu semana.
              </p>
              <ul className="mt-1 list-disc pl-4">
                {changeError.lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setChangeError(null)}
                className="mt-2 rounded-full px-3.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)]"
              >
                Entendido
              </button>
            </div>
          ) : enrollmentOverlaps.length > 0 ? (
            <div role="alert" className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs leading-5 text-amber-800 dark:text-amber-200">
              <p className="font-semibold">Estas comisiones se superponen en tu semana:</p>
              <ul className="mt-1 list-disc pl-4">
                {enrollmentOverlaps.map((o, i) => (
                  <li key={`${o.day}-${i}`}>
                    {editorCodeOf.get(o.a.subjectId) ?? o.a.subjectId} ({o.a.comisionId}) {dayLabel(o.a.day as Day)} {o.a.start}–{o.a.end} choca con{" "}
                    {editorCodeOf.get(o.b.subjectId) ?? o.b.subjectId} ({o.b.comisionId}) {o.b.start}–{o.b.end}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {editorFilter === "cursando" && editorSubjects.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-[var(--line)] px-4 py-6 text-center">
              <p className="text-xs text-[var(--muted)]">
                {userId
                  ? "No estás cursando ninguna materia todavía."
                  : "Iniciá sesión para elegir tus comisiones."}
              </p>
              {userId && subjectsForEditor.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setEditorFilter("todas")}
                  className="mt-2 rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                >
                  Ver todas y elegir
                </button>
              ) : null}
            </div>
          ) : subjectsForEditor.length === 0 ? (
            <p className="mt-3 text-xs text-[var(--muted)]">{userId ? "No hay comisiones configuradas para estas materias." : "Inicia sesión para ver tus materias."}</p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--line)] rounded-xl border border-[var(--line)]">
              {editorSubjects.map((subject) => {
                const opts = availableForEditor.get(subject.id) ?? [];
                const selected = enrollments.get(subject.id) ?? "";
                const expanded = expandedSubjectId === subject.id;
                const sessions = expanded ? sessionsForSubject(subject.id) : [];
                return (
                  <li key={subject.id} className="bg-[var(--soft)]/20">
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => setExpandedSubjectId(expanded ? null : subject.id)}
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "Ocultar" : "Ver"} horarios de ${subject.code}`}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span aria-hidden="true" className="shrink-0 text-[10px] text-[var(--muted)]">{expanded ? "▾" : "▸"}</span>
                        <span className="shrink-0 text-xs font-bold text-[var(--ink)]">{subject.code}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-[var(--muted)]">{subject.name}</span>
                        {selected ? (
                          <span className="shrink-0 rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[11px] font-bold text-[var(--accent)]">{selected}</span>
                        ) : null}
                      </button>
                      <select
                        value={selected}
                        onChange={(e) => handleEditorSelect(subject.id, e.target.value)}
                        disabled={!userId}
                        aria-label={`Comisión de ${subject.code}`}
                        className="w-28 shrink-0 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-1.5 py-1.5 text-xs text-[var(--ink)] disabled:opacity-50 sm:w-32"
                      >
                        <option value="">{userId ? "Seleccionar" : "Inicia sesión"}</option>
                        <option value="__no__">No la curso</option>
                        {opts.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    {expanded ? (
                      <div className="border-t border-[var(--line)] px-3 py-2">
                        {sessions.length === 0 ? (
                          <p className="py-1 text-xs text-[var(--muted)]">Sin horarios cargados.</p>
                        ) : (
                          <ul className="divide-y divide-[var(--line)]/60">
                            {sessions.map((entry) => (
                              <li key={entry.id}>
                                <button
                                  type="button"
                                  onClick={() => onSelectSubject(entry)}
                                  className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-[var(--soft)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                                >
                                  <span className="min-w-0 text-xs text-[var(--ink)]">
                                    {dayLabel(entry.day)} · {entry.start}–{entry.end} · {entry.section}
                                    {entry.comisionId ? ` · ${entry.comisionId}` : ""}
                                    <span className="block truncate text-[11px] text-[var(--muted)]">{entry.professor} · {entry.room}</span>
                                  </span>
                                  <span className="shrink-0 text-[11px] font-semibold text-[var(--accent)]">Abrir</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        {LIVE_NOTES_ENABLED && sessions[0] ? (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectSubject(sessions[0]!);
                              window.setTimeout(() => {
                                document.getElementById("live-notes-cta")?.scrollIntoView({ behavior: "smooth", block: "center" });
                                document.getElementById("live-notes-cta")?.focus();
                              }, 250);
                            }}
                            aria-label={`Apuntes en vivo para ${subject.name}`}
                            className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/15 focus-visible:outline-2 focus-visible:outline-amber-500"
                          >
                            ↗ Apuntes en vivo
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
      {kind !== "subjects" ? (
        visibleGroups.length === 0 ? (
        <motion.div variants={withReducedMotion(pageVariants, reduced)} initial="initial" animate="animate" className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-12 text-center">
          <p className="text-sm text-[var(--muted)]">{kind === "rooms" ? "No hay aulas con clases asignadas esta semana." : kind === "professors" ? "No hay docentes con clases asignadas esta semana." : "No hay materias para mostrar."}</p>
        </motion.div>
      ) : (
        <motion.div variants={withReducedMotion(staggerContainer, reduced)} initial="hidden" animate="visible" className="grid w-full max-w-full min-w-0 gap-5 overflow-hidden sm:grid-cols-2">
          {visibleGroups.map((group) => (
            <motion.article
              key={group.key}
              variants={withReducedMotion(staggerItem, reduced)}
              whileHover={reduced ? undefined : catalogCardHover}
              transition={hoverTransition}
              className="catalog-card w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"
            >
              <p className="text-xs font-bold tracking-[0.12em] text-[var(--accent)] uppercase">{group.label}</p>
              <ul className="mt-3 space-y-2">
                {group.items.map((entry) => (
                  <li key={entry.id}>
                    <button type="button" onClick={() => onSelectSubject(entry)} className="w-full rounded-lg px-2 py-2 text-left transition hover:bg-[var(--soft)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
                      <span className="block break-words text-sm font-semibold text-[var(--ink)]">{entry.subject}</span>
                      <span className="block text-xs text-[var(--muted)]">{dayLabel(entry.day)} · {entry.start}–{entry.end} · {entry.section}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </motion.article>
          ))}
        </motion.div>
        )
      ) : null}
    </section>
  );
}
