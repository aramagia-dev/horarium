"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { dayLabel, type CatalogProfessor, type CatalogRoom, type ScheduleEntry, type Subject } from "@/lib/schedule-data";
import { catalogCardHover, hoverTransition, pageVariants, staggerContainer, staggerItem, useReducedMotion, withReducedMotion } from "@/lib/motion";
import { useSchedule } from "@/lib/schedule-context";
import { useAuth } from "@/lib/auth-context";
import { deriveAvailableComisiones, getSubjectYears, sortSubjectsForPicking } from "@/lib/enrollments";

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
                {userId ? "Selecciona tu comisión por materia. El calendario se actualiza inmediatamente." : "Inicia sesión para seleccionar tus comisiones."}
              </p>
            </div>
            <div className="flex items-center gap-2">
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
              {userId && subjectsForEditor.length > 0 ? (
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent("horarium:reopen-onboarding"))}
                  className="hidden text-xs font-semibold text-[var(--accent)] hover:underline sm:block"
                  title="Reabrir configuración inicial"
                >
                  Configurar
                </button>
              ) : null}
            </div>
          </div>
          {subjectsForEditor.length === 0 ? (
            <p className="mt-3 text-xs text-[var(--muted)]">No hay comisiones configuradas para estas materias.</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {subjectsForEditor.map((subject) => {
                const opts = availableForEditor.get(subject.id) ?? [];
                const selected = enrollments.get(subject.id) ?? "";
                return (
                  <label key={subject.id} className="flex flex-col gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--soft)]/20 px-3 py-3">
                    <span className="text-xs font-semibold text-[var(--ink)]">{subject.code}</span>
                    <span className="truncate text-[11px] text-[var(--muted)]">{subject.name}</span>
                    <select
                      value={selected}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!userId) return;
                        if (val === "__no__") {
                          void removeEnrollment(subject.id);
                          return;
                        }
                        if (!val) return;
                        void saveEnrollment(subject.id, val);
                      }}
                      disabled={!userId}
                      aria-label={`Comisión de ${subject.code}`}
                      className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--ink)] disabled:opacity-50"
                    >
                      <option value="">{userId ? "Seleccionar" : "Inicia sesión"}</option>
                      <option value="__no__">No la curso</option>
                      {opts.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
      {visibleGroups.length === 0 ? (
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
              {kind === "subjects" && group.items[0] ? (
                <>
                  <motion.button
                    type="button"
                    whileHover={reduced ? undefined : { scale: 1.01 }}
                    whileTap={reduced ? undefined : { scale: 0.99 }}
                    onClick={() => onSelectSubject(group.items[0])}
                    className="mt-3 w-full rounded-xl bg-[var(--background)] p-4 text-left transition hover:border-[var(--accent)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  >
                    <span className="text-[10px] font-bold tracking-[0.12em] text-[var(--muted)] uppercase">{group.items[0].code} · {Array.from(new Set(group.items.map((item) => item.section))).join(" · ")}</span>
                    <strong className="mt-2 block break-words text-sm text-[var(--ink)]">{group.title}</strong>
                    <span className="mt-2 block text-xs text-[var(--muted)]">{group.items.length} sesiones semanales</span>
                  </motion.button>
                  {LIVE_NOTES_ENABLED ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSubject(group.items[0]!);
                        // give the modal a tick to mount, then focus the live-notes CTA
                        window.setTimeout(() => {
                          document.getElementById("live-notes-cta")?.scrollIntoView({ behavior: "smooth", block: "center" });
                          document.getElementById("live-notes-cta")?.focus();
                        }, 250);
                      }}
                      aria-label={`Apuntes en vivo para ${group.title}`}
                      className="mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-500/10 hover:text-amber-800 dark:text-amber-300 dark:hover:bg-amber-500/15 dark:hover:text-amber-200 focus-visible:outline-2 focus-visible:outline-amber-500"
                    >
                      ↗ Apuntes en vivo
                    </button>
                  ) : null}
                </>
              ) : (
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
              )}
            </motion.article>
          ))}
        </motion.div>
      )}
    </section>
  );
}
