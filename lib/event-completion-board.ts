import { isEventOverdue } from "@/lib/academic-events";
import type { EnrichedEvent, Completer, EventType, AcademicEvent } from "@/lib/academic-events";

export type { Completer, EnrichedEvent, EventType };

export type CompletionFilter = "pendientes" | "completados" | "todos" | "vencidos";

export function filterEventsByCompletion(
  events: EnrichedEvent[],
  filter: CompletionFilter,
): EnrichedEvent[] {
  if (filter === "pendientes") return events.filter((e) => !e.isCompletedByMe);
  if (filter === "completados") return events.filter((e) => e.isCompletedByMe);
  if (filter === "vencidos") return events.filter((e) => isEventOverdue(e as AcademicEvent, e.isCompletedByMe));
  return [...events];
}

export function getCompletionCounts(events: EnrichedEvent[]): {
  pendientes: number;
  completados: number;
  todos: number;
  vencidos: number;
} {
  const pendientes = events.filter((e) => !e.isCompletedByMe).length;
  const completados = events.filter((e) => e.isCompletedByMe).length;
  const todos = events.length;
  const vencidos = events.filter((e) => isEventOverdue(e as AcademicEvent, e.isCompletedByMe)).length;
  return { pendientes, completados, todos, vencidos };
}

export function sortEventsAsc(events: EnrichedEvent[]): EnrichedEvent[] {
  return [...events].sort(
    (a, b) =>
      `${a.date}${a.time?.slice(0, 5) ?? "99:99"}`.localeCompare(
        `${b.date}${b.time?.slice(0, 5) ?? "99:99"}`,
      ),
  );
}

export function sortForTodos(events: EnrichedEvent[]): EnrichedEvent[] {
  const pending = sortEventsAsc(events.filter((e) => !e.isCompletedByMe));
  const done = sortEventsAsc(events.filter((e) => e.isCompletedByMe));
  return [...pending, ...done];
}

export function getVisibleAvatars(
  completers: Completer[],
  max = 3,
): { visible: Completer[]; extra: number } {
  const visible = completers.slice(0, max);
  const extra = Math.max(0, completers.length - max);
  return { visible, extra };
}

export function formatAvatarBadge(completers: Completer[], eventType: EventType): string {
  if (completers.length === 0) return "";
  if (eventType === "grupal") {
    const name = completers[0]?.display_name?.trim() || "alguien";
    return `Completado por ${name} (grupal)`;
  }
  if (completers.length === 1) {
    const name = completers[0]?.display_name?.trim() || "alguien";
    return `Completado por ${name}`;
  }
  const first = completers[0]?.display_name?.trim() || "Alguien";
  return `${first} y +${completers.length - 1} completaron`;
}

export function getEmptyState(
  visibleCount: number,
  filter: CompletionFilter,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _totalCount?: number,
): { title: string; subtitle: string; ctas: CompletionFilter[] } | null {
  if (visibleCount !== 0) return null;
  if (filter === "pendientes") {
    return {
      title: "¡Estás al día!",
      subtitle: "No tenés pendientes. Todo completado.",
      ctas: ["completados", "todos"],
    };
  }
  return {
    title: "No hay eventos para mostrar",
    subtitle: "Las fechas importantes de la cursada van a aparecer acá.",
    ctas: [],
  };
}
