import { describe, it, expect } from "vitest";
import { getDueEvents } from "@/lib/notifications";
import type { AcademicEvent } from "@/lib/academic-events";

function toISO(offset: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ev(overrides: Partial<AcademicEvent> & { comision_id?: string | null }): AcademicEvent {
  const base: AcademicEvent = {
    id: "ev-1",
    title: "Test",
    type: "parcial",
    date: toISO(0),
    time: null,
    subject_id: "subject-asi",
    subject_code: "ASI",
    description: null,
    status: "pending",
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    event_type: "individual",
    completed_by: null,
    completed_at: null,
  };
  return { ...base, ...overrides } as unknown as AcademicEvent;
}

describe("notifications slice3 — getDueEvents scoping", () => {
  it("without enrollments returns all due in window", () => {
    const events = [ev({ id: "a", date: toISO(0), subject_id: "subject-asi", comision_id: "4K1" } as unknown as Partial<AcademicEvent>), ev({ id: "b", date: toISO(1), subject_id: "subject-red", comision_id: "4K2" } as unknown as Partial<AcademicEvent>)];
    expect(getDueEvents(events)).toHaveLength(2);
    expect(getDueEvents(events, new Map())).toHaveLength(2);
  });

  it("scopes due events via enrollments map", () => {
    const events = [
      ev({ id: "a", date: toISO(0), subject_id: "subject-asi", comision_id: "4K1" } as unknown as Partial<AcademicEvent>),
      ev({ id: "b", date: toISO(0), subject_id: "subject-asi", comision_id: "4K2" } as unknown as Partial<AcademicEvent>),
      ev({ id: "c", date: toISO(0), subject_id: "subject-red", comision_id: null } as unknown as Partial<AcademicEvent>),
      ev({ id: "d", date: toISO(0), subject_id: null, comision_id: null } as unknown as Partial<AcademicEvent>),
    ];
    const enrollments = new Map<string, string>([["subject-asi", "4K1"]]);
    const due = getDueEvents(events, enrollments);
    expect(due.map((e) => e.id).sort()).toEqual(["a", "c", "d"].sort());
    expect(due.map((e) => e.id)).not.toContain("b");
  });

  it("feriado/global (comision null) always visible even with enrollments", () => {
    const events = [ev({ id: "f", date: toISO(0), subject_id: "subject-asi", comision_id: null } as unknown as Partial<AcademicEvent>)];
    const enrollments = new Map<string, string>([["subject-asi", "4K2"]]);
    expect(getDueEvents(events, enrollments)).toHaveLength(1);
  });

  it("filters out cancelled/completed regardless of comision", () => {
    const events = [
      ev({ id: "a", date: toISO(0), status: "cancelled", comision_id: "4K1" } as unknown as Partial<AcademicEvent>),
      ev({ id: "b", date: toISO(0), status: "completed", comision_id: "4K1" } as unknown as Partial<AcademicEvent>),
    ];
    const enrollments = new Map<string, string>([["subject-asi", "4K1"]]);
    expect(getDueEvents(events, enrollments)).toHaveLength(0);
  });
});
