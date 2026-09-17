"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { LEAD_OPTIONS, REMINDER_TYPES, leadsFor } from "@/lib/reminder-prefs";

/**
 * Per-type reminder lead times (days before). Rendered inside the bell panel
 * under PushToggle. Absent row = code defaults; "Restablecer" deletes the row.
 */
export function ReminderSettings() {
  const { userId } = useAuth();
  const [stored, setStored] = useState<Record<string, unknown> | null>(null);
  const [hasRow, setHasRow] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId || !supabase) {
        if (!cancelled) {
          setStored(null);
          setHasRow(false);
          setLoaded(true);
        }
        return;
      }
      try {
        const { data } = await supabase
          .from("reminder_prefs")
          .select("lead_days")
          .eq("user_id", userId)
          .maybeSingle();
        if (cancelled) return;
        const leadDays = (data as { lead_days?: unknown } | null)?.lead_days;
        setStored(leadDays && typeof leadDays === "object" ? (leadDays as Record<string, unknown>) : null);
        setHasRow(!!data);
      } catch {
        // ignore — defaults apply
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function persist(next: Record<string, number[]>) {
    if (!userId || !supabase) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("reminder_prefs")
        .upsert(
          { user_id: userId, lead_days: next, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      if (error) throw error;
      setStored(next);
      setHasRow(true);
    } catch (e) {
      console.warn("[horarium] reminder prefs save failed", e);
    } finally {
      setSaving(false);
    }
  }

  function toggle(type: string, day: number) {
    const current = leadsFor(type, stored);
    const updated = (current.includes(day) ? current.filter((d) => d !== day) : [...current, day]).sort(
      (a, b) => a - b,
    );
    const full: Record<string, number[]> = {};
    for (const t of REMINDER_TYPES) full[t.value] = t.value === type ? updated : leadsFor(t.value, stored);
    setStored(full); // optimistic
    void persist(full);
  }

  async function reset() {
    if (!userId || !supabase) return;
    setSaving(true);
    try {
      await supabase.from("reminder_prefs").delete().eq("user_id", userId);
      setStored(null);
      setHasRow(false);
    } catch (e) {
      console.warn("[horarium] reminder prefs reset failed", e);
    } finally {
      setSaving(false);
    }
  }

  if (!userId) return null;

  return (
    <div className="border-t border-[var(--line)] px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-[var(--ink)]">Recordatorios</p>
          <p className="text-[11px] leading-4 text-[var(--muted)]">Días antes de cada evento, en este dispositivo.</p>
        </div>
        {hasRow ? (
          <button
            type="button"
            onClick={() => void reset()}
            disabled={saving}
            className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-50"
          >
            Restablecer
          </button>
        ) : null}
      </div>
      {!loaded ? (
        <p className="mt-2 text-[11px] text-[var(--muted)]">Cargando…</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {REMINDER_TYPES.map((t) => {
            const active = leadsFor(t.value, stored);
            return (
              <div key={t.value} className="flex items-center justify-between gap-2">
                <span className="w-24 shrink-0 truncate text-[11px] text-[var(--muted)]">{t.label}</span>
                <div className="flex flex-wrap justify-end gap-1">
                  {LEAD_OPTIONS.map((day) => {
                    const on = active.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggle(t.value, day)}
                        disabled={saving}
                        aria-pressed={on}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition disabled:opacity-50 ${
                          on
                            ? "bg-[var(--accent)] text-white"
                            : "bg-[var(--soft)] text-[var(--muted)] hover:text-[var(--ink)]"
                        }`}
                      >
                        {day}d
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {saving ? <p className="mt-1.5 text-[11px] text-[var(--muted)]">Guardando…</p> : null}
    </div>
  );
}
