import { supabase, supabaseConfigured } from "@/lib/supabase";

export const eventTypes = ["parcial", "entrega", "recuperatorio", "exposición", "otro"] as const;
export const eventStatuses = ["pending", "completed", "cancelled"] as const;
export type AcademicEventType = (typeof eventTypes)[number];
export type AcademicEventStatus = (typeof eventStatuses)[number];

export type AcademicEvent = {
  id: string;
  title: string;
  type: AcademicEventType;
  date: string;
  time: string | null;
  subject_id: string | null;
  subject_code: string | null;
  description: string | null;
  status: AcademicEventStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AcademicEventInput = Omit<AcademicEvent, "id" | "created_at" | "updated_at" | "subject_code" | "created_by"> & { id?: string; subject_code?: string | null };
export const eventsChangedEvent = "horarium:events-changed";
const storageKey = "horarium:academic-events";

function localDate(offset: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

function demoEvents(): AcademicEvent[] {
  const now = new Date().toISOString();
  return [
    { id: "demo-parcial-asi", title: "Parcial de ASI", type: "parcial", date: localDate(5), time: "18:00", subject_id: "subject-asi", subject_code: "ASI", description: "Primera evaluación de la cursada.", status: "pending", created_by: null, created_at: now, updated_at: now },
    { id: "demo-entrega-red", title: "Entrega de TP de Redes", type: "entrega", date: localDate(12), time: null, subject_id: "subject-red", subject_code: "RED", description: null, status: "pending", created_by: null, created_at: now, updated_at: now },
  ];
}

function readLocalEvents() {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(storageKey);
  if (!stored) {
    const initial = demoEvents();
    window.localStorage.setItem(storageKey, JSON.stringify(initial));
    return initial;
  }
  try { return JSON.parse(stored) as AcademicEvent[]; } catch { return []; }
}

function writeLocalEvents(events: AcademicEvent[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(events));
  window.dispatchEvent(new CustomEvent(eventsChangedEvent));
}

export function isEventOverdue(event: AcademicEvent) {
  if (event.status !== "pending") return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}`;
  if (event.date < today) return true;
  if (event.date > today) return false;
  if (!event.time) return false;
  const timeHHMM = event.time.slice(0, 5);
  const nowHHMM = `${`${now.getHours()}`.padStart(2, "0")}:${`${now.getMinutes()}`.padStart(2, "0")}`;
  return nowHHMM > timeHHMM;
}

export function formatEventDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
}

export function formatEventMonthShort(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-AR", { month: "short" }).replace(".", "").toUpperCase();
}

export async function loadAcademicEvents(): Promise<{ events: AcademicEvent[]; source: "supabase" | "local"; error: string }> {
  if (!supabaseConfigured || !supabase) return { events: readLocalEvents(), source: "local", error: "" };
  const result = await supabase.from("academic_events").select("id, title, type, date, time, subject_id, description, status, created_by, created_at, updated_at, subjects(code)").order("date").order("time", { nullsFirst: false });
  if (result.error) return { events: readLocalEvents(), source: "local", error: result.error.message };
  return { events: (result.data ?? []).map((row) => { const subject = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects; return { ...row, subject_code: subject?.code ?? null } as AcademicEvent; }), source: "supabase", error: "" };
}

export async function saveAcademicEvent(input: AcademicEventInput) {
  const value = { title: input.title.trim(), type: input.type, date: input.date, time: input.time || null, subject_id: input.subject_id || null, description: input.description?.trim() || null, status: input.status };
  if (!value.title || !value.date) return { error: "Completá el título y la fecha." };
  if (!supabaseConfigured || !supabase) {
    const current = readLocalEvents();
    const now = new Date().toISOString();
    const next = input.id ? current.map((event) => event.id === input.id ? { ...event, ...value, subject_code: input.subject_code ?? event.subject_code, updated_at: now } : event) : [{ ...value, id: crypto.randomUUID(), subject_code: input.subject_code ?? null, created_at: now, updated_at: now }, ...current];
    writeLocalEvents(next as AcademicEvent[]);
    return { error: "" };
  }
  const { data: userData } = await supabase.auth.getUser();
  const insertValue = userData.user?.id ? { ...value, created_by: userData.user.id } : value;
  const result = input.id ? await supabase.from("academic_events").update(value).eq("id", input.id) : await supabase.from("academic_events").insert(insertValue);
  if (result.error) return { error: result.error.message };
  window.dispatchEvent(new CustomEvent(eventsChangedEvent));
  return { error: "" };
}

export async function deleteAcademicEvent(id: string) {
  if (!supabaseConfigured || !supabase) { writeLocalEvents(readLocalEvents().filter((event) => event.id !== id)); return { error: "" }; }
  const result = await supabase.from("academic_events").delete().eq("id", id);
  if (result.error) return { error: result.error.message };
  window.dispatchEvent(new CustomEvent(eventsChangedEvent));
  return { error: "" };
}
