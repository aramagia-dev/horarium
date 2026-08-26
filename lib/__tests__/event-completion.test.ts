import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AcademicEvent } from "@/lib/academic-events";

// Hoisted mocks for supabase
const { mockFrom, mockGetUser } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetUser: vi.fn(async () => ({ data: { user: { id: "user-me" } }, error: null })),
}));

vi.mock("@/lib/supabase", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase")>("@/lib/supabase");
  return {
    ...actual,
    supabase: {
      from: mockFrom,
      auth: {
        getUser: mockGetUser,
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      },
    },
    supabaseConfigured: true,
  };
});

import {
  isEventOverdue,
  type EventType,
  type EnrichedEvent,
  type Completer,
} from "@/lib/academic-events";

function baseEvent(overrides: Partial<AcademicEvent> & { date: string }): AcademicEvent {
  return {
    id: "evt-1",
    title: "Test Event",
    type: "parcial",
    subject_id: null,
    subject_code: null,
    description: null,
    status: "pending",
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    time: null,
    ...overrides,
  } as unknown as AcademicEvent;
}

function setNow(isoLocal: string) {
  const [datePart, timePart] = isoLocal.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const now = new Date(y, m - 1, d, hh, mm, 0);
  vi.useFakeTimers();
  vi.setSystemTime(now);
}

describe("event-completion lib — types & EnrichedEvent", () => {
  it("EventType allows individual and grupal", () => {
    const a: EventType = "individual";
    const b: EventType = "grupal";
    expect(a).toBe("individual");
    expect(b).toBe("grupal");
  });

  it("EnrichedEvent has isCompletedByMe, completers, completedCount", () => {
    const enriched: EnrichedEvent = {
      ...baseEvent({ date: "2026-08-22" }),
      event_type: "individual",
      completed_by: null,
      completed_at: null,
      isCompletedByMe: false,
      completers: [],
      completedCount: 0,
    };
    expect(enriched.isCompletedByMe).toBe(false);
    expect(enriched.completers).toEqual([]);
    expect(enriched.completedCount).toBe(0);
  });

  it("Completer shape has user_id, display_name, avatar_url, completed_at", () => {
    const c: Completer = {
      user_id: "user-1",
      display_name: "Franco",
      avatar_url: null,
      completed_at: new Date().toISOString(),
    };
    expect(c.user_id).toBe("user-1");
    expect(c.display_name).toBe("Franco");
  });
});

describe("isEventOverdue per-me — tilde beats vencimiento", () => {
  afterEach(() => vi.useRealTimers());

  it("overdue when past date and viewer NOT completed", () => {
    setNow("2026-08-22T10:00:00");
    expect(isEventOverdue(baseEvent({ date: "2026-08-21" }), false)).toBe(true);
  });

  it("NOT overdue when past date but viewer completed (tilde beats vencimiento)", () => {
    setNow("2026-08-22T10:00:00");
    expect(isEventOverdue(baseEvent({ date: "2026-08-21" }), true)).toBe(false);
  });

  it("today with future time not overdue unless viewer pending and time passed", () => {
    setNow("2026-08-22T19:00:00");
    expect(isEventOverdue(baseEvent({ date: "2026-08-22", time: "18:00" }), false)).toBe(true);
    expect(isEventOverdue(baseEvent({ date: "2026-08-22", time: "18:00" }), true)).toBe(false);
    expect(isEventOverdue(baseEvent({ date: "2026-08-22", time: "23:00" }), false)).toBe(false);
  });

  it("overdue never when status completed/cancelled even if past", () => {
    setNow("2026-08-22T10:00:00");
    expect(isEventOverdue(baseEvent({ date: "2026-08-01", status: "completed" }), false)).toBe(false);
    expect(isEventOverdue(baseEvent({ date: "2026-08-01", status: "cancelled" }), false)).toBe(false);
  });

  it("backward compat: single arg still works (old callers)", () => {
    setNow("2026-08-22T10:00:00");
    expect(isEventOverdue(baseEvent({ date: "2026-08-21" }))).toBe(true);
    expect(isEventOverdue(baseEvent({ date: "2026-08-23" }))).toBe(false);
  });
});

describe("toggleIndividualCompletion — own-row isolate & idempotency", () => {
  beforeEach(() => vi.clearAllMocks());

  it("toggles own row: inserts when not completed, deletes when completed (isolate)", async () => {
    const { toggleIndividualCompletion } = await import("@/lib/academic-events");
    let call = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== "academic_event_completions") throw new Error("unexpected table " + table);
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => {
        if (call === 0) return { data: null, error: null };
        return { data: { event_id: "evt-1", user_id: "user-me" }, error: null };
      });
      chain.insert = vi.fn(async () => ({ error: null }));
      chain.delete = vi.fn(() => chain);
      return chain;
    });

    const res = await toggleIndividualCompletion("evt-1");
    expect(res.error).toBe("");
    expect(mockFrom).toHaveBeenCalledWith("academic_event_completions");
    call = 1; // second call would delete, but we just test first insert path
  });

  it("idempotent: double complete leaves one row (no duplicate error)", async () => {
    const { toggleIndividualCompletion } = await import("@/lib/academic-events");
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
      chain.insert = vi.fn(async () => ({ error: null }));
      chain.delete = vi.fn(() => chain);
      return chain;
    });
    const r1 = await toggleIndividualCompletion("evt-2");
    const r2 = await toggleIndividualCompletion("evt-2");
    expect(r1.error).toBe("");
    expect(r2.error).toBe("");
  });

  it("own-row isolate: does not delete other user's row", async () => {
    const { toggleIndividualCompletion } = await import("@/lib/academic-events");
    const deleteEq = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({ data: { event_id: "evt-1", user_id: "user-me" }, error: null }));
      chain.delete = vi.fn(() => ({ eq: deleteEq }));
      chain.insert = vi.fn(async () => ({ error: null }));
      return chain;
    });
    const res = await toggleIndividualCompletion("evt-1");
    expect(res.error).toBe("");
    expect(mockFrom).toHaveBeenCalled();
  });
});

describe("toggleGroupCompletion — any auth toggles shared for all", () => {
  beforeEach(() => vi.clearAllMocks());

  it("any auth can complete grupal (sets completed_by to self)", async () => {
    const { toggleGroupCompletion } = await import("@/lib/academic-events");
    mockFrom.mockImplementation((table: string) => {
      if (table !== "academic_events") throw new Error("table");
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({ data: { id: "evt-g", event_type: "grupal", completed_by: null }, error: null }));
      chain.update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
      return chain;
    });
    const res = await toggleGroupCompletion("evt-g");
    expect(res.error).toBe("");
  });

  it("any auth can uncomplete grupal (clears completed_by)", async () => {
    const { toggleGroupCompletion } = await import("@/lib/academic-events");
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({ data: { id: "evt-g", event_type: "grupal", completed_by: "user-me" }, error: null }));
      chain.update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
      return chain;
    });
    const res = await toggleGroupCompletion("evt-g");
    expect(res.error).toBe("");
  });

  it("idempotent grupal: concurrent second complete is upsert (no error)", async () => {
    const { toggleGroupCompletion } = await import("@/lib/academic-events");
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({ data: { id: "evt-g", completed_by: null }, error: null }));
      chain.update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
      return chain;
    });
    const r1 = await toggleGroupCompletion("evt-g");
    const r2 = await toggleGroupCompletion("evt-g");
    expect(r1.error).toBe("");
    expect(r2.error).toBe("");
  });
});

describe("loadAcademicEvents enrichment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enriches events with completers via profiles join and computes isCompletedByMe + completedCount", async () => {
    const { loadAcademicEvents } = await import("@/lib/academic-events");
    const fakeEvents = [
      { id: "e1", title: "T1", type: "parcial", date: "2026-08-22", time: null, subject_id: null, description: null, status: "pending", created_by: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), subjects: null, event_type: "individual", completed_by: null, completed_at: null },
    ];
    const fakeCompletions = [
      { event_id: "e1", user_id: "user-me", completed_at: new Date().toISOString(), profiles: { display_name: "Me", avatar_url: null } },
      { event_id: "e1", user_id: "user-2", completed_at: new Date().toISOString(), profiles: { display_name: "Franco", avatar_url: "http://a" } },
    ];

    mockFrom.mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.in = vi.fn(() => chain);
      if (table === "academic_events") {
        let orderCalls = 0;
        chain.select = vi.fn(() => chain);
        chain.order = vi.fn(() => {
          orderCalls++;
          if (orderCalls === 2) {
            return Promise.resolve({ data: fakeEvents, error: null }) as unknown as Record<string, unknown>;
          }
          return chain;
        });
        return chain;
      }
      if (table === "academic_event_completions") {
        chain.select = vi.fn(() => chain);
        chain.in = vi.fn(async () => ({ data: fakeCompletions, error: null }));
        return chain;
      }
      return chain;
    });

    const result = await loadAcademicEvents();
    expect(result.events.length).toBeGreaterThan(0);
    const first = result.events[0] as EnrichedEvent;
    expect(typeof first.isCompletedByMe).toBe("boolean");
    expect(Array.isArray(first.completers)).toBe(true);
    expect(typeof first.completedCount).toBe("number");
  });
});
