/* eslint-disable @next/next/no-img-element, react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarPlus, CheckCircle2, Users } from "lucide-react";
import {
  eventStatuses,
  eventTypes,
  formatEventDate,
  formatEventMonthShort,
  isEventOverdue,
  loadAcademicEvents,
  saveAcademicEvent,
  deleteAcademicEvent,
  toggleGroupCompletion,
  toggleIndividualCompletion,
  type AcademicEvent,
  type AcademicEventInput,
  type AcademicEventStatus,
  type AcademicEventType,
  type EnrichedEvent,
  type EventType,
} from "@/lib/academic-events";
import type { Subject } from "@/lib/schedule-data";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { hoverTransition, pageVariants, springTransition, staggerContainer, staggerItem, subtleCardHover, useReducedMotion, withReducedMotion } from "@/lib/motion";
import {
  filterEventsByCompletion,
  getCompletionCounts,
  getVisibleAvatars,
  sortEventsAsc,
  sortForTodos,
} from "@/lib/event-completion-board";

const labels: Record<AcademicEventType | AcademicEventStatus, string> = { parcial: "Parcial", entrega: "Entrega", tarea: "Tarea", recuperatorio: "Recuperatorio", exposición: "Exposición", otro: "Otro", pending: "Pendiente", completed: "Completado", cancelled: "Cancelado" };
const emptyForm: AcademicEventInput = { title: "", type: "otro", date: "", time: "", subject_id: null, description: "", status: "pending", event_type: "individual" };

type CompletionFilter = "pendientes" | "completados" | "todos" | "vencidos";
const FILTER_STORAGE_KEY = "horarium:events-completion-filter";
const COMPLETION_FILTERS: Array<{ key: CompletionFilter; label: string }> = [
  { key: "pendientes", label: "Pendientes" },
  { key: "completados", label: "Completados" },
  { key: "todos", label: "Todos" },
  { key: "vencidos", label: "Vencidos" },
];

function Avatar({ name, url, size = 28 }: { name: string | null; url: string | null; size?: number }) {
  if (url) {
    return <img src={url} alt={name ?? "avatar"} className="rounded-full border-2 border-white object-cover shadow-sm" style={{ width: size, height: size }} />;
  }
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="flex items-center justify-center rounded-full border-2 border-white bg-[var(--soft)] text-[10px] font-bold text-[var(--accent)] shadow-sm"
      style={{ width: size, height: size }}
    >
      {initial}
    </span>
  );
}

export function EventsBoard({ events: initialEvents, subjects, isAdmin, userId, sourceError, selectedEventId, onDataChanged, onClearSelectedEvent }: { events: AcademicEvent[]; subjects: Subject[]; isAdmin: boolean; userId: string | null; sourceError: string; selectedEventId?: string | null; onDataChanged?: () => void; onClearSelectedEvent?: () => void }) {
  const [events, setEvents] = useState<EnrichedEvent[]>(() => initialEvents as unknown as EnrichedEvent[]);
  const [form, setForm] = useState<AcademicEventInput>(emptyForm);
  const [editing, setEditing] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>("pendientes");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [detailEvent, setDetailEvent] = useState<EnrichedEvent | null>(null);
  const [error, setError] = useState("");
  const selectedEventRef = useRef<HTMLElement | null>(null);
  const canManage = isAdmin || !supabaseConfigured;
  const canCreate = canManage || Boolean(userId);
  const canEdit = (event: AcademicEvent) => canManage || (Boolean(userId) && event.created_by === userId);
  const reduced = useReducedMotion();

  // persist + restore completion filter (URL/storage else memory)
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(FILTER_STORAGE_KEY) as CompletionFilter | null;
      if (stored && COMPLETION_FILTERS.some((f) => f.key === stored)) setCompletionFilter(stored);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, completionFilter);
    } catch {}
  }, [completionFilter]);

  // notification bell requests filter switch so target event is visible
  useEffect(() => {
    const onShowTodos = () => setCompletionFilter("todos");
    const onShowPendientes = () => setCompletionFilter("pendientes");
    window.addEventListener("horarium:events-show-todos", onShowTodos as EventListener);
    window.addEventListener("horarium:events-show-pendientes", onShowPendientes as EventListener);
    return () => {
      window.removeEventListener("horarium:events-show-todos", onShowTodos as EventListener);
      window.removeEventListener("horarium:events-show-pendientes", onShowPendientes as EventListener);
    };
  }, []);

  useEffect(() => {
    setEvents(initialEvents as unknown as EnrichedEvent[]);
  }, [initialEvents]);

  useEffect(() => {
    let active = true;
    const refresh = () => void loadAcademicEvents().then((result) => { if (active) setEvents(result.events); });
    window.addEventListener("horarium:events-changed", refresh);
    return () => { active = false; window.removeEventListener("horarium:events-changed", refresh); };
  }, []);



  const otherFiltered = useMemo(() => {
    return (events as EnrichedEvent[]).filter((event) => (typeFilter === "all" || event.type === typeFilter) && (statusFilter === "all" || event.status === statusFilter) && (subjectFilter === "all" || event.subject_id === subjectFilter));
  }, [events, statusFilter, subjectFilter, typeFilter]);

  const counts = useMemo(() => getCompletionCounts(otherFiltered as EnrichedEvent[]), [otherFiltered]);

  const visibleEvents = useMemo(() => {
    const filtered = filterEventsByCompletion(otherFiltered as EnrichedEvent[], completionFilter);
    if (completionFilter === "todos") return sortForTodos(filtered);
    return sortEventsAsc(filtered);
  }, [otherFiltered, completionFilter]);
  const selectedEvent = selectedEventId ? events.find((event) => event.id === selectedEventId) : undefined;
  const selectedEventVisible = selectedEvent ? visibleEvents.some((event) => event.id === selectedEvent.id) : false;
  useEffect(() => {
    if (selectedEventVisible) selectedEventRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedEventVisible, selectedEventId]);

  function beginEdit(event: EnrichedEvent) { setForm({ ...event, event_type: (event.event_type as EventType) ?? "individual" }); setEditing(true); setError(""); }
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
  async function remove(event: AcademicEvent) { if (!window.confirm(`¿Eliminar «${event.title}»?`)) return; const result = await deleteAcademicEvent(event.id); if (result.error) setError(result.error); else { setEvents((current) => (current as EnrichedEvent[]).filter((item) => item.id !== event.id)); onDataChanged?.(); } }
  async function markCompleted(event: AcademicEvent) { const result = await saveAcademicEvent({ ...event, status: "completed" }); if (result.error) setError(result.error); else { const fresh = await loadAcademicEvents(); setEvents(fresh.events); onDataChanged?.(); } }

  const handleToggle = useCallback(
    async (event: EnrichedEvent) => {
      if (!userId) return;
      if (togglingId) return;
      const isGrupal = (event.event_type as EventType) === "grupal";
      const prev = events;
      const nowIso = new Date().toISOString();
      // optimistic
      setTogglingId(event.id);
      setError("");
      setEvents((curr) =>
        (curr as EnrichedEvent[]).map((e) => {
          if (e.id !== event.id) return e;
          if (isGrupal) {
            const isDone = Boolean(e.isCompletedByMe);
            if (isDone) {
              return { ...e, completed_by: null, completed_at: null, isCompletedByMe: false, completers: [], completedCount: 0 } as EnrichedEvent;
            }
            return {
              ...e,
              completed_by: userId,
              completed_at: nowIso,
              isCompletedByMe: true,
              completers: [{ user_id: userId, display_name: "Vos", avatar_url: null, completed_at: nowIso }],
              completedCount: 1,
            } as EnrichedEvent;
          } else {
            const isDone = Boolean(e.isCompletedByMe);
            if (isDone) {
              const nextCompleters = (e.completers ?? []).filter((c) => c.user_id !== userId);
              return { ...e, isCompletedByMe: false, completers: nextCompleters, completedCount: nextCompleters.length } as EnrichedEvent;
            }
            const nextCompleters = [...(e.completers ?? []), { user_id: userId, display_name: "Vos", avatar_url: null, completed_at: nowIso }];
            return { ...e, isCompletedByMe: true, completers: nextCompleters, completedCount: nextCompleters.length } as EnrichedEvent;
          }
        }),
      );
      const res = isGrupal ? await toggleGroupCompletion(event.id) : await toggleIndividualCompletion(event.id);
      setTogglingId(null);
      if (res.error) {
        setEvents(prev);
        setError(res.error);
        return;
      }
      // refresh to get real profiles/completers
      try {
        const fresh = await loadAcademicEvents();
        setEvents(fresh.events);
        onDataChanged?.();
      } catch {}
    },
    [events, onDataChanged, togglingId, userId],
  );

  return (
    <section aria-label="Eventos" className="mx-auto w-full max-w-5xl min-w-0 max-w-full overflow-x-hidden">
      <motion.div variants={withReducedMotion(pageVariants, reduced)} initial="initial" animate="animate" className="mb-7 flex w-full max-w-full min-w-0 flex-wrap items-end justify-between gap-4 overflow-hidden">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">Agenda compartida</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-[var(--ink)]">Eventos</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Parciales, entregas y fechas importantes para toda la cursada.</p>
        </div>
        {canCreate ? (
          <motion.button
            type="button"
            whileHover={reduced ? undefined : { y: -1, scale: 1.01 }}
            whileTap={reduced ? undefined : { scale: 0.98 }}
            onClick={() => { resetForm(); setEditing(true); }}
            className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white"
          >
            <CalendarPlus size={16} aria-hidden="true" />
            Nuevo evento
          </motion.button>
        ) : null}
      </motion.div>
      {sourceError ? <p role="status" className="mb-5 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">No se pudo leer la tabla remota de eventos. Ejecutá la migración `supabase/academic-events.sql`; mientras tanto se muestra el modo local.</p> : null}
      {error ? <p role="alert" className="mb-5 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{error}</p> : null}
      <AnimatePresence>
        {canCreate && editing ? (
          <motion.form
            key="event-form"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={reduced ? { duration: 0.15 } : springTransition}
            onSubmit={submit}
            className="mb-6 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4 sm:p-6"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-[var(--muted)]">Título<input className="admin-control mt-1" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
              <label className="text-xs font-semibold text-[var(--muted)]">Tipo<select className="admin-control mt-1" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AcademicEventType })}>{eventTypes.map((type) => <option key={type} value={type}>{labels[type]}</option>)}</select></label>
              <label className="text-xs font-semibold text-[var(--muted)]">Fecha<input className="admin-control mt-1" required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
              <label className="text-xs font-semibold text-[var(--muted)]">Hora opcional<input className="admin-control mt-1" type="time" value={form.time ?? ""} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label>
              <label className="text-xs font-semibold text-[var(--muted)]">Materia<select className="admin-control mt-1" value={form.subject_id ?? ""} onChange={(e) => { const subject = subjects.find((item) => item.id === e.target.value); setForm({ ...form, subject_id: e.target.value || null, subject_code: subject?.code ?? null }); }}><option value="">Sin materia</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} · {subject.name}</option>)}</select></label>
              <label className="text-xs font-semibold text-[var(--muted)]">Estado<select className="admin-control mt-1" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AcademicEventStatus })}>{eventStatuses.map((status) => <option key={status} value={status}>{labels[status]}</option>)}</select></label>
              <label className="text-xs font-semibold text-[var(--muted)]">Modalidad
                <div className="mt-1 flex gap-3">
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium has-[input:checked]:border-[var(--accent)] has-[input:checked]:bg-[var(--accent)]/10 has-[input:checked]:text-[var(--accent)]"><input type="radio" name="event_type" value="individual" checked={(form.event_type ?? "individual") === "individual"} onChange={() => setForm({ ...form, event_type: "individual" })} className="sr-only" />Individual</label>
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium has-[input:checked]:border-[var(--accent)] has-[input:checked]:bg-[var(--accent)]/10 has-[input:checked]:text-[var(--accent)]"><input type="radio" name="event_type" value="grupal" checked={form.event_type === "grupal"} onChange={() => setForm({ ...form, event_type: "grupal" })} className="sr-only" />Grupal</label>
                </div>
                <p className="mt-1 text-[10px] font-normal leading-3 text-[var(--muted)]">Individual: cada uno marca el suyo · Grupal: uno completa por todos</p>
              </label>
              <label className="text-xs font-semibold text-[var(--muted)] sm:col-span-2">Descripción<textarea className="admin-control mt-1 min-h-20" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            </div>
            <div className="mt-4 flex gap-3">
              <button type="submit" className="admin-primary">{form.id ? "Guardar cambios" : "Crear evento"}</button>
              <button type="button" onClick={resetForm} className="rounded-lg bg-[var(--secondary)] px-4 py-2.5 text-xs font-semibold text-[var(--ink)]">Cancelar</button>
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>

      {/* Completion filter bar — PR2 3.1 */}
      <div role="tablist" aria-label="Filtrar por completado" className="mb-4 flex flex-wrap gap-2">
        {COMPLETION_FILTERS.map((f) => {
          const count = counts[f.key];
          const active = completionFilter === f.key;
          return (
            <button
              key={f.key}
              role="tab"
              aria-selected={active}
              onClick={() => setCompletionFilter(f.key)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${active ? "border-[var(--accent)] bg-[var(--accent)] text-white shadow-sm" : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"}`}
            >
              {f.label}({count})
            </button>
          );
        })}
      </div>

      <motion.div variants={withReducedMotion(staggerContainer, reduced)} initial="hidden" animate="visible" className="mb-5 grid gap-3 sm:grid-cols-3">
        <motion.div variants={withReducedMotion(staggerItem, reduced)}>
          <select aria-label="Filtrar por tipo" className="admin-control" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="all">Todos los tipos</option>{eventTypes.map((type) => <option key={type} value={type}>{labels[type]}</option>)}</select>
        </motion.div>
        <motion.div variants={withReducedMotion(staggerItem, reduced)}>
          <select aria-label="Filtrar por estado" className="admin-control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">Todos los estados</option>{eventStatuses.map((status) => <option key={status} value={status}>{labels[status]}</option>)}</select>
        </motion.div>
        <motion.div variants={withReducedMotion(staggerItem, reduced)}>
          <select aria-label="Filtrar por materia" className="admin-control" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}><option value="all">Todas las materias</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code}</option>)}</select>
        </motion.div>
      </motion.div>
      {selectedEvent && !selectedEventVisible ? <p role="status" className="mb-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">El evento seleccionado, «{selectedEvent.title}», está oculto por los filtros actuales.</p> : null}
      <AnimatePresence mode="wait">
        {visibleEvents.length === 0 ? (
          <motion.div key="empty" initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }} exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-8 text-center">
            {completionFilter === "pendientes" ? (
              <>
                <h2 className="text-base font-semibold text-[var(--ink)]">¡Estás al día!</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">No tenés pendientes. Todo completado.</p>
                <div className="mt-4 flex justify-center gap-3">
                  <button type="button" onClick={() => setCompletionFilter("completados")} className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white">Ver completados</button>
                  <button type="button" onClick={() => setCompletionFilter("todos")} className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--ink)]">Ver todos</button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-base font-semibold text-[var(--ink)]">No hay eventos para mostrar</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">Las fechas importantes de la cursada van a aparecer acá.</p>
              </>
            )}
          </motion.div>
        ) : (
          <motion.div
            key={`${typeFilter}-${statusFilter}-${subjectFilter}-${completionFilter}`}
            variants={withReducedMotion(staggerContainer, reduced)}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="space-y-3"
          >
            {visibleEvents.map((event) => {
              const ee = event as EnrichedEvent;
              const isCompleted = Boolean(ee.isCompletedByMe);
              const isOverdue = isEventOverdue(event as AcademicEvent, isCompleted);
              const isGrupal = (ee.event_type as EventType) === "grupal";
              const completers = (ee.completers ?? []) as Array<{ user_id: string; display_name: string | null; avatar_url: string | null; completed_at: string | null }>;
              const count = (ee.completedCount ?? completers.length) as number;
              const showAvatars = count > 0;
              const { visible: visibleAvatars, extra } = getVisibleAvatars(completers as unknown as import("@/lib/academic-events").Completer[], 3);
              const titleClass = isCompleted ? "line-through decoration-2 opacity-70 text-[var(--muted)]" : "text-[var(--ink)]";
              const cardExtra = isCompleted ? "opacity-60 bg-[var(--surface)] border-dashed" : "";
              return (
                <motion.article
                  key={event.id}
                  ref={event.id === selectedEventId ? (selectedEventRef as unknown as React.Ref<HTMLDivElement>) : undefined}
                  data-selected={event.id === selectedEventId ? "true" : undefined}
                  variants={withReducedMotion(staggerItem, reduced)}
                  whileHover={reduced ? undefined : subtleCardHover}
                  transition={hoverTransition}
                  onMouseEnter={selectedEventId && event.id !== selectedEventId ? () => onClearSelectedEvent?.() : undefined}
                  onFocus={selectedEventId && event.id !== selectedEventId ? () => onClearSelectedEvent?.() : undefined}
                  className={`event-card w-full max-w-full min-w-0 overflow-hidden rounded-2xl border bg-[var(--surface)] p-4 sm:p-5 ${event.id === selectedEventId ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30" : isOverdue ? "border-rose-400/60" : "border-[var(--line)]"} ${cardExtra}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 gap-3">
                      <div className="min-w-[76px] rounded-xl bg-[var(--soft)] px-3 py-2 text-center text-xs font-bold text-[var(--accent)]">
                        <span className="block text-[10px] uppercase">{formatEventDate(event.date).split(" ")[0]}</span>
                        <span className="block text-lg">{event.date.slice(8, 10)}</span>
                        <span className="block text-[10px]">{formatEventMonthShort(event.date)}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className={`text-base font-semibold ${titleClass}`}>{event.title}</h2>
                          <span className="rounded-full bg-[var(--soft)] px-2 py-1 text-[10px] font-bold text-[var(--accent)]">{labels[event.type]}</span>
                          {isGrupal ? <span className="flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-1 text-[10px] font-semibold text-[var(--muted)]"><Users size={10} aria-hidden="true" />Grupal</span> : null}
                          {isCompleted ? <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-600"><CheckCircle2 size={10} aria-hidden="true" />Completado</span> : null}
                        </div>
                        <p className="mt-1 text-sm text-[var(--muted)]">{event.time ? `${event.time.slice(0, 5)} · ` : "Todo el día · "}{event.subject_code ?? "Sin materia"} · {labels[event.status]}{isOverdue ? " · Vencido" : ""}</p>
                        {event.description ? <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">{event.description}</p> : null}
                        {/* Avatar stack — PR2 3.4 */}
                        {showAvatars ? (
                          <button
                            type="button"
                            onClick={() => setDetailEvent(ee)}
                            aria-label={`Ver ${count} completadores de ${event.title}`}
                            className="mt-3 flex items-center gap-2 rounded-full bg-[var(--soft)]/60 px-2 py-1 pr-3 text-left transition hover:bg-[var(--soft)]"
                          >
                            <span className="flex -space-x-2">
                              {visibleAvatars.map((c) => (
                                <Avatar key={c.user_id} name={c.display_name ?? c.user_id} url={c.avatar_url} size={28} />
                              ))}
                              {extra > 0 ? (
                                <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[var(--accent)] text-[10px] font-bold text-white">+{extra}</span>
                              ) : null}
                            </span>
                            <span className="text-xs font-medium text-[var(--muted)]">
                              {isGrupal
                                ? `Completado por ${completers[0]?.display_name ?? "alguien"} (grupal)`
                                : count === 1
                                  ? `Completado por ${completers[0]?.display_name ?? "alguien"}`
                                  : `${completers[0]?.display_name ?? "Alguien"} y +${count - 1} completaron`}
                            </span>
                          </button>
                        ) : null}
                        {!showAvatars && isGrupal && count === 0 ? <p className="mt-2 text-xs text-[var(--muted)]">Nadie completó aún</p> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-3">
                      {userId ? (
                        <button
                          type="button"
                          disabled={togglingId === event.id}
                          aria-pressed={isCompleted}
                          onClick={() => void handleToggle(ee)}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${isCompleted ? "border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-amber-300" : "bg-emerald-500 text-white hover:bg-emerald-600"} disabled:opacity-50`}
                        >
                          {togglingId === event.id ? "Guardando…" : isCompleted ? "Desmarcar" : "Completar"}
                        </button>
                      ) : null}
                      {canEdit(event) ? (
                        <>
                          <button type="button" onClick={() => beginEdit(ee)} className="text-xs font-semibold text-[var(--accent)] hover:underline">Editar</button>
                          {event.status === "pending" ? <button type="button" onClick={() => void markCompleted(event)} className="text-xs font-semibold text-emerald-600 hover:underline">Marcar completado</button> : null}
                          {canManage ? <button type="button" onClick={() => void remove(event)} className="text-xs font-semibold text-rose-500 hover:underline">Eliminar</button> : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />Evento académico</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-400" />Vencido</span></div>

      {/* Detail modal — PR2 3.4 */}
      <AnimatePresence>
        {detailEvent ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
            onClick={() => setDetailEvent(null)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={springTransition}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[80vh] w-full max-w-md overflow-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-xl"
              role="dialog"
              aria-modal="true"
              aria-label={`Completadores de ${detailEvent.title}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-[var(--ink)]">{detailEvent.title}</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {(detailEvent.completedCount ?? 0) === 0 ? "0" : detailEvent.completedCount} completado{(detailEvent.completedCount ?? 0) !== 1 ? "s" : ""} · {detailEvent.event_type === "grupal" ? "Grupal — uno completa por todos" : "Individual"}
                  </p>
                </div>
                <button type="button" onClick={() => setDetailEvent(null)} aria-label="Cerrar" className="rounded-full bg-[var(--soft)] p-2 text-[var(--muted)] hover:text-[var(--ink)]">×</button>
              </div>
              <ul className="mt-5 space-y-3">
                {(detailEvent.completers ?? []).length === 0 ? (
                  <li className="rounded-xl border border-dashed border-[var(--line)] p-4 text-center text-sm text-[var(--muted)]">Nadie completó aún</li>
                ) : (
                  (detailEvent.completers ?? []).map((c) => (
                    <li key={c.user_id} className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--soft)]/40 px-3 py-2.5">
                      <Avatar name={c.display_name ?? c.user_id} url={c.avatar_url} size={36} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--ink)]">
                          {c.display_name ?? c.user_id.slice(0, 8)} {detailEvent.event_type === "grupal" ? <span className="font-normal text-[var(--muted)]">(grupal)</span> : null}
                        </p>
                        <p className="text-xs text-[var(--muted)]">{c.completed_at ? new Date(c.completed_at).toLocaleString("es-AR") : ""}</p>
                      </div>
                    </li>
                  ))
                )}
              </ul>
              <button type="button" onClick={() => setDetailEvent(null)} className="mt-5 w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white">Cerrar</button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
