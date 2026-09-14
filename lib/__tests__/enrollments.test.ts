import { describe, it, expect } from "vitest";
import { getEnrolledSchedule, isEventVisible, type EnrollmentMap } from "@/lib/enrollments";
import type { ScheduleEntry } from "@/lib/schedule-data";

function entry(overrides: Partial<ScheduleEntry>): ScheduleEntry {
  return {
    id: "test-id",
    subjectId: "subject-asi",
    subject: "Administración de Sistemas de Información",
    code: "ASI",
    accent: "violet",
    day: "Monday",
    start: "16:15",
    end: "18:30",
    section: "Teoría",
    professor: "Cordero",
    room: "Sin asignar",
    ...overrides,
  } as ScheduleEntry;
}

describe("enrollments — getEnrolledSchedule", () => {
  it("empty map returns full schedule (backward compat)", () => {
    const schedule = [
      entry({ id: "a", subjectId: "subject-asi", comisionId: "4K1" }),
      entry({ id: "b", subjectId: "subject-asi", comisionId: "4K2" }),
      entry({ id: "c", subjectId: "subject-red", comisionId: "4K1" }),
    ] as ScheduleEntry[];
    const enrollments: EnrollmentMap = new Map();
    const result = getEnrolledSchedule(schedule, enrollments);
    expect(result).toHaveLength(3);
    expect(result).toEqual(schedule);
  });

  it("keeps only matching comision for enrolled subject", () => {
    const schedule = [
      entry({ id: "a", subjectId: "subject-asi", comisionId: "4K1" }),
      entry({ id: "b", subjectId: "subject-asi", comisionId: "4K2" }),
      entry({ id: "c", subjectId: "subject-asi", comisionId: "4K3" }),
    ] as ScheduleEntry[];
    const enrollments: EnrollmentMap = new Map([["subject-asi", "4K2"]]);
    const result = getEnrolledSchedule(schedule, enrollments);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b");
  });

  it("mismatch drops non-matching sessions", () => {
    const schedule = [
      entry({ id: "a", subjectId: "subject-asi", comisionId: "4K1" }),
      entry({ id: "b", subjectId: "subject-asi", comisionId: "4K2" }),
    ] as ScheduleEntry[];
    const enrollments: EnrollmentMap = new Map([["subject-asi", "4K1"]]);
    const result = getEnrolledSchedule(schedule, enrollments);
    expect(result.map((e) => e.id)).toEqual(["a"]);
    expect(result.map((e) => e.id)).not.toContain("b");
  });

  it("legacy NULL sessions always visible even when enrollments non-empty", () => {
    const schedule = [
      entry({ id: "legacy", subjectId: "subject-asi", comisionId: null }),
      entry({ id: "legacy-undef", subjectId: "subject-asi" }),
      entry({ id: "scoped", subjectId: "subject-asi", comisionId: "4K2" }),
    ] as ScheduleEntry[];
    const enrollments: EnrollmentMap = new Map([["subject-asi", "4K1"]]);
    const result = getEnrolledSchedule(schedule, enrollments);
    expect(result.map((e) => e.id)).toContain("legacy");
    expect(result.map((e) => e.id)).toContain("legacy-undef");
    expect(result.map((e) => e.id)).not.toContain("scoped");
  });

  it("mixable: filters per subject independently", () => {
    const schedule = [
      entry({ id: "asi-k1", subjectId: "subject-asi", comisionId: "4K1" }),
      entry({ id: "asi-k2", subjectId: "subject-asi", comisionId: "4K2" }),
      entry({ id: "red-k1", subjectId: "subject-red", comisionId: "4K1" }),
      entry({ id: "red-k2", subjectId: "subject-red", comisionId: "4K2" }),
      entry({ id: "red-legacy", subjectId: "subject-red", comisionId: null }),
    ] as ScheduleEntry[];
    const enrollments: EnrollmentMap = new Map([
      ["subject-asi", "4K1"],
      ["subject-red", "4K2"],
    ]);
    const result = getEnrolledSchedule(schedule, enrollments);
    expect(result.map((e) => e.id)).toEqual(expect.arrayContaining(["asi-k1", "red-k2", "red-legacy"]));
    expect(result.map((e) => e.id)).not.toContain("asi-k2");
    expect(result.map((e) => e.id)).not.toContain("red-k1");
  });

  it("subject not in enrollments → scoped sessions dropped", () => {
    const schedule = [
      entry({ id: "ago-k6", subjectId: "subject-ago", comisionId: "4K6" }),
      entry({ id: "ago-legacy", subjectId: "subject-ago", comisionId: null }),
    ] as ScheduleEntry[];
    const enrollments: EnrollmentMap = new Map([["subject-asi", "4K1"]]);
    const result = getEnrolledSchedule(schedule, enrollments);
    expect(result.map((e) => e.id)).toContain("ago-legacy");
    expect(result.map((e) => e.id)).not.toContain("ago-k6");
  });

  it("empty-enrollment fallback returns full schedule including scoped", () => {
    const schedule = [
      entry({ id: "a", subjectId: "subject-asi", comisionId: "4K1" }),
      entry({ id: "b", subjectId: "subject-asi", comisionId: "4K2" }),
    ] as ScheduleEntry[];
    const enrollments: EnrollmentMap = new Map();
    expect(getEnrolledSchedule(schedule, enrollments)).toHaveLength(2);
  });
});

describe("enrollments — isEventVisible", () => {
  it("global event (comision_id NULL) always visible", () => {
    const enrollments: EnrollmentMap = new Map([["subject-asi", "4K1"]]);
    expect(isEventVisible({ subject_id: "subject-asi", comision_id: null }, enrollments)).toBe(true);
    expect(isEventVisible({ subject_id: "subject-red", comision_id: null }, new Map([["subject-red", "4K2"]]))).toBe(true);
  });

  it("subject-less global events always visible", () => {
    const enrollments: EnrollmentMap = new Map([["subject-asi", "4K1"]]);
    expect(isEventVisible({ subject_id: null, comision_id: null }, enrollments)).toBe(true);
    expect(isEventVisible({ subject_id: null, comision_id: "4K1" }, enrollments)).toBe(true);
    expect(isEventVisible({ subject_id: null, comision_id: "4K1" }, new Map())).toBe(true);
  });

  it("scoped event visible when enrollment matches", () => {
    const enrollments: EnrollmentMap = new Map([["subject-asi", "4K2"]]);
    expect(isEventVisible({ subject_id: "subject-asi", comision_id: "4K2" }, enrollments)).toBe(true);
  });

  it("scoped event not visible when enrollment mismatches", () => {
    const enrollments: EnrollmentMap = new Map([["subject-asi", "4K1"]]);
    expect(isEventVisible({ subject_id: "subject-asi", comision_id: "4K2" }, enrollments)).toBe(false);
  });

  it("scoped event not visible when subject not enrolled", () => {
    const enrollments: EnrollmentMap = new Map([["subject-asi", "4K1"]]);
    expect(isEventVisible({ subject_id: "subject-red", comision_id: "4K1" }, enrollments)).toBe(false);
  });

  it("empty-enrollment fallback: scoped event visible when enrollments empty", () => {
    const enrollments: EnrollmentMap = new Map();
    expect(isEventVisible({ subject_id: "subject-asi", comision_id: "4K1" }, enrollments)).toBe(true);
    expect(isEventVisible({ subject_id: "subject-red", comision_id: "4K2" }, enrollments)).toBe(true);
  });

  it("global event visible even with empty enrollments", () => {
    expect(isEventVisible({ subject_id: "subject-asi", comision_id: null }, new Map())).toBe(true);
  });
});
