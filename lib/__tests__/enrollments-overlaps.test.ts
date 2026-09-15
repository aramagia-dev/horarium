import { describe, it, expect } from "vitest";
import { findEnrollmentOverlaps, type EnrollmentMap, type OverlapSlot } from "@/lib/enrollments";

function slot(subjectId: string, comisionId: string | null, day: string, start: string, end: string): OverlapSlot {
  return { subjectId, comisionId, day, start, end };
}

describe("findEnrollmentOverlaps", () => {
  it("returns empty when nothing overlaps", () => {
    const schedule = [
      slot("s-asi", "4K2", "Monday", "16:15", "18:30"),
      slot("s-red", "4K1", "Monday", "19:00", "21:15"),
    ];
    const enrollments: EnrollmentMap = new Map([
      ["s-asi", "4K2"],
      ["s-red", "4K1"],
    ]);
    expect(findEnrollmentOverlaps(schedule, enrollments)).toEqual([]);
  });

  it("detects an overlapping pair on the same day", () => {
    const schedule = [
      slot("s-asi", "4K2", "Monday", "16:15", "18:30"),
      slot("s-red", "4K2", "Monday", "17:00", "19:00"),
    ];
    const enrollments: EnrollmentMap = new Map([
      ["s-asi", "4K2"],
      ["s-red", "4K2"],
    ]);
    const out = findEnrollmentOverlaps(schedule, enrollments);
    expect(out).toHaveLength(1);
    expect(out[0]!.day).toBe("Monday");
    expect(out[0]!.a.subjectId).toBe("s-asi");
    expect(out[0]!.b.subjectId).toBe("s-red");
  });

  it("ignores sessions of comisiones the user is not enrolled in", () => {
    const schedule = [
      slot("s-asi", "4K2", "Monday", "16:15", "18:30"),
      // same time range but a different comision the user doesn't take
      slot("s-red", "4K1", "Monday", "16:15", "18:30"),
    ];
    const enrollments: EnrollmentMap = new Map([
      ["s-asi", "4K2"],
      ["s-red", "4K2"],
    ]);
    expect(findEnrollmentOverlaps(schedule, enrollments)).toEqual([]);
  });

  it("ignores unenrolled subjects and back-to-back sessions", () => {
    const schedule = [
      slot("s-asi", "4K2", "Monday", "16:15", "18:30"),
      slot("s-red", "4K2", "Monday", "18:30", "20:00"),
      slot("s-pad", "4K2", "Monday", "16:15", "18:30"),
    ];
    const enrollments: EnrollmentMap = new Map([
      ["s-asi", "4K2"],
      ["s-red", "4K2"],
    ]);
    expect(findEnrollmentOverlaps(schedule, enrollments)).toEqual([]);
  });

  it("keeps comision-less sessions in the check (no comision = applies to all)", () => {
    const schedule = [
      slot("s-asi", "4K2", "Tuesday", "16:15", "18:30"),
      slot("s-old", null, "Tuesday", "17:00", "19:00"),
    ];
    const enrollments: EnrollmentMap = new Map([
      ["s-asi", "4K2"],
      ["s-old", "4K2"],
    ]);
    expect(findEnrollmentOverlaps(schedule, enrollments)).toHaveLength(1);
  });
});
