"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useSchedule } from "@/lib/schedule-context";
import {
  deriveAvailableComisiones,
  getOnboardingPreselections,
  isOnboardingDismissed,
  setOnboardingDismissed,
  setSavedOnboarding,
  shouldShowOnboarding,
  sortSubjectsForPicking,
} from "@/lib/enrollments";

export function EnrollmentOnboarding() {
  const { userId } = useAuth();
  const { publicData, enrollments, saveEnrollment } = useSchedule();

  const available = useMemo(() => deriveAvailableComisiones(publicData?.schedule ?? []), [publicData]);

  // only subjects that have at least one comision offering, electives last
  const subjectsWithComisiones = useMemo(() => {
    const subs = publicData?.subjects ?? [];
    const filtered = subs.filter((s) => available.has(s.id));
    return sortSubjectsForPicking(filtered, available);
  }, [publicData, available]);

  const preselected = useMemo(() => getOnboardingPreselections(available), [available]);

  const [selections, setSelections] = useState<Map<string, string>>(() => new Map(preselected));
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);

  // sync preselections when available changes (first load)
  useEffect(() => {
    setSelections((prev) => {
      if (prev.size > 0) return prev;
      return new Map(preselected);
    });
  }, [preselected]);

  useEffect(() => {
    if (!userId) {
      setVisible(false);
      return;
    }
    const isDismissed = isOnboardingDismissed(userId);
    const shouldShow = shouldShowOnboarding(enrollments, isDismissed, userId) && subjectsWithComisiones.length > 0;
    setVisible(shouldShow);
  }, [userId, enrollments, subjectsWithComisiones.length]);

  // allow external reopen (catalog-board can dispatch event)
  useEffect(() => {
    const handler = () => {
      if (!userId) return;
      setOnboardingDismissed(userId, false);
      setVisible(shouldShowOnboarding(enrollments, false, userId) && subjectsWithComisiones.length > 0);
    };
    window.addEventListener("horarium:reopen-onboarding", handler as EventListener);
    return () => window.removeEventListener("horarium:reopen-onboarding", handler as EventListener);
  }, [userId, enrollments, subjectsWithComisiones.length]);

  if (!visible || !userId) return null;
  if (subjectsWithComisiones.length === 0) return null;

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      for (const [subjectId, comisionId] of selections) {
        if (!comisionId || comisionId === "__no__") continue;
        await saveEnrollment(subjectId, comisionId);
      }
      setSavedOnboarding(userId);
      setOnboardingDismissed(userId, true);
      try {
        window.dispatchEvent(new CustomEvent("horarium:saved-onboarding", { detail: { userId } }));
      } catch {
        // ignore
      }
      setVisible(false);
    } finally {
      setSaving(false);
    }
  };

  const handleLater = () => {
    setOnboardingDismissed(userId, true);
    setVisible(false);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-xl rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-xl">
        <h2 className="text-base font-semibold text-[var(--ink)]">Elige tus comisiones</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Selecciona tu comisión para cada materia. Puedes cambiarlo luego en Mis materias.</p>
        <p className="mt-2 text-xs text-[var(--muted)]">Las materias sin comisión no aparecen en tu calendario.</p>

        <div className="mt-4 max-h-[45vh] space-y-3 overflow-auto pr-1">
          {subjectsWithComisiones.map((subject) => {
            const opts = available.get(subject.id) ?? [];
            const selected = selections.get(subject.id) ?? "";
            return (
              <div key={subject.id} className="flex flex-col gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--soft)]/30 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--ink)]">{subject.code}</p>
                  <p className="truncate text-xs text-[var(--muted)]">{subject.name}</p>
                </div>
                <select
                  value={selected}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelections((prev) => {
                      const next = new Map(prev);
                      if (val === "") next.delete(subject.id);
                      else next.set(subject.id, val);
                      return next;
                    });
                  }}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--ink)] sm:w-40"
                  aria-label={`Comisión de ${subject.code}`}
                >
                  <option value="">Seleccionar</option>
                  <option value="__no__">No la curso</option>
                  {opts.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleLater}
            disabled={saving}
            className="rounded-full px-4 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-40"
          >
            Elegir después
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
