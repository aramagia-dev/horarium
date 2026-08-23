import { describe, it, expect, vi, afterEach } from "vitest";
import {
  startOfLocalDay,
  addLocalDays,
  getWeekStart,
  getInitialDay,
  dayForDate,
  isSameLocalDay,
  formatDateInput,
  parseDateInput,
} from "@/lib/calendar-utils";
import { formatDay } from "@/lib/schedule-data";

describe("calendar-utils", () => {
  afterEach(() => vi.useRealTimers());

  it("startOfLocalDay clears time", () => {
    const d = new Date(2026, 7, 22, 15, 30, 45);
    const s = startOfLocalDay(d);
    expect(s.getHours()).toBe(0);
    expect(s.getDate()).toBe(22);
  });

  it("addLocalDays adds days without time carry", () => {
    const base = new Date(2026, 7, 22, 23, 0);
    const next = addLocalDays(base, 1);
    expect(next.getDate()).toBe(23);
    expect(next.getHours()).toBe(0);
  });

  it("getWeekStart maps Mon-Sun to Monday", () => {
    // 2026-08-17 is Monday
    const mon = new Date(2026, 7, 17);
    const tue = new Date(2026, 7, 18);
    const sun = new Date(2026, 7, 23); // Sunday -> previous Monday
    expect(getWeekStart(mon).getDate()).toBe(17);
    expect(getWeekStart(tue).getDate()).toBe(17);
    expect(getWeekStart(sun).getDate()).toBe(17);
  });

  it("getInitialDay returns Monday for weekend", () => {
    const sat = new Date(2026, 7, 22);
    const sun = new Date(2026, 7, 23);
    const wed = new Date(2026, 7, 19);
    expect(getInitialDay(sat)).toBe("Monday");
    expect(getInitialDay(sun)).toBe("Monday");
    expect(getInitialDay(wed)).toBe("Wednesday");
  });

  it("dayForDate maps weekday to Day", () => {
    expect(dayForDate(new Date(2026, 7, 17))).toBe("Monday");
    expect(dayForDate(new Date(2026, 7, 21))).toBe("Friday");
  });

  it("isSameLocalDay compares date portion only", () => {
    const a = new Date(2026, 7, 22, 10, 0);
    const b = new Date(2026, 7, 22, 23, 59);
    const c = new Date(2026, 7, 23, 0, 0);
    expect(isSameLocalDay(a, b)).toBe(true);
    expect(isSameLocalDay(a, c)).toBe(false);
  });

  it("formatDay delegates to schedule-data without duplication", () => {
    expect(formatDay("Monday")).toBe("Lun");
  });

  it("formatDateInput and parseDateInput round-trip", () => {
    const d = new Date(2026, 0, 5);
    const s = formatDateInput(d);
    expect(s).toBe("2026-01-05");
    const parsed = parseDateInput(s)!;
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(0);
    expect(parsed.getDate()).toBe(5);
  });

  it("parseDateInput rejects invalid dates", () => {
    expect(parseDateInput("2026-02-30")).toBeNull();
    expect(parseDateInput("not-a-date")).toBeNull();
    expect(parseDateInput("2026-13-01")).toBeNull();
  });
});
