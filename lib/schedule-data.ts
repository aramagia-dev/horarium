export type Day = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday";

export type Accent = "violet" | "amber" | "blue" | "rose" | "teal";

export type Subject = {
  id: string;
  code: string;
  name: string;
  accent: Accent;
};

export type ScheduleSession = {
  id: string;
  subjectId: string;
  day: Day;
  start: string;
  end: string;
  section: string;
  professor: string;
  room: string;
};

export type ScheduleEntry = ScheduleSession & {
  subjectId: string;
  subject: string;
  code: string;
  accent: Accent;
};

export const days: Day[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export const timelineEnd = "21:15";
export const timelineDisplayEnd = "22:00";
export const timeSlots = ["13:15", "14:00", "14:45", "15:30", "16:15", "17:00", "17:45", "18:15", "19:00", "19:45", "20:30", timelineEnd, timelineDisplayEnd];

export const subjects: Subject[] = [
  { id: "subject-asi", code: "ASI", name: "Administración de Sistemas de Información", accent: "violet" },
  { id: "subject-red", code: "RED", name: "Redes de Datos", accent: "blue" },
  { id: "subject-ics", code: "ICS", name: "Ingeniería y Calidad de Software", accent: "amber" },
  { id: "subject-ta", code: "TA", name: "Tecnología para la Automatización", accent: "teal" },
  { id: "subject-pad", code: "PAD", name: "Programación de Aplicaciones Distribuidas", accent: "violet" },
  { id: "subject-ago", code: "AGO", name: "Algoritmos Genéticos de Optimización Heurística", accent: "blue" },
];

export const scheduleSessions: ScheduleSession[] = [
  { id: "asi-monday-theory", subjectId: "subject-asi", day: "Monday", start: "16:15", end: "18:30", section: "Teoría", professor: "Cordero", room: "Sin asignar" },
  { id: "redes-monday-practice", subjectId: "subject-red", day: "Monday", start: "19:00", end: "21:15", section: "Práctica", professor: "Ibarra", room: "Sin asignar" },
  { id: "ics-tuesday-practice", subjectId: "subject-ics", day: "Tuesday", start: "16:15", end: "18:30", section: "Práctica", professor: "Chibilisco", room: "Sin asignar" },
  { id: "redes-tuesday-theory", subjectId: "subject-red", day: "Tuesday", start: "19:00", end: "20:30", section: "Teoría", professor: "Nazar Patricia", room: "Sin asignar" },
  { id: "ta-wednesday-theory", subjectId: "subject-ta", day: "Wednesday", start: "14:00", end: "16:15", section: "Teoría", professor: "Vega Caro", room: "Sin asignar" },
  { id: "pad-wednesday", subjectId: "subject-pad", day: "Wednesday", start: "17:45", end: "20:45", section: "Electivas", professor: "De la Cruz", room: "Sin asignar" },
  { id: "ago-thursday", subjectId: "subject-ago", day: "Thursday", start: "13:30", end: "16:15", section: "Electivas", professor: "Willy y Lizondo", room: "Sin asignar" },
  { id: "ics-thursday-theory", subjectId: "subject-ics", day: "Thursday", start: "16:15", end: "18:30", section: "Teoría", professor: "Vicente", room: "Sin asignar" },
  { id: "redes-thursday-practice", subjectId: "subject-red", day: "Thursday", start: "19:00", end: "21:15", section: "Práctica", professor: "Ibarra", room: "Sin asignar" },
  { id: "ta-friday-practice", subjectId: "subject-ta", day: "Friday", start: "14:00", end: "16:15", section: "Práctica", professor: "Canto", room: "Sin asignar" },
  { id: "asi-friday-practice", subjectId: "subject-asi", day: "Friday", start: "16:15", end: "18:30", section: "Práctica", professor: "Cele", room: "Sin asignar" },
];

const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));

export const demoSchedule: ScheduleEntry[] = scheduleSessions.map((session) => {
  const subject = subjectById.get(session.subjectId);
  if (!subject) throw new Error(`Unknown subject: ${session.subjectId}`);
  return { ...session, subject: subject.name, code: subject.code, accent: subject.accent };
});

export function getSessionsForSubject(subjectId: string) {
  return scheduleSessions.filter((session) => session.subjectId === subjectId);
}

export function minutesFromStart(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes - (13 * 60 + 15);
}

export function formatDay(day: Day) {
  return { Monday: "Lun", Tuesday: "Mar", Wednesday: "Mié", Thursday: "Jue", Friday: "Vie" }[day];
}

export function dayLabel(day: Day) {
  return { Monday: "Lunes", Tuesday: "Martes", Wednesday: "Miércoles", Thursday: "Jueves", Friday: "Viernes" }[day];
}

export type CatalogProfessor = { id: string; display_name: string };
export type CatalogRoom = { id: string; name: string };
type RemoteRelation<T> = T | T[] | null;
type RemoteSchedule = { id: string; subject_id: string; day: Day; start_time: string; end_time: string; section: string; subjects: RemoteRelation<Subject>; professors: RemoteRelation<{ display_name: string }>; rooms: RemoteRelation<{ name: string }> };

export function mapRemoteSchedule(rows: RemoteSchedule[]): ScheduleEntry[] {
  return rows.flatMap((row) => {
    const subject = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects;
    if (!subject) return [];
    const professor = Array.isArray(row.professors) ? row.professors[0] : row.professors;
    const room = Array.isArray(row.rooms) ? row.rooms[0] : row.rooms;
    return [{ id: row.id, subjectId: row.subject_id, day: row.day, start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5), section: row.section, professor: professor?.display_name ?? "Sin asignar", room: room?.name ?? "Sin asignar", subject: subject.name, code: subject.code, accent: subject.accent }];
  });
}
