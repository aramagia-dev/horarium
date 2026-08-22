import { demoSchedule, mapRemoteSchedule, type CatalogProfessor, type CatalogRoom, type ScheduleEntry, type Subject } from "@/lib/schedule-data";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { loadAcademicEvents, type AcademicEvent } from "@/lib/academic-events";

export type PublicScheduleState = {
  schedule: ScheduleEntry[];
  subjects: Subject[];
  professors: CatalogProfessor[];
  rooms: CatalogRoom[];
  source: "supabase" | "local";
  error: string;
  events: AcademicEvent[];
  eventsError: string;
};

const localState = (error = ""): PublicScheduleState => ({
  schedule: demoSchedule,
  subjects: (demoSchedule.length ? [...new Map(demoSchedule.map((entry) => [entry.subjectId, { id: entry.subjectId, code: entry.code, name: entry.subject, accent: entry.accent }])).values()] : []),
  professors: [...new Map(demoSchedule.map((entry) => [entry.professor, { id: entry.professor, display_name: entry.professor }])).values()],
  rooms: [...new Map(demoSchedule.map((entry) => [entry.room, { id: entry.room, name: entry.room }])).values()],
  source: "local",
  error,
  events: [],
  eventsError: "",
});

export async function loadPublicSchedule(): Promise<PublicScheduleState> {
  if (!supabaseConfigured || !supabase) {
    const eventState = await loadAcademicEvents();
    return { ...localState(), events: eventState.events, eventsError: eventState.error };
  }

  const [subjectsResult, professorsResult, roomsResult, schedulesResult, eventState] = await Promise.all([
    supabase.from("subjects").select("id, code, name, accent").order("code"),
    supabase.from("professors").select("id, display_name").order("display_name"),
    supabase.from("rooms").select("id, name").order("name"),
    supabase.from("schedules").select("id, subject_id, day, start_time, end_time, section, subjects(id, code, name, accent), professors(display_name), rooms(name)").order("day").order("start_time"),
    loadAcademicEvents(),
  ]);
  const error = [subjectsResult, professorsResult, roomsResult, schedulesResult].find((result) => result.error)?.error;
  const rows = (schedulesResult.data ?? []) as never[];
  if (error || rows.length === 0) return { ...localState(error?.message ?? ""), events: eventState.events, eventsError: eventState.error };

  return {
    schedule: mapRemoteSchedule(rows as Parameters<typeof mapRemoteSchedule>[0]),
    subjects: (subjectsResult.data ?? []) as Subject[],
    professors: (professorsResult.data ?? []) as CatalogProfessor[],
    rooms: (roomsResult.data ?? []) as CatalogRoom[],
    source: "supabase",
    error: "",
    events: eventState.events,
    eventsError: eventState.error,
  };
}
