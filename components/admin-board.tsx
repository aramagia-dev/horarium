"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { days, scheduleSessions as localScheduleSessions, subjects as localSubjects, type Accent, type Day } from "@/lib/schedule-data";

type Subject = { id: string; code: string; name: string; accent: Accent };
type Professor = { id: string; display_name: string; normalized_name: string };
type Room = { id: string; name: string };
type Relation<T> = T | T[] | null;
type Session = { id: string; subject_id: string; professor_id: string | null; room_id: string | null; day: Day; section: string; start_time: string; end_time: string; subjects?: Relation<{ name: string }>; professors?: Relation<{ display_name: string }>; rooms?: Relation<{ name: string }> };

const emptySubject = { id: "", code: "", name: "", accent: "violet" as Accent };
const emptyProfessor = { display_name: "" };
const emptyRoom = { name: "" };
const emptySchedule = { subject_id: "", professor_id: "", room_id: "", day: "Monday" as Day, section: "", start_time: "", end_time: "" };

export function AdminBoard({ onDataChanged }: { onDataChanged?: () => void }) {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [subject, setSubject] = useState(emptySubject);
  const [professor, setProfessor] = useState(emptyProfessor);
  const [room, setRoom] = useState(emptyRoom);
  const [schedule, setSchedule] = useState(emptySchedule);
  const [editingSubject, setEditingSubject] = useState<string | null>(null);
  const [editingProfessor, setEditingProfessor] = useState<string | null>(null);
  const [editingRoom, setEditingRoom] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadData() {
    if (!supabase) return;
    setLoading(true);
    setError("");
    const [subjectsResult, professorsResult, roomsResult, schedulesResult] = await Promise.all([
      supabase.from("subjects").select("id, code, name, accent").order("code"),
      supabase.from("professors").select("id, display_name, normalized_name").order("display_name"),
      supabase.from("rooms").select("id, name").order("name"),
      supabase.from("schedules").select("id, subject_id, professor_id, room_id, day, section, start_time, end_time, subjects(name), professors(display_name), rooms(name)").order("day").order("start_time"),
    ]);
    const resultError = [subjectsResult, professorsResult, roomsResult, schedulesResult].find((result) => result.error)?.error;
    if (resultError) setError(serverError(resultError.message, resultError.code));
    else {
      setSubjects((subjectsResult.data ?? []) as Subject[]);
      setProfessors((professorsResult.data ?? []) as Professor[]);
      setRooms((roomsResult.data ?? []) as Room[]);
      setSessions((schedulesResult.data ?? []) as Session[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    async function checkAccess() {
      if (!supabaseConfigured || !supabase) { setAuthorized(false); setLoading(false); return; }
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) { if (active) { setAuthorized(false); setLoading(false); } return; }
      const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!active) return;
      if (profileError || profile?.role !== "admin") { setAuthorized(false); setLoading(false); return; }
      setAuthorized(true);
      await loadData();
    }
    void checkAccess();
    return () => { active = false; };
  }, []);

  async function mutate(action: () => Promise<{ error: { message: string; code?: string } | null }>) {
    setPending(true);
    setError("");
    setSuccess("");
    const result = await action();
    if (result.error) setError(serverError(result.error.message, result.error.code));
    else {
      await loadData();
      onDataChanged?.();
    }
    setPending(false);
    return !result.error;
  }

  async function saveSubject(event: FormEvent) {
    event.preventDefault();
    const value = { id: subject.id.trim(), code: subject.code.trim().toUpperCase(), name: subject.name.trim(), accent: subject.accent };
    if (!value.id || !value.code || !value.name) return setError("Completá el identificador, código y nombre de la materia.");
    const ok = await mutate(async () => editingSubject ? await supabase!.from("subjects").update(value).eq("id", editingSubject) : await supabase!.from("subjects").insert(value));
    if (ok) { setSubject(emptySubject); setEditingSubject(null); }
  }

  async function saveProfessor(event: FormEvent) {
    event.preventDefault();
    const display_name = professor.display_name.trim();
    if (!display_name) return setError("Ingresá el nombre del profesor.");
    const normalized_name = normalizeName(display_name);
    const ok = await mutate(async () => editingProfessor ? await supabase!.from("professors").update({ display_name, normalized_name }).eq("id", editingProfessor) : await supabase!.from("professors").insert({ display_name, normalized_name }));
    if (ok) { setProfessor(emptyProfessor); setEditingProfessor(null); }
  }

  async function saveRoom(event: FormEvent) {
    event.preventDefault();
    const name = room.name.trim();
    if (!name) return setError("Ingresá el nombre del aula.");
    const ok = await mutate(async () => editingRoom ? await supabase!.from("rooms").update({ name }).eq("id", editingRoom) : await supabase!.from("rooms").insert({ name }));
    if (ok) { setRoom(emptyRoom); setEditingRoom(null); }
  }

  async function saveSchedule(event: FormEvent) {
    event.preventDefault();
    if (!schedule.subject_id || !schedule.section.trim() || !schedule.start_time || !schedule.end_time || schedule.end_time <= schedule.start_time) return setError("Completá la materia, sección y un intervalo horario válido.");
    const currentSession = editingSchedule ? sessions.find((item) => item.id === editingSchedule) : null;
    const scheduleIntervalChanged = !currentSession || currentSession.day !== schedule.day || currentSession.start_time.slice(0, 5) !== schedule.start_time || currentSession.end_time.slice(0, 5) !== schedule.end_time;
    const overlaps = scheduleIntervalChanged && sessions.some((item) => item.id !== editingSchedule && item.day === schedule.day && timesOverlap(schedule.start_time, schedule.end_time, item.start_time, item.end_time));
    if (overlaps) return setError("El horario se superpone con otra sesión del mismo día.");
    const value = { ...schedule, professor_id: schedule.professor_id || null, room_id: schedule.room_id || null, section: schedule.section.trim() };
    const ok = await mutate(async () => editingSchedule ? await supabase!.from("schedules").update(value).eq("id", editingSchedule) : await supabase!.from("schedules").insert(value));
    if (ok) { setSchedule(emptySchedule); setEditingSchedule(null); }
  }

  async function importLocalSchedule() {
    if (!supabase || sessions.length > 0 || !window.confirm("¿Querés importar las 11 sesiones del horario local? Esta acción agrega sesiones al horario compartido.")) return;
    const subjectById = new Map(subjects.map((item) => [item.id, item]));
    const subjectByCode = new Map(subjects.map((item) => [item.code, item]));
    const professorByName = new Map(professors.map((item) => [item.display_name, item]));
    const roomByName = new Map(rooms.map((item) => [item.name, item]));
    const missing: string[] = [];
    const rows = localScheduleSessions.map((localSession) => {
      const localSubject = localSubjects.find((item) => item.id === localSession.subjectId);
      const mappedSubject = subjectById.get(localSession.subjectId) ?? (localSubject ? subjectByCode.get(localSubject.code) : undefined);
      const mappedProfessor = professorByName.get(localSession.professor);
      const mappedRoom = roomByName.get(localSession.room);
      if (!mappedSubject) missing.push(`materia «${localSubject?.name ?? localSession.subjectId}»`);
      if (!mappedProfessor) missing.push(`profesor «${localSession.professor}»`);
      if (!mappedRoom) missing.push(`aula «${localSession.room}»`);
      if (!mappedSubject || !mappedProfessor || !mappedRoom) return null;
      return { subject_id: mappedSubject.id, professor_id: mappedProfessor.id, room_id: mappedRoom.id, day: localSession.day, section: localSession.section, start_time: localSession.start, end_time: localSession.end };
    });
    if (missing.length > 0) {
      setError(`No se pudo importar el horario: faltan coincidencias en ${Array.from(new Set(missing)).join(", ")}. No se insertó ninguna sesión.`);
      return;
    }
    setPending(true);
    setError("");
    setSuccess("");
    const importedRows = rows.filter((row): row is NonNullable<typeof row> => row !== null);
    const result = await supabase.from("schedules").insert(importedRows);
    if (result.error) setError(serverError(result.error.message, result.error.code));
    else {
      setSuccess("Horario local importado correctamente: 11 sesiones.");
      await loadData();
      onDataChanged?.();
    }
    setPending(false);
  }

  function editSchedule(item: Session) {
    setSchedule({ subject_id: item.subject_id, professor_id: item.professor_id ?? "", room_id: item.room_id ?? "", day: item.day, section: item.section, start_time: item.start_time.slice(0, 5), end_time: item.end_time.slice(0, 5) });
    setEditingSchedule(item.id);
    setError("");
    setSuccess("");
  }

  function cancelEdits() {
    setSubject(emptySubject);
    setProfessor(emptyProfessor);
    setRoom(emptyRoom);
    setSchedule(emptySchedule);
    setEditingSubject(null);
    setEditingProfessor(null);
    setEditingRoom(null);
    setEditingSchedule(null);
    setError("");
  }

  if (!supabaseConfigured) return <AccessState title="Administración no conectada" text="Los controles administrativos requieren conectar Supabase. El calendario local sigue disponible." />;
  if (authorized === null || loading) return <AccessState title="Verificando acceso" text="Estamos confirmando tu sesión y permisos de administrador." />;
  if (!authorized) return <AccessState title="Acceso restringido" text="Necesitás una sesión autenticada con rol de administrador para acceder a este panel." />;

  return <section aria-label="Administración" className="mx-auto max-w-6xl">
    <div className="mb-7"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">Panel de control</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-[var(--ink)]">Administrar horario</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Organizá las sesiones compartidas y mantené actualizadas sus asignaciones.</p></div>
    {error ? <p role="alert" className="mb-5 rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-600">{error}</p> : null}
    {success ? <p role="status" className="mb-5 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Materias" value={subjects.length} /><Metric label="Sesiones" value={sessions.length} accent /><Metric label="Profesores" value={professors.length} /><Metric label="Aulas" value={rooms.length} /></div>
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_12px_30px_rgb(15_23_42/0.04)] sm:p-6"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Tarea principal</p><h2 className="mt-1 text-xl font-semibold text-[var(--ink)]">Sesiones del horario</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">Creá sesiones y editá la asignación de profesor o aula por materia.</p></div><span className="rounded-full bg-[var(--background)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">{sessions.length} registradas</span></div>
      <form onSubmit={saveSchedule} className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4 sm:p-5"><div className="mb-4"><h3 className="text-base font-semibold text-[var(--ink)]">{editingSchedule ? "Editar asignación" : "Nueva sesión"}</h3><p className="mt-1 text-xs leading-5 text-[var(--muted)]">El profesor y el aula se guardan en esta sesión, no en la materia.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Materia"><select className="admin-control" required value={schedule.subject_id} onChange={(event) => setSchedule({ ...schedule, subject_id: event.target.value })}><option value="">Seleccionar</option>{subjects.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></Field><Field label="Profesor de esta sesión"><select className="admin-control" value={schedule.professor_id} onChange={(event) => setSchedule({ ...schedule, professor_id: event.target.value })}><option value="">Sin asignar</option>{professors.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></Field><Field label="Aula de esta sesión"><select className="admin-control" value={schedule.room_id} onChange={(event) => setSchedule({ ...schedule, room_id: event.target.value })}><option value="">Sin asignar</option>{rooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Día"><select className="admin-control" value={schedule.day} onChange={(event) => setSchedule({ ...schedule, day: event.target.value as Day })}>{days.map((item) => <option key={item} value={item}>{dayLabel(item)}</option>)}</select></Field><Field label="Sección"><input className="admin-control" required value={schedule.section} onChange={(event) => setSchedule({ ...schedule, section: event.target.value })} /></Field><Field label="Inicio"><input className="admin-control" required type="time" value={schedule.start_time} onChange={(event) => setSchedule({ ...schedule, start_time: event.target.value })} /></Field><Field label="Fin"><input className="admin-control" required type="time" value={schedule.end_time} onChange={(event) => setSchedule({ ...schedule, end_time: event.target.value })} /></Field></div><div className="mt-5 flex flex-wrap items-center gap-3"><button type="submit" disabled={pending} className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-95 disabled:opacity-60">{pending ? "Guardando..." : editingSchedule ? "Guardar asignación" : "Agregar sesión"}</button>{editingSchedule ? <CancelButton onClick={cancelEdits} /> : null}</div></form>
      {sessions.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-[var(--line)] bg-[var(--background)] p-5"><h3 className="text-sm font-semibold text-[var(--ink)]">Todavía no hay sesiones compartidas</h3><p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted)]">Podés importar las 11 sesiones del horario local para empezar a editar sus asignaciones.</p><button type="button" onClick={() => void importLocalSchedule()} disabled={pending} className="mt-4 rounded-lg border border-[var(--accent)] bg-transparent px-4 py-2.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/10 disabled:opacity-60">{pending ? "Importando..." : "Importar horario local (11 sesiones)"}</button></div> : <div className="mt-6"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-[var(--ink)]">Asignaciones por materia</h3><span className="text-xs text-[var(--muted)]">Editá cada fila</span></div><div className="space-y-3">{subjects.map((subjectItem) => { const subjectSessions = sessions.filter((item) => item.subject_id === subjectItem.id); if (subjectSessions.length === 0) return null; return <div key={subjectItem.id} className="rounded-xl bg-[var(--background)] p-3 sm:p-4"><h4 className="text-sm font-semibold text-[var(--ink)]">{subjectItem.code} · {subjectItem.name}</h4><div className="mt-3 space-y-2">{subjectSessions.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-3"><div className="min-w-0 text-xs leading-5 text-[var(--ink)]"><p className="font-semibold">{dayLabel(item.day)} · {item.start_time.slice(0, 5)}–{item.end_time.slice(0, 5)} · Sección {item.section}</p><p className="text-[var(--muted)]">Profesor: {relationValue(item.professors)?.display_name ?? "Sin asignar"} · Aula: {relationValue(item.rooms)?.name ?? "Sin asignar"}</p></div><div className="flex shrink-0 items-center gap-3"><button type="button" onClick={() => editSchedule(item)} className="text-xs font-semibold text-[var(--accent)] hover:underline">Editar asignación</button><button type="button" onClick={() => void remove("schedules", item.id, "la sesión")} className="text-xs font-semibold text-rose-500 hover:underline">Eliminar</button></div></div>)}</div></div>; })}</div></div>}
    </div>
    <div className="mt-8"><div className="mb-3"><h2 className="text-xl font-semibold text-[var(--ink)]">Catálogos</h2><p className="mt-1 text-sm text-[var(--muted)]">Administrá las opciones disponibles para las sesiones.</p></div><div className="grid gap-3 lg:grid-cols-3"><details className="group rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"><summary className="cursor-pointer list-none text-sm font-semibold text-[var(--ink)] marker:hidden">Materias <span className="float-right text-[var(--muted)] group-open:rotate-45">+</span></summary><form onSubmit={saveSubject} className="mt-4 space-y-3"><Field label="Identificador"><input className="admin-control" required value={subject.id} disabled={Boolean(editingSubject)} onChange={(event) => setSubject({ ...subject, id: event.target.value })} /></Field><Field label="Código"><input className="admin-control" required value={subject.code} onChange={(event) => setSubject({ ...subject, code: event.target.value })} /></Field><Field label="Nombre"><input className="admin-control" required value={subject.name} onChange={(event) => setSubject({ ...subject, name: event.target.value })} /></Field><Field label="Acento"><select className="admin-control" value={subject.accent} onChange={(event) => setSubject({ ...subject, accent: event.target.value as Accent })}><option value="violet">Violeta</option><option value="amber">Ámbar</option><option value="blue">Azul</option><option value="rose">Rosa</option><option value="teal">Verde azulado</option></select></Field><button type="submit" disabled={pending} className="admin-primary">{pending ? "Guardando..." : editingSubject ? "Guardar materia" : "Agregar materia"}</button>{editingSubject ? <CancelButton onClick={cancelEdits} /> : null}</form><List>{subjects.map((item) => <ListItem key={item.id} text={`${item.code} · ${item.name}`} onEdit={() => { setSubject({ ...item }); setEditingSubject(item.id); }} onDelete={() => void remove("subjects", item.id, "la materia")} />)}</List></details><details className="group rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"><summary className="cursor-pointer list-none text-sm font-semibold text-[var(--ink)] marker:hidden">Profesores <span className="float-right text-[var(--muted)] group-open:rotate-45">+</span></summary><form onSubmit={saveProfessor} className="mt-4 space-y-3"><Field label="Nombre visible"><input className="admin-control" required value={professor.display_name} onChange={(event) => setProfessor({ display_name: event.target.value })} /></Field><button type="submit" disabled={pending} className="admin-primary">{pending ? "Guardando..." : editingProfessor ? "Guardar profesor" : "Agregar profesor"}</button>{editingProfessor ? <CancelButton onClick={cancelEdits} /> : null}</form><List>{professors.map((item) => <ListItem key={item.id} text={item.display_name} onEdit={() => { setProfessor({ display_name: item.display_name }); setEditingProfessor(item.id); }} onDelete={() => void remove("professors", item.id, "el profesor")} />)}</List></details><details className="group rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"><summary className="cursor-pointer list-none text-sm font-semibold text-[var(--ink)] marker:hidden">Aulas <span className="float-right text-[var(--muted)] group-open:rotate-45">+</span></summary><form onSubmit={saveRoom} className="mt-4 space-y-3"><Field label="Nombre"><input className="admin-control" required value={room.name} onChange={(event) => setRoom({ name: event.target.value })} /></Field><button type="submit" disabled={pending} className="admin-primary">{pending ? "Guardando..." : editingRoom ? "Guardar aula" : "Agregar aula"}</button>{editingRoom ? <CancelButton onClick={cancelEdits} /> : null}</form><List>{rooms.map((item) => <ListItem key={item.id} text={item.name} onEdit={() => { setRoom({ name: item.name }); setEditingRoom(item.id); }} onDelete={() => void remove("rooms", item.id, "el aula")} />)}</List></details></div></div>
  </section>;

  async function remove(table: "subjects" | "professors" | "rooms" | "schedules", id: string, label: string) {
    if (!window.confirm(`¿Querés eliminar ${label}? Esta acción puede afectar sesiones relacionadas.`)) return;
    await mutate(async () => await supabase!.from(table).delete().eq("id", id));
  }
}

function relationValue<T>(value: Relation<T> | undefined) { return Array.isArray(value) ? value[0] ?? null : value ?? null; }
function dayLabel(day: Day) { return ({ Monday: "Lunes", Tuesday: "Martes", Wednesday: "Miércoles", Thursday: "Jueves", Friday: "Viernes" } satisfies Record<Day, string>)[day]; }
function timesOverlap(start: string, end: string, otherStart: string, otherEnd: string) { const startMinutes = toMinutes(start); const endMinutes = toMinutes(end); const otherStartMinutes = toMinutes(otherStart); const otherEndMinutes = toMinutes(otherEnd); return startMinutes < otherEndMinutes && endMinutes > otherStartMinutes; }
function toMinutes(value: string) { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; }
function normalizeName(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase().replace(/\s+/g, " "); }
function serverError(message: string, code?: string) { return code === "23P01" || message.includes("exclusion") ? "No se pudo guardar: el intervalo se superpone con otra sesión del mismo día." : `No se pudo completar la operación. ${message}`; }
function AccessState({ title, text }: { title: string; text: string }) { return <section aria-label="Administración" className="mx-auto max-w-3xl rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-14 text-center"><h1 className="text-xl font-semibold text-[var(--ink)]">{title}</h1><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--muted)]">{text}</p></section>; }
function Metric({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) { return <div className={`rounded-xl border p-4 ${accent ? "border-[var(--accent)]/40 bg-[var(--accent)]/10" : "border-[var(--line)] bg-[var(--surface)]"}`}><p className="text-xs font-semibold text-[var(--muted)]">{label}</p><p className="mt-1 text-2xl font-bold tracking-[-0.04em] text-[var(--ink)]">{value}</p></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-semibold text-[var(--muted)]">{label}<span className="mt-1 block">{children}</span></label>; }
function List({ children }: { children: React.ReactNode }) { return <div className="mt-5 space-y-2 border-t border-[var(--line)] pt-4">{children}</div>; }
function ListItem({ text, onEdit, onDelete }: { text: string; onEdit: () => void; onDelete: () => void }) { return <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--background)] px-3 py-2"><span className="min-w-0 truncate text-xs text-[var(--ink)]">{text}</span><span className="flex shrink-0 gap-2"><button type="button" onClick={onEdit} className="text-xs font-semibold text-[var(--accent)]">Editar</button><button type="button" onClick={onDelete} className="text-xs font-semibold text-rose-500">Eliminar</button></span></div>; }
function CancelButton({ onClick }: { onClick: () => void }) { return <button type="button" onClick={onClick} className="mt-3 text-xs font-semibold text-[var(--muted)]">Cancelar edición</button>; }
