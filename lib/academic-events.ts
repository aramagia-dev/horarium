import { supabase, supabaseConfigured } from "@/lib/supabase";

export const eventTypes = ["parcial", "entrega", "tarea", "recuperatorio", "exposición", "otro"] as const;
export const eventStatuses = ["pending", "completed", "cancelled"] as const;
export type AcademicEventType = (typeof eventTypes)[number];
export type AcademicEventStatus = (typeof eventStatuses)[number];

export type EventType = "individual" | "grupal";

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
  // hybrid completion fields (additive, optional for backward compat)
  event_type?: EventType;
  completed_by?: string | null;
  completed_at?: string | null;
};

export type Completer = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  completed_at: string | null;
};

export type EnrichedEvent = AcademicEvent & {
  event_type: EventType;
  completed_by: string | null;
  completed_at: string | null;
  isCompletedByMe: boolean;
  completers: Completer[];
  completedCount: number;
};

export type AcademicEventInput = Omit<AcademicEvent, "id" | "created_at" | "updated_at" | "subject_code" | "created_by" | "event_type" | "completed_by" | "completed_at" | "isCompletedByMe" | "completers" | "completedCount"> & {
  id?: string;
  subject_code?: string | null;
  event_type?: EventType;
};

export const eventsChangedEvent = "horarium:events-changed";
const storageKey = "horarium:academic-events";
const completionStorageKey = "horarium:completion-completions";

function mapCompletionError(err: unknown): string {
  const raw = typeof err === "string" ? err : ((err as { message?: string })?.message ?? String(err));
  const code = typeof err === "object" && err !== null ? ((err as { code?: string }).code ?? "") : "";
  const lower = `${raw} ${code}`.toLowerCase();
  // table missing or schema cache
  if (lower.includes("does not exist") || lower.includes("could not find the table") || lower.includes("42p01") || lower.includes("pgrst205")) {
    return "Falta la migración de completados. Ejecutá supabase/event-completion-social.sql en Supabase SQL Editor y recargá la página.";
  }
  if (lower.includes("permission denied") || lower.includes("not allowed") || lower.includes("policy") || lower.includes("row-level security") || lower.includes("42501")) {
    return "No tenés permiso para marcar este evento. Verificá que estés logueado y que la migración de RLS esté aplicada.";
  }
  return raw;
}

function localDate(offset: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

function demoEvents(): AcademicEvent[] {
  const now = new Date().toISOString();
  return [
    { id: "demo-parcial-asi", title: "Parcial de ASI", type: "parcial", date: localDate(5), time: "18:00", subject_id: "subject-asi", subject_code: "ASI", description: "Primera evaluación de la cursada.", status: "pending", created_by: null, created_at: now, updated_at: now, event_type: "individual", completed_by: null, completed_at: null },
    { id: "demo-entrega-red", title: "Entrega de TP de Redes", type: "entrega", date: localDate(12), time: null, subject_id: "subject-red", subject_code: "RED", description: null, status: "pending", created_by: null, created_at: now, updated_at: now, event_type: "individual", completed_by: null, completed_at: null },
  ];
}

function readLocalEvents(): AcademicEvent[] {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(storageKey);
  if (!stored) {
    const initial = demoEvents();
    window.localStorage.setItem(storageKey, JSON.stringify(initial));
    return initial;
  }
  try {
    return JSON.parse(stored) as AcademicEvent[];
  } catch {
    return [];
  }
}

function writeLocalEvents(events: AcademicEvent[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(events));
  window.dispatchEvent(new CustomEvent(eventsChangedEvent));
}

function readLocalCompletions(): Array<{ event_id: string; user_id: string; completed_at: string }> {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(completionStorageKey);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as Array<{ event_id: string; user_id: string; completed_at: string }>;
  } catch {
    return [];
  }
}

function writeLocalCompletions(rows: Array<{ event_id: string; user_id: string; completed_at: string }>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(completionStorageKey, JSON.stringify(rows));
  window.dispatchEvent(new CustomEvent(eventsChangedEvent));
}

function toEnriched(
  event: AcademicEvent,
  viewerId: string | null,
  completions: Array<{ event_id: string; user_id: string; completed_at: string | null; profiles?: { display_name: string | null; avatar_url: string | null } | null }>,
  grupalProfiles?: Map<string, { display_name: string | null; avatar_url: string | null }>,
): EnrichedEvent {
  const eventType: EventType = (event.event_type as EventType) ?? "individual";
  const completedBy = event.completed_by ?? null;
  const completedAt = event.completed_at ?? null;

  if (eventType === "grupal") {
    const isCompletedByMe = completedBy !== null;
    const prof = completedBy ? grupalProfiles?.get(completedBy) : undefined;
    const completers: Completer[] = completedBy
      ? [{ user_id: completedBy, display_name: prof?.display_name ?? null, avatar_url: prof?.avatar_url ?? null, completed_at: completedAt }]
      : [];
    return {
      ...event,
      event_type: eventType,
      completed_by: completedBy,
      completed_at: completedAt,
      isCompletedByMe,
      completers,
      completedCount: completers.length,
    };
  }

  // individual: use completions rows
  const rows = completions.filter((c) => c.event_id === event.id);
  const completers: Completer[] = rows.map((r) => ({
    user_id: r.user_id,
    display_name: r.profiles?.display_name ?? null,
    avatar_url: r.profiles?.avatar_url ?? null,
    completed_at: r.completed_at ?? null,
  }));
  const isCompletedByMe = viewerId ? rows.some((r) => r.user_id === viewerId) : false;
  return {
    ...event,
    event_type: eventType,
    completed_by: completedBy,
    completed_at: completedAt,
    isCompletedByMe,
    completers,
    completedCount: completers.length,
  };
}

// Overload: supports both old single-arg and new two-arg signatures
export function isEventOverdue(event: AcademicEvent, viewerCompleted?: boolean): boolean {
  // tilde beats vencimiento: if viewer completed, never overdue
  if (viewerCompleted === true) return false;
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

export async function loadAcademicEvents(): Promise<{ events: EnrichedEvent[]; source: "supabase" | "local"; error: string }> {
  if (!supabaseConfigured || !supabase) {
    const localEvents = readLocalEvents();
    const localCompletions = readLocalCompletions();
    // local viewer is not known, isCompletedByMe false for all
    const enriched = localEvents.map((e) => toEnriched(e, null, localCompletions));
    return { events: enriched, source: "local", error: "" };
  }

  // Auth viewer
  let viewerId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    // Support both {data:{user}} and {user} shapes
    const user = (data as { user?: { id: string } })?.user ?? (data as unknown as { id: string }) ?? null;
    viewerId = (user as { id?: string })?.id ?? null;
  } catch {
    viewerId = null;
  }

  const result = await supabase
    .from("academic_events")
    .select("id, title, type, date, time, subject_id, description, status, created_by, created_at, updated_at, event_type, completed_by, completed_at, subjects(code)")
    .order("date")
    .order("time", { nullsFirst: false });

  if (result.error) {
    const localEvents = readLocalEvents();
    const localCompletions = readLocalCompletions();
    const enriched = localEvents.map((e) => toEnriched(e, viewerId, localCompletions));
    return { events: enriched, source: "local", error: result.error.message };
  }

  const rows = (result.data ?? []) as Array<Record<string, unknown>>;
  const events: AcademicEvent[] = rows.map((row) => {
    const subject = Array.isArray(row.subjects) ? (row.subjects as Array<{ code: string }>)[0] : (row.subjects as { code: string } | null);
    return {
      id: row.id as string,
      title: row.title as string,
      type: row.type as AcademicEventType,
      date: row.date as string,
      time: row.time as string | null,
      subject_id: row.subject_id as string | null,
      subject_code: subject?.code ?? null,
      description: row.description as string | null,
      status: row.status as AcademicEventStatus,
      created_by: row.created_by as string | null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      event_type: (row.event_type as EventType) ?? "individual",
      completed_by: (row.completed_by as string | null) ?? null,
      completed_at: (row.completed_at as string | null) ?? null,
    };
  });

  // Fetch completions for enrichment (individual mode) — two-step to avoid missing FK to profiles
  let completions: Array<{ event_id: string; user_id: string; completed_at: string | null; profiles?: { display_name: string | null; avatar_url: string | null } | null }> = [];
  const grupalProfileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
  if (events.length > 0) {
    const ids = events.map((e) => e.id);
    const compRes = await supabase.from("academic_event_completions").select("event_id, user_id, completed_at").in("event_id", ids);
    if (!compRes.error && compRes.data) {
      completions = compRes.data as unknown as typeof completions;
    } else if (compRes.error) {
      console.warn("[horarium] completions fetch failed", compRes.error);
    }
    // collect user_ids for profile enrichment (individual completers + grupal completed_by)
    const userIds = new Set<string>();
    for (const c of completions) if (c.user_id) userIds.add(c.user_id);
    for (const e of events) if (e.event_type === "grupal" && e.completed_by) userIds.add(e.completed_by);
    if (userIds.size > 0) {
      try {
        const profRes = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", Array.from(userIds));
        if (!profRes.error && profRes.data) {
          for (const p of profRes.data as Array<{ id: string; display_name: string | null; avatar_url: string | null }>) {
            grupalProfileMap.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url });
          }
          // enrich individual completions in-place
          completions = completions.map((c) => {
            const prof = grupalProfileMap.get(c.user_id);
            return prof ? { ...c, profiles: prof } : c;
          });
        }
      } catch (e) {
        console.warn("[horarium] profile enrichment failed", e);
      }
    }
  }

  const enriched = events.map((e) => toEnriched(e, viewerId, completions, grupalProfileMap));
  return { events: enriched, source: "supabase", error: "" };
}

export async function saveAcademicEvent(input: AcademicEventInput) {
  const value = {
    title: input.title.trim(),
    type: input.type,
    date: input.date,
    time: input.time || null,
    subject_id: input.subject_id || null,
    description: input.description?.trim() || null,
    status: input.status,
    event_type: input.event_type ?? "individual",
  };
  if (!value.title || !value.date) return { error: "Completá el título y la fecha." };
  if (!supabaseConfigured || !supabase) {
    const current = readLocalEvents();
    const now = new Date().toISOString();
    const next = input.id
      ? current.map((event) => (event.id === input.id ? { ...event, ...value, subject_code: input.subject_code ?? event.subject_code, updated_at: now } : event))
      : [{ ...value, id: crypto.randomUUID(), subject_code: input.subject_code ?? null, created_at: now, updated_at: now, completed_by: null, completed_at: null } as AcademicEvent, ...current];
    writeLocalEvents(next as AcademicEvent[]);
    return { error: "" };
  }
  const { data: userData } = await supabase.auth.getUser();
  const user = (userData as { user?: { id: string } })?.user ?? (userData as unknown as { id: string } | null);
  const userId = (user as { id?: string })?.id;
  const insertValue = userId ? { ...value, created_by: userId } : value;
  const result = input.id
    ? await supabase.from("academic_events").update(value).eq("id", input.id)
    : await supabase.from("academic_events").insert(insertValue);
  if (result.error) return { error: result.error.message };
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(eventsChangedEvent));
  return { error: "" };
}

export async function deleteAcademicEvent(id: string) {
  if (!supabaseConfigured || !supabase) {
    writeLocalEvents(readLocalEvents().filter((event) => event.id !== id));
    return { error: "" };
  }
  const result = await supabase.from("academic_events").delete().eq("id", id);
  if (result.error) return { error: result.error.message };
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(eventsChangedEvent));
  return { error: "" };
}

// Best-effort fan-out: never blocks toggle, exclude actor via server, vencido still notifies, batch 100 server-side
async function triggerEventCompletedNotification(eventId: string) {
  try {
    if (!supabase || typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    const token = (data as { session?: { access_token?: string } })?.session?.access_token ?? null;
    if (!token) return;
    // fire-and-forget: do not await
    void fetch("/api/events/notify-completion", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ eventId }),
    }).catch(() => {});
  } catch {
    // best-effort
  }
}

export async function toggleIndividualCompletion(eventId: string): Promise<{ error: string }> {
  if (!eventId) return { error: "Evento requerido." };
  if (!supabaseConfigured || !supabase) {
    // local fallback: toggle in localStorage
    const completions = readLocalCompletions();
    const pseudoUser = "local-user";
    const idx = completions.findIndex((c) => c.event_id === eventId && c.user_id === pseudoUser);
    if (idx >= 0) {
      completions.splice(idx, 1);
    } else {
      completions.push({ event_id: eventId, user_id: pseudoUser, completed_at: new Date().toISOString() });
    }
    writeLocalCompletions(completions);
    return { error: "" };
  }

  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    const user = (data as { user?: { id: string } })?.user ?? (data as unknown as { id: string } | null);
    userId = (user as { id?: string })?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return { error: "No autenticado." };

  // Check existing
  const existing = await supabase.from("academic_event_completions").select("event_id, user_id").eq("event_id", eventId).eq("user_id", userId).maybeSingle();
  if (existing.error && existing.error.code !== "PGRST116") {
    // PGRST116 = no rows, treat as not found
    // For other errors, return
    return { error: mapCompletionError(existing.error) };
  }

  if (existing.data) {
    // delete own row
    const del = await supabase.from("academic_event_completions").delete().eq("event_id", eventId).eq("user_id", userId);
    if (del.error) return { error: mapCompletionError(del.error) };
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(eventsChangedEvent));
    return { error: "" };
  } else {
    // insert, idempotent via PK conflict do nothing
    const ins = await supabase.from("academic_event_completions").insert({ event_id: eventId, user_id: userId });
    if (ins.error) {
      // 23505 duplicate = idempotent success
      const code = (ins.error as { code?: string }).code;
      if (code === "23505") {
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(eventsChangedEvent));
        triggerEventCompletedNotification(eventId);
        return { error: "" };
      }
      return { error: mapCompletionError(ins.error) };
    }
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(eventsChangedEvent));
    triggerEventCompletedNotification(eventId);
    return { error: "" };
  }
}

export async function toggleGroupCompletion(eventId: string): Promise<{ error: string }> {
  if (!eventId) return { error: "Evento requerido." };
  if (!supabaseConfigured || !supabase) {
    const events = readLocalEvents();
    const idx = events.findIndex((e) => e.id === eventId);
    if (idx < 0) return { error: "Evento no encontrado." };
    const ev = events[idx];
    const isCompleted = !!ev.completed_by;
    events[idx] = {
      ...ev,
      completed_by: isCompleted ? null : "local-user",
      completed_at: isCompleted ? null : new Date().toISOString(),
    };
    writeLocalEvents(events);
    return { error: "" };
  }

  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    const user = (data as { user?: { id: string } })?.user ?? (data as unknown as { id: string } | null);
    userId = (user as { id?: string })?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return { error: "No autenticado." };

  const existing = await supabase.from("academic_events").select("id, completed_by").eq("id", eventId).maybeSingle();
  if (existing.error) return { error: mapCompletionError(existing.error) };
  if (!existing.data) return { error: "Evento no encontrado." };

  const currentCompletedBy = (existing.data as { completed_by: string | null }).completed_by;
  if (currentCompletedBy) {
    // uncomplete for all
    const upd = await supabase.from("academic_events").update({ completed_by: null, completed_at: null }).eq("id", eventId);
    if (upd.error) return { error: mapCompletionError(upd.error) };
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(eventsChangedEvent));
    return { error: "" };
  } else {
    const upd = await supabase.from("academic_events").update({ completed_by: userId, completed_at: new Date().toISOString() }).eq("id", eventId);
    if (upd.error) {
      const code = (upd.error as { code?: string }).code;
      // treat upsert race as success
      if (code === "23505") {
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(eventsChangedEvent));
        triggerEventCompletedNotification(eventId);
        return { error: "" };
      }
      return { error: mapCompletionError(upd.error) };
    }
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(eventsChangedEvent));
    triggerEventCompletedNotification(eventId);
    return { error: "" };
  }
}
