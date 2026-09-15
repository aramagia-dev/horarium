import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSchedule } from "@/lib/schedule-context";
import { findSimilarCatalogNames, normalizeCatalogName } from "@/lib/session-catalog";
import type { ScheduleSession } from "@/lib/schedule-data";

type Professor = { id: string; display_name: string };
type Room = { id: string; name: string };

const inputCls =
  "mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--ink)]";

/**
 * Community completion of session data (professor / room / section) on a
 * DB-backed session. Rendered only for logged-in users on real schedule
 * rows; the SQL trigger guarantees nothing else on the row can change.
 */
export function SessionAssignmentEditor({ session }: { session: ScheduleSession }) {
  const { publicData, refresh } = useSchedule();
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [professorId, setProfessorId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [open, setOpen] = useState(false);
  const [newProfOpen, setNewProfOpen] = useState(false);
  const [newRoomOpen, setNewRoomOpen] = useState(false);
  const [newProf, setNewProf] = useState("");
  const [newRoom, setNewRoom] = useState("");
  const [section, setSection] = useState(session.section === "Sin asignar" ? "" : session.section);
  const [confirmedProf, setConfirmedProf] = useState("");
  const [confirmedRoom, setConfirmedRoom] = useState("");
  const [profWarning, setProfWarning] = useState<string[] | null>(null);
  const [roomWarning, setRoomWarning] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const [p, r] = await Promise.all([
        supabase!.from("professors").select("id, display_name").order("display_name"),
        supabase!.from("rooms").select("id, name").order("name"),
      ]);
      if (cancelled) return;
      const profs = (p.data ?? []) as Professor[];
      const rms = (r.data ?? []) as Room[];
      setProfessors(profs);
      setRooms(rms);
      setProfessorId(profs.find((x) => x.display_name === session.professor)?.id ?? "");
      setRoomId(rms.find((x) => x.name === session.room)?.id ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, session.id, session.professor, session.room]);

  function explainError(error: { code?: string; message: string }): string {
    if (error.code === "42501") return "No tenés permiso para guardar. Probá cerrar sesión y entrar de nuevo.";
    if (error.code === "23505") return "Ya existe un registro igual (misma sesión o mismo nombre). Revisá los datos.";
    if (error.message.includes("Solo el administrador")) return error.message;
    return `No se pudo guardar. ${error.message}`;
  }

  // Existing section labels on this subject, as typing suggestions.
  const sectionSuggestions = (() => {
    const seen = new Set<string>();
    for (const entry of publicData?.schedule ?? []) {
      if (entry.subjectId === session.subjectId && entry.section && entry.section !== "Sin asignar") seen.add(entry.section);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  })();

  async function resolveProfessorId(): Promise<{ id: string | null; blocked: boolean }> {
    const typed = newProfOpen ? newProf.trim() : "";
    if (!typed) return { id: professorId || null, blocked: false };
    const normalized = normalizeCatalogName(typed);
    const exact = professors.find((x) => normalizeCatalogName(x.display_name) === normalized);
    if (exact) return { id: exact.id, blocked: false };
    const similar = findSimilarCatalogNames(
      professors.map((x) => x.display_name),
      typed,
    );
    if (similar.length > 0 && confirmedProf !== typed) {
      setProfWarning(similar);
      return { id: null, blocked: true };
    }
    setProfWarning(null);
    const { data, error } = await supabase!
      .from("professors")
      .insert({ display_name: typed, normalized_name: normalized })
      .select("id")
      .single();
    if (error) {
      // Lost race with someone creating the same name: reuse it.
      if (error.code === "23505") {
        const again = await supabase!.from("professors").select("id, display_name").order("display_name");
        const rows = (again.data ?? []) as Professor[];
        setProfessors(rows);
        const winner = rows.find((x) => normalizeCatalogName(x.display_name) === normalized);
        if (winner) return { id: winner.id, blocked: false };
      }
      setMessage(explainError(error));
      return { id: null, blocked: true };
    }
    const created = (data as { id: string }).id;
    setProfessors((prev) => [...prev, { id: created, display_name: typed }].sort((a, b) => a.display_name.localeCompare(b.display_name)));
    return { id: created, blocked: false };
  }

  async function resolveRoomId(): Promise<{ id: string | null; blocked: boolean }> {
    const typed = newRoomOpen ? newRoom.trim() : "";
    if (!typed) return { id: roomId || null, blocked: false };
    const normalized = normalizeCatalogName(typed);
    const exact = rooms.find((x) => normalizeCatalogName(x.name) === normalized);
    if (exact) return { id: exact.id, blocked: false };
    const similar = findSimilarCatalogNames(
      rooms.map((x) => x.name),
      typed,
    );
    if (similar.length > 0 && confirmedRoom !== typed) {
      setRoomWarning(similar);
      return { id: null, blocked: true };
    }
    setRoomWarning(null);
    const { data, error } = await supabase!.from("rooms").insert({ name: typed }).select("id").single();
    if (error) {
      if (error.code === "23505") {
        const again = await supabase!.from("rooms").select("id, name").order("name");
        const rows = (again.data ?? []) as Room[];
        setRooms(rows);
        const winner = rows.find((x) => normalizeCatalogName(x.name) === normalized);
        if (winner) return { id: winner.id, blocked: false };
      }
      setMessage(explainError(error));
      return { id: null, blocked: true };
    }
    const created = (data as { id: string }).id;
    setRooms((prev) => [...prev, { id: created, name: typed }].sort((a, b) => a.name.localeCompare(b.name)));
    return { id: created, blocked: false };
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setMessage("");
    const prof = await resolveProfessorId();
    const room = prof.blocked ? { id: null as string | null, blocked: true } : await resolveRoomId();
    if (prof.blocked || room.blocked) {
      setSaving(false);
      return;
    }
    const { error } = await supabase!
      .from("schedules")
      .update({
        professor_id: prof.id,
        room_id: room.id,
        ...(section.trim() && section.trim() !== session.section ? { section: section.trim() } : {}),
      })
      .eq("id", session.id);
    setSaving(false);
    if (error) {
      setMessage(explainError(error));
      return;
    }
    setNewProfOpen(false);
    setNewRoomOpen(false);
    setNewProf("");
    setNewRoom("");
    setConfirmedProf("");
    setConfirmedRoom("");
    setMessage("Guardado.");
    refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setMessage("");
        }}
        className="mt-2 text-xs font-semibold text-[var(--accent)] hover:underline"
      >
        Completar sesión
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-[var(--line)] p-2.5">
      <label className="text-xs font-semibold text-[var(--muted)]">
        Sección
        <input
          value={section}
          onChange={(e) => setSection(e.target.value)}
          list={`section-suggestions-${session.id}`}
          placeholder={session.section}
          maxLength={60}
          aria-label="Sección de la sesión"
          className={inputCls}
        />
        <datalist id={`section-suggestions-${session.id}`}>
          {sectionSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-semibold text-[var(--muted)]">
          Profesor
          <select value={professorId} onChange={(e) => setProfessorId(e.target.value)} disabled={newProfOpen} className={`${inputCls} disabled:opacity-50`} aria-label="Profesor de la sesión">
            <option value="">Sin asignar</option>
            {professors.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setNewProfOpen((v) => !v)} className="mt-1 text-[11px] font-semibold text-[var(--accent)] hover:underline">
            {newProfOpen ? "Elegir de la lista" : "＋ Nuevo profesor"}
          </button>
          {newProfOpen ? (
            <input value={newProf} onChange={(e) => setNewProf(e.target.value)} placeholder="Nombre del profesor" aria-label="Nombre del profesor nuevo" className={inputCls} />
          ) : null}
          {profWarning ? (
            <div role="alert" className="mt-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-4 text-amber-800 dark:text-amber-200">
              <p className="font-semibold">¿Quisiste decir {profWarning.map((w) => `«${w}»`).join(" o ")}?</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {profWarning.map((w) => {
                  const hit = professors.find((x) => x.display_name === w);
                  return hit ? (
                    <button
                      key={w}
                      type="button"
                      onClick={() => {
                        setProfessorId(hit.id);
                        setNewProfOpen(false);
                        setNewProf("");
                        setProfWarning(null);
                      }}
                      className="rounded-full bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90"
                    >
                      Usar {w}
                    </button>
                  ) : null;
                })}
                <button
                  type="button"
                  onClick={() => {
                    setConfirmedProf(newProf.trim());
                    setProfWarning(null);
                  }}
                  className="rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--muted)] hover:text-[var(--ink)]"
                >
                  Es otro, crear igual
                </button>
              </div>
            </div>
          ) : null}
        </label>
        <label className="text-xs font-semibold text-[var(--muted)]">
          Aula
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)} disabled={newRoomOpen} className={`${inputCls} disabled:opacity-50`} aria-label="Aula de la sesión">
            <option value="">Sin asignar</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setNewRoomOpen((v) => !v)} className="mt-1 text-[11px] font-semibold text-[var(--accent)] hover:underline">
            {newRoomOpen ? "Elegir de la lista" : "＋ Nueva aula"}
          </button>
          {newRoomOpen ? (
            <input value={newRoom} onChange={(e) => setNewRoom(e.target.value)} placeholder="Nombre del aula" aria-label="Nombre del aula nueva" className={inputCls} />
          ) : null}
          {roomWarning ? (
            <div role="alert" className="mt-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-4 text-amber-800 dark:text-amber-200">
              <p className="font-semibold">¿Quisiste decir {roomWarning.map((w) => `«${w}»`).join(" o ")}?</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {roomWarning.map((w) => {
                  const hit = rooms.find((x) => x.name === w);
                  return hit ? (
                    <button
                      key={w}
                      type="button"
                      onClick={() => {
                        setRoomId(hit.id);
                        setNewRoomOpen(false);
                        setNewRoom("");
                        setRoomWarning(null);
                      }}
                      className="rounded-full bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90"
                    >
                      Usar {w}
                    </button>
                  ) : null;
                })}
                <button
                  type="button"
                  onClick={() => {
                    setConfirmedRoom(newRoom.trim());
                    setRoomWarning(null);
                  }}
                  className="rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--muted)] hover:text-[var(--ink)]"
                >
                  Es otra, crear igual
                </button>
              </div>
            </div>
          ) : null}
        </label>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)]">
          Cerrar
        </button>
        {message ? <p className="text-xs text-[var(--muted)]">{message}</p> : null}
      </div>
    </div>
  );
}
