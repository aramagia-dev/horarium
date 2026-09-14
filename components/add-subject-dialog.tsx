"use client";

import { useMemo, useState } from "react";
import { dayLabel, type Day, type ScheduleEntry, type Subject } from "@/lib/schedule-data";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import {
  deriveAvailableComisiones,
  findEnrollmentOverlaps,
  getElectiveOnlySubjectIds,
  getSubjectYears,
  sortSubjectsForPicking,
  type EnrollmentMap,
} from "@/lib/enrollments";

type AddSubjectDialogProps = {
  open: boolean;
  onClose: () => void;
  subjects: Subject[];
  schedule: ScheduleEntry[];
  enrollments: EnrollmentMap;
  onAdd: (subjectId: string, comisionId: string) => Promise<void>;
};

/**
 * "Agregar materia" flow: filter by year + kind (obligatoria/electiva),
 * pick a comision, add. Adding is blocked on time conflicts with a clear
 * error, but the user can force it with "Agregar igual".
 */
export function AddSubjectDialog({ open, onClose, subjects, schedule, enrollments, onAdd }: AddSubjectDialogProps) {
  const dialogRef = useDialogA11y(open, onClose);
  const [year, setYear] = useState<"all" | "3" | "4">("all");
  const [kind, setKind] = useState<"all" | "obligatoria" | "electiva">("all");
  const [picks, setPicks] = useState<Map<string, string>>(new Map());
  const [addingId, setAddingId] = useState<string | null>(null);
  const [block, setBlock] = useState<{ subjectId: string; comisionId: string; lines: string[] } | null>(null);
  const [notice, setNotice] = useState("");

  const available = useMemo(() => deriveAvailableComisiones(schedule), [schedule]);
  const subjectYears = useMemo(() => getSubjectYears(available), [available]);
  const electiveIds = useMemo(() => getElectiveOnlySubjectIds(schedule), [schedule]);

  const candidates = useMemo(() => {
    const notEnrolled = subjects.filter((s) => available.has(s.id) && !enrollments.has(s.id));
    const byYear =
      year === "all"
        ? notEnrolled
        : notEnrolled.filter((s) => (subjectYears.get(s.id) ?? []).includes(year));
    const byKind =
      kind === "all" ? byYear : byYear.filter((s) => (kind === "electiva") === electiveIds.has(s.id));
    return sortSubjectsForPicking(byKind, available, schedule);
  }, [subjects, available, enrollments, subjectYears, electiveIds, year, kind, schedule]);

  if (!open) return null;

  function describeConflicts(subjectId: string, comisionId: string): string[] {
    const hypo = new Map(enrollments);
    hypo.set(subjectId, comisionId);
    return findEnrollmentOverlaps(schedule, hypo)
      .filter((o) => o.a.subjectId === subjectId || o.b.subjectId === subjectId)
      .map((o) => {
        const other = o.a.subjectId === subjectId ? o.b : o.a;
        const mine = o.a.subjectId === subjectId ? o.a : o.b;
        const otherCode = subjects.find((s) => s.id === other.subjectId)?.code ?? other.subjectId;
        return `${dayLabel(mine.day as Day)} ${mine.start}–${mine.end} choca con ${otherCode} (${other.comisionId}) ${other.start}–${other.end}`;
      });
  }

  async function handleAdd(subjectId: string, comisionId: string, forced: boolean) {
    if (!comisionId) {
      const code = subjects.find((s) => s.id === subjectId)?.code ?? subjectId;
      setBlock(null);
      setNotice(`Elegí una comisión para ${code} antes de agregarla.`);
      return;
    }
    if (!forced) {
      const lines = describeConflicts(subjectId, comisionId);
      if (lines.length > 0) {
        setNotice("");
        setBlock({ subjectId, comisionId, lines });
        return;
      }
    }
    setBlock(null);
    setNotice("");
    setAddingId(subjectId);
    try {
      await onAdd(subjectId, comisionId);
      setPicks((prev) => {
        const next = new Map(prev);
        next.delete(subjectId);
        return next;
      });
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[1px]">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Agregar materia" className="w-full max-w-xl rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--ink)]">Agregar materia</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Filtrá, elegí la comisión y agregala a las que cursás.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-full px-3 py-1.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="text-xs font-semibold text-[var(--muted)]">
            Año
            <select
              value={year}
              onChange={(e) => setYear(e.target.value as "all" | "3" | "4")}
              className="ml-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-sm text-[var(--ink)]"
              aria-label="Año"
            >
              <option value="all">Todos</option>
              <option value="3">3er año</option>
              <option value="4">4to año</option>
            </select>
          </label>
          <div role="group" aria-label="Tipo de materia" className="flex items-center rounded-lg border border-[var(--line)] p-0.5 text-xs font-semibold">
            {(
              [
                ["all", "Todas"],
                ["obligatoria", "Obligatoria"],
                ["electiva", "Electiva"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setKind(value)}
                aria-pressed={kind === value}
                className={`rounded-md px-2.5 py-1 ${kind === value ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {block ? (
          <div role="alert" className="mt-4 rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2.5 text-xs leading-5 text-red-800 dark:text-red-200">
            <p className="font-semibold">
              No se puede agregar {subjects.find((s) => s.id === block.subjectId)?.code} ({block.comisionId}): se superpone con tu semana.
            </p>
            <ul className="mt-1 list-disc pl-4">
              {block.lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => void handleAdd(block.subjectId, block.comisionId, true)}
                className="rounded-full bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                Agregar igual
              </button>
              <button
                type="button"
                onClick={() => setBlock(null)}
                className="rounded-full px-3.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)]"
              >
                Elegir otra comisión
              </button>
            </div>
          </div>
        ) : null}
        {notice ? <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-300">{notice}</p> : null}

        <div className="mt-4 max-h-[45vh] space-y-3 overflow-auto pr-1">
          {candidates.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">No hay materias para agregar con estos filtros. Ya cursás el resto.</p>
          ) : (
            candidates.map((subject) => {
              const opts = available.get(subject.id) ?? [];
              const picked = picks.get(subject.id) ?? "";
              const years = (subjectYears.get(subject.id) ?? []).map((y) => `${y}°`).join(" · ");
              return (
                <div key={subject.id} className="flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-[var(--soft)]/30 px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--ink)]">{subject.code}</p>
                    <p className="truncate text-xs text-[var(--muted)]">{subject.name}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                      {years} · {electiveIds.has(subject.id) ? "Electiva" : "Obligatoria"} · {opts.join(" / ")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={picked}
                      onChange={(e) =>
                        setPicks((prev) => {
                          const next = new Map(prev);
                          if (!e.target.value) next.delete(subject.id);
                          else next.set(subject.id, e.target.value);
                          return next;
                        })
                      }
                      className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--ink)]"
                      aria-label={`Comisión de ${subject.code}`}
                    >
                      <option value="">Seleccionar comisión</option>
                      {opts.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={addingId === subject.id}
                      onClick={() => void handleAdd(subject.id, picked, false)}
                      className="shrink-0 rounded-full bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                    >
                      {addingId === subject.id ? "Agregando…" : "Agregar"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
