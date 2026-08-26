import { describe, it, expect, vi, afterEach } from "vitest";
import type { EnrichedEvent, Completer } from "@/lib/academic-events";
import type { AcademicEvent } from "@/lib/academic-events";

// RED: these helpers do not exist yet — will fail until GREEN implements lib/event-completion-board.ts
import {
  filterEventsByCompletion,
  getCompletionCounts,
  sortEventsAsc,
  sortForTodos,
  getVisibleAvatars,
  formatAvatarBadge,
  getEmptyState,
  type CompletionFilter,
} from "@/lib/event-completion-board";

function mkEvent(overrides: Partial<EnrichedEvent> & { date: string; id: string }): EnrichedEvent {
  const base: EnrichedEvent = {
    id: overrides.id,
    title: overrides.title ?? `Event ${overrides.id}`,
    type: "parcial",
    date: overrides.date,
    time: overrides.time ?? null,
    subject_id: null,
    subject_code: null,
    description: null,
    status: (overrides.status as EnrichedEvent["status"]) ?? "pending",
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    event_type: (overrides.event_type as EnrichedEvent["event_type"]) ?? "individual",
    completed_by: overrides.completed_by ?? null,
    completed_at: overrides.completed_at ?? null,
    isCompletedByMe: overrides.isCompletedByMe ?? false,
    completers: overrides.completers ?? [],
    completedCount: overrides.completedCount ?? (overrides.completers?.length ?? 0),
  };
  return { ...base, ...overrides } as EnrichedEvent;
}

function completers(n: number, names = ["Franco", "Ana", "Luis", "Mora", "Juan"]): Completer[] {
  return Array.from({ length: n }, (_, i) => ({
    user_id: `u${i}`,
    display_name: names[i] ?? `User${i}`,
    avatar_url: i % 2 === 0 ? `https://a/${i}.png` : null,
    completed_at: new Date().toISOString(),
  }));
}

function setNow(isoLocal: string) {
  const [datePart, timePart] = isoLocal.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const now = new Date(y, m - 1, d, hh, mm, 0);
  vi.useFakeTimers();
  vi.setSystemTime(now);
}

describe("event-completion-board helpers — filter semantics & counters", () => {
  afterEach(() => vi.useRealTimers());

  it("default Pendientes hides own done (filter pendientes)", () => {
    const a = mkEvent({ id: "a", date: "2026-08-22", isCompletedByMe: false });
    const b = mkEvent({ id: "b", date: "2026-08-23", isCompletedByMe: true });
    const c = mkEvent({ id: "c", date: "2026-08-24", isCompletedByMe: false });
    const filtered = filterEventsByCompletion([a, b, c], "pendientes");
    expect(filtered.map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("Completados: own only", () => {
    const a = mkEvent({ id: "a", date: "2026-08-22", isCompletedByMe: true });
    const b = mkEvent({ id: "b", date: "2026-08-23", isCompletedByMe: false });
    expect(filterEventsByCompletion([a, b], "completados").map((e) => e.id)).toEqual(["a"]);
  });

  it("Todos: no filter", () => {
    const evs = [
      mkEvent({ id: "a", date: "2026-08-22", isCompletedByMe: true }),
      mkEvent({ id: "b", date: "2026-08-23", isCompletedByMe: false }),
    ];
    expect(filterEventsByCompletion(evs, "todos")).toHaveLength(2);
  });

  it("Vencidos excl own done — done vencido excluded even if past date", () => {
    setNow("2026-08-22T10:00:00");
    const pastDone = mkEvent({ id: "done", date: "2026-08-20", isCompletedByMe: true });
    const pastPending = mkEvent({ id: "pend", date: "2026-08-20", isCompletedByMe: false });
    const future = mkEvent({ id: "future", date: "2026-08-30", isCompletedByMe: false });
    const vencidos = filterEventsByCompletion([pastDone, pastPending, future], "vencidos");
    expect(vencidos.map((e) => e.id)).toEqual(["pend"]);
  });

  it("getCompletionCounts — pendientes/completados/todos/vencidos", () => {
    setNow("2026-08-22T10:00:00");
    const evs = [
      mkEvent({ id: "1", date: "2026-08-20", isCompletedByMe: false }),
      mkEvent({ id: "2", date: "2026-08-20", isCompletedByMe: true }),
      mkEvent({ id: "3", date: "2026-08-30", isCompletedByMe: false }),
    ];
    const counts = getCompletionCounts(evs);
    expect(counts.todos).toBe(3);
    expect(counts.pendientes).toBe(2);
    expect(counts.completados).toBe(1);
    expect(counts.vencidos).toBe(1);
  });
});

describe("sorting — pending asc, done last grayed", () => {
  it("sortEventsAsc by date+time", () => {
    const evs = [
      mkEvent({ id: "b", date: "2026-08-24", time: "18:00", isCompletedByMe: false }),
      mkEvent({ id: "a", date: "2026-08-22", time: "09:00", isCompletedByMe: false }),
      mkEvent({ id: "c", date: "2026-08-22", time: "20:00", isCompletedByMe: false }),
    ];
    const sorted = sortEventsAsc(evs);
    expect(sorted.map((e) => e.id)).toEqual(["a", "c", "b"]);
  });

  it("sortForTodos — pending first asc, then done asc", () => {
    const evs = [
      mkEvent({ id: "done-late", date: "2026-08-23", isCompletedByMe: true }),
      mkEvent({ id: "pend-early", date: "2026-08-22", isCompletedByMe: false }),
      mkEvent({ id: "done-early", date: "2026-08-22", isCompletedByMe: true }),
      mkEvent({ id: "pend-late", date: "2026-08-25", isCompletedByMe: false }),
    ];
    const sorted = sortForTodos(evs);
    expect(sorted.map((e) => e.id)).toEqual(["pend-early", "pend-late", "done-early", "done-late"]);
  });

  it("Todos bottom grayed: done events at bottom", () => {
    const evs = [
      mkEvent({ id: "d1", date: "2026-08-20", isCompletedByMe: true }),
      mkEvent({ id: "p1", date: "2026-08-22", isCompletedByMe: false }),
    ];
    const sorted = sortForTodos(evs);
    expect(sorted[sorted.length - 1].isCompletedByMe).toBe(true);
  });
});

describe("avatar stack — 3 + +N detail modal", () => {
  it("≤3 shows all without badge", () => {
    const cs = completers(2);
    const { visible, extra } = getVisibleAvatars(cs, 3);
    expect(visible).toHaveLength(2);
    expect(extra).toBe(0);
  });

  it("4 completers → 3 +1 badge", () => {
    const cs = completers(4);
    const { visible, extra } = getVisibleAvatars(cs, 3);
    expect(visible).toHaveLength(3);
    expect(extra).toBe(1);
  });

  it("5 completers → 3 +2 badge", () => {
    const cs = completers(5);
    const { extra } = getVisibleAvatars(cs, 3);
    expect(extra).toBe(2);
  });

  it("formatAvatarBadge — individual 1", () => {
    const cs = completers(1);
    expect(formatAvatarBadge(cs, "individual")).toBe("Completado por Franco");
  });

  it("formatAvatarBadge — individual 4 → first y +3", () => {
    const cs = completers(4);
    expect(formatAvatarBadge(cs, "individual")).toBe("Franco y +3 completaron");
  });

  it("formatAvatarBadge — grupal always single actor with (grupal)", () => {
    const cs = [{ user_id: "u0", display_name: "Mora", avatar_url: null, completed_at: new Date().toISOString() }];
    expect(formatAvatarBadge(cs, "grupal")).toBe("Completado por Mora (grupal)");
  });

  it("formatAvatarBadge — empty completers", () => {
    expect(formatAvatarBadge([], "individual")).toBe("");
    expect(formatAvatarBadge([], "grupal")).toBe("");
  });
});

describe("vencido precedence — tilde beats vencimiento", () => {
  afterEach(() => vi.useRealTimers());

  it("overdue excluded when viewer completed", () => {
    setNow("2026-08-22T10:00:00");
    const pastDone = mkEvent({ id: "done", date: "2026-08-20", isCompletedByMe: true });
    const counts = getCompletionCounts([pastDone]);
    expect(counts.vencidos).toBe(0);
    expect(filterEventsByCompletion([pastDone], "vencidos")).toHaveLength(0);
  });

  it("overdue when viewer NOT completed", () => {
    setNow("2026-08-22T10:00:00");
    const pastPending = mkEvent({ id: "pend", date: "2026-08-20", isCompletedByMe: false });
    expect(getCompletionCounts([pastPending]).vencidos).toBe(1);
  });
});

describe("empty state — ¡Estás al día!", () => {
  it("pendientes empty → ¡Estás al día! with CTAs", () => {
    const state = getEmptyState(0, "pendientes", 5);
    expect(state).not.toBeNull();
    expect(state!.title).toBe("¡Estás al día!");
    expect(state!.ctas).toEqual(["completados", "todos"]);
  });

  it("other filters empty → No hay eventos", () => {
    expect(getEmptyState(0, "todos", 0)!.title).toBe("No hay eventos para mostrar");
    expect(getEmptyState(0, "vencidos", 2)!.title).toBe("No hay eventos para mostrar");
    expect(getEmptyState(0, "completados", 2)!.title).toBe("No hay eventos para mostrar");
  });

  it("non-empty → null", () => {
    expect(getEmptyState(2, "pendientes", 5)).toBeNull();
  });
});

describe("grupal toggle precedence — observable via filter", () => {
  it("grupal completed isCompletedByMe true pending hide behavior like individual", () => {
    const grupalDone = mkEvent({ id: "g1", date: "2026-08-22", event_type: "grupal", completed_by: "u1", isCompletedByMe: true, completers: completers(1), completedCount: 1 });
    const pend = filterEventsByCompletion([grupalDone], "pendientes");
    expect(pend).toHaveLength(0);
    const comp = filterEventsByCompletion([grupalDone], "completados");
    expect(comp).toHaveLength(1);
  });
});
