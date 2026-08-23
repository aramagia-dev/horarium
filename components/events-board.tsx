"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { eventStatuses, eventTypes, formatEventDate, formatEventMonthShort, isEventOverdue, loadAcademicEvents, saveAcademicEvent, deleteAcademicEvent, type AcademicEvent, type AcademicEventInput, type AcademicEventStatus, type AcademicEventType } from "@/lib/academic-events";
import type { Subject } from "@/lib/schedule-data";
import { supabase, supabaseConfigured } from "@/lib/supabase";

const labels: Record<AcademicEventType | AcademicEventStatus, string> = { parcial: "Parcial", entrega: "Entrega", recuperatorio: "Recuperatorio", exposición: "Exposición", otro: "Otro", pending: "Pendiente", completed: "Completado", cancelled: "Cancelado" };
const emptyForm: AcademicEventInput = { title: "", type: "otro", date: "", time: "", subject_id: null, description: "", status: "pending" };

export function EventsBoard({ events: initialEvents, subjects, isAdmin, userId, sourceError, selectedEventId, onDataChanged }: { events: AcademicEvent[]; subjects: Subject[]; isAdmin: boolean; userId: string | null; sourceError: string; selectedEventId?: string | null; onDataChanged?: () => void }) {
  const [events, setEvents] = useState(initialEvents);
  const [form, setForm] = useState<AcademicEventInput>(emptyForm);
  const [editing, setEditing] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [error, setError] = useState("");
  const selectedEventRef = useRef<HTMLElement | null>(null);
  const canManage = isAdmin || !supabaseConfigured;
  const canCreate = canManage || Boolean(userId);
  const canEdit = (event: AcademicEvent) => canManage || (Boolean(userId) && event.created_by === userId);

  useEffect(() => {
    let active = true;
    const refresh = () => void loadAcademicEvents().then((result) => { if (active) setEvents(result.events); });
    window.addEventListener("horarium:events-changed", refresh);
    return () => { active = false; window.removeEventListener("horarium:events-changed", refresh); };
  }, []);

  const visibleEvents = useMemo(() => events.filter((event) => (typeFilter === "all" || event.type === typeFilter) && (statusFilter === "all" || event.status === statusFilter) && (subjectFilter === "all" || event.subject_id === subjectFilter)).sort((a, b) => `${a.date}${a.time?.slice(0, 5) ?? "99:99"}`.localeCompare(`${b.date}${b.time?.slice(0, 5) ?? "99:99"}`)), [events, statusFilter, subjectFilter, typeFilter]);
  const selectedEvent = selectedEventId ? events.find((event) => event.id === selectedEventId) : undefined;
  const selectedEventVisible = selectedEvent ? visibleEvents.some((event) => event.id === selectedEvent.id) : false;
  useEffect(() => {
    if (selectedEventVisible) selectedEventRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedEventVisible, selectedEventId]);

  function beginEdit(event: AcademicEvent) { setForm({ ...event }); setEditing(true); setError(""); }
  function resetForm() { setForm(emptyForm); setEditing(false); setError(""); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const isCreating = !form.id;
    const result = await saveAcademicEvent(form);
    if (result.error) return setError(result.error);
    resetForm();
    const fresh = await loadAcademicEvents();
    setEvents(fresh.events);
    onDataChanged?.();
    if (isCreating && supabase && userId) {
      try {
        // best-effort: notify all profiles except creator
        const created = fresh.events.find((e) => e.title === form.title && e.date === form.date) ?? fresh.events[0];
        const eventId = created?.id ?? null;
        if (!eventId) return;
        const { data: profiles } = await supabase.from("profiles").select("id");
        const recipients = (profiles ?? []).map((p: { id: string }) => p.id).filter((id: string) => id !== userId);
        if (recipients.length === 0) return;
        const { createNotifications } = await import("@/lib/notifications");
        const subjectCode = form.subject_id ? (subjects.find((s) => s.id === form.subject_id)?.code ?? "") : "";
        const title = "Nuevo evento";
        const body = `${form.title}${subjectCode ? ` · ${subjectCode}` : ""} · ${form.date}${form.time ? ` ${form.time.slice(0, 5)}` : ""}`;
        const chunkSize = 50;
        for (let i = 0; i < recipients.length; i += chunkSize) {
          const chunk = recipients.slice(i, i + chunkSize);
          await createNotifications(
            chunk.map((uid: string) => ({
              user_id: uid,
              actor_id: userId,
              type: "new_event" as const,
              title,
              body,
              note_id: null,
              event_id: eventId,
              comment_id: null,
            })),
          );
        }
        window.dispatchEvent(new CustomEvent("notifications-updated"));
      } catch (e) {
        console.warn("[horarium] new_event notifications failed", e);
      }
    }
  }
  async function remove(event: AcademicEvent) { if (!window.confirm(`¿Eliminar «${event.title}»?`)) return; const result = await deleteAcademicEvent(event.id); if (result.error) setError(result.error); else { setEvents((current) => current.filter((item) => item.id !== event.id)); onDataChanged?.(); } }
  async function markCompleted(event: AcademicEvent) { const result = await saveAcademicEvent({ ...event, status: "completed" }); if (result.error) setError(result.error); else { const fresh = await loadAcademicEvents(); setEvents(fresh.events); onDataChanged?.(); } }

  return <section aria-label="Eventos" className="mx-auto max-w-5xl"><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">Agenda compartida</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-[var(--ink)]">Eventos</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Parciales, entregas y fechas importantes para toda la cursada.</p></div>{canCreate ? <button type="button" onClick={() => { resetForm(); setEditing(true); }} className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white"><CalendarPlus size={16} aria-hidden="true" />Nuevo evento</button> : null}</div>
    {sourceError ? <p role="status" className="mb-5 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">No se pudo leer la tabla remota de eventos. Ejecutá la migración `supabase/academic-events.sql`; mientras tanto se muestra el modo local.</p> : null}
    {canCreate && editing ? <form onSubmit={submit} className="mb-6 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4 sm:p-6"><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-[var(--muted)]">Título<input className="admin-control mt-1" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><label className="text-xs font-semibold text-[var(--muted)]">Tipo<select className="admin-control mt-1" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AcademicEventType })}>{eventTypes.map((type) => <option key={type} value={type}>{labels[type]}</option>)}</select></label><label className="text-xs font-semibold text-[var(--muted)]">Fecha<input className="admin-control mt-1" required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label><label className="text-xs font-semibold text-[var(--muted)]">Hora opcional<input className="admin-control mt-1" type="time" value={form.time ?? ""} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label><label className="text-xs font-semibold text-[var(--muted)]">Materia<select className="admin-control mt-1" value={form.subject_id ?? ""} onChange={(e) => { const subject = subjects.find((item) => item.id === e.target.value); setForm({ ...form, subject_id: e.target.value || null, subject_code: subject?.code ?? null }); }}><option value="">Sin materia</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} · {subject.name}</option>)}</select></label><label className="text-xs font-semibold text-[var(--muted)]">Estado<select className="admin-control mt-1" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AcademicEventStatus })}>{eventStatuses.map((status) => <option key={status} value={status}>{labels[status]}</option>)}</select></label><label className="text-xs font-semibold text-[var(--muted)] sm:col-span-2">Descripción<textarea className="admin-control mt-1 min-h-20" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label></div><div className="mt-4 flex gap-3"><button type="submit" className="admin-primary">{form.id ? "Guardar cambios" : "Crear evento"}</button><button type="button" onClick={resetForm} className="rounded-lg bg-[var(--secondary)] px-4 py-2.5 text-xs font-semibold text-[var(--ink)]">Cancelar</button></div></form> : null}
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><select aria-label="Filtrar por tipo" className="admin-control" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="all">Todos los tipos</option>{eventTypes.map((type) => <option key={type} value={type}>{labels[type]}</option>)}</select><select aria-label="Filtrar por estado" className="admin-control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">Todos los estados</option>{eventStatuses.map((status) => <option key={status} value={status}>{labels[status]}</option>)}</select><select aria-label="Filtrar por materia" className="admin-control" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}><option value="all">Todas las materias</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code}</option>)}</select></div>
    {selectedEvent && !selectedEventVisible ? <p role="status" className="mb-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">El evento seleccionado, «{selectedEvent.title}», está oculto por los filtros actuales.</p> : null}
    {visibleEvents.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-8 text-center"><h2 className="text-base font-semibold text-[var(--ink)]">No hay eventos para mostrar</h2><p className="mt-2 text-sm text-[var(--muted)]">Las fechas importantes de la cursada van a aparecer acá.</p></div> : <div className="space-y-3">{visibleEvents.map((event) => <article key={event.id} ref={event.id === selectedEventId ? selectedEventRef : undefined} data-selected={event.id === selectedEventId ? "true" : undefined} className={`rounded-2xl border bg-[var(--surface)] p-4 transition sm:p-5 ${event.id === selectedEventId ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30" : isEventOverdue(event) ? "border-rose-400/60" : "border-[var(--line)]"}`}><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 gap-3"><div className="min-w-[76px] rounded-xl bg-[var(--soft)] px-3 py-2 text-center text-xs font-bold text-[var(--accent)]"><span className="block text-[10px] uppercase">{formatEventDate(event.date).split(" ")[0]}</span><span className="block text-lg">{event.date.slice(8, 10)}</span><span className="block text-[10px]">{formatEventMonthShort(event.date)}</span></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold text-[var(--ink)]">{event.title}</h2><span className="rounded-full bg-[var(--soft)] px-2 py-1 text-[10px] font-bold text-[var(--accent)]">{labels[event.type]}</span></div><p className="mt-1 text-sm text-[var(--muted)]">{event.time ? `${event.time.slice(0, 5)} · ` : "Todo el día · "}{event.subject_code ?? "Sin materia"} · {labels[event.status]}{isEventOverdue(event) ? " · Vencido" : ""}</p>{event.description ? <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">{event.description}</p> : null}</div></div>{canEdit(event) ? <div className="flex shrink-0 gap-3"><button type="button" onClick={() => beginEdit(event)} className="text-xs font-semibold text-[var(--accent)] hover:underline">Editar</button>{event.status === "pending" ? <button type="button" onClick={() => void markCompleted(event)} className="text-xs font-semibold text-emerald-600 hover:underline">Marcar completado</button> : null}{canManage ? <button type="button" onClick={() => void remove(event)} className="text-xs font-semibold text-rose-500 hover:underline">Eliminar</button> : null}</div> : null}</div></article>)}</div>}
    <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />Evento académico</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-400" />Vencido</span>{error ? <span role="alert" className="text-rose-600">{error}</span> : null}</div>
  </section>;
}
