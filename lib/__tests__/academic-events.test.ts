import { describe, it, expect, vi, afterEach } from "vitest";
import { isEventOverdue, formatEventMonthShort, type AcademicEvent } from "@/lib/academic-events";

function event(overrides: Partial<AcademicEvent> & { date: string; time?: string | null }): AcademicEvent {
  return {
    id: "1",
    title: "Test",
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
  } as AcademicEvent;
}

function setNow(isoLocal: string) {
  // isoLocal like "2026-08-22T18:00:00"
  const [datePart, timePart] = isoLocal.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const now = new Date(y, m - 1, d, hh, mm, 0);
  vi.useFakeTimers();
  vi.setSystemTime(now);
}

describe("academic-events", () => {
  afterEach(() => vi.useRealTimers());

  it("isEventOverdue: past date is overdue regardless of time", () => {
    setNow("2026-08-22T10:00:00");
    expect(isEventOverdue(event({ date: "2026-08-21", time: "23:00" }))).toBe(true);
    expect(isEventOverdue(event({ date: "2026-08-21", time: null }))).toBe(true);
  });

  it("isEventOverdue: future date is not overdue", () => {
    setNow("2026-08-22T10:00:00");
    expect(isEventOverdue(event({ date: "2026-08-23", time: "08:00" }))).toBe(false);
  });

  it("isEventOverdue: today without time is not overdue until tomorrow", () => {
    setNow("2026-08-22T23:59:00");
    expect(isEventOverdue(event({ date: "2026-08-22", time: null }))).toBe(false);
  });

  it("isEventOverdue: today with time respects local HH:mm (UTC-3 regression)", () => {
    setNow("2026-08-22T19:00:00");
    // event at 23:00 same day should NOT be overdue yet
    expect(isEventOverdue(event({ date: "2026-08-22", time: "23:00:00" }))).toBe(false);
    // event at 18:00 already passed
    expect(isEventOverdue(event({ date: "2026-08-22", time: "18:00:00" }))).toBe(true);
    // exact minute not overdue (strict >)
    setNow("2026-08-22T18:00:00");
    expect(isEventOverdue(event({ date: "2026-08-22", time: "18:00" }))).toBe(false);
  });

  it("isEventOverdue: non-pending statuses never overdue", () => {
    setNow("2026-08-22T10:00:00");
    expect(isEventOverdue(event({ date: "2026-08-01", time: "10:00", status: "completed" }))).toBe(false);
    expect(isEventOverdue(event({ date: "2026-08-01", time: "10:00", status: "cancelled" }))).toBe(false);
  });

  it("formatEventMonthShort returns uppercase short month", () => {
    expect(formatEventMonthShort("2026-08-22")).toBe("AGO");
    expect(formatEventMonthShort("2026-05-01")).toBe("MAY");
  });
});
