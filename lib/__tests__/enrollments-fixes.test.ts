import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isElectiveComision,
  sortSubjectsForPicking,
  getEnrolledSchedule,
  isEventVisible,
  hasSavedOnboarding,
  setSavedOnboarding,
  getSavedOnboardingKey,
} from "@/lib/enrollments";

describe("isElectiveComision", () => {
  it("identifies 4K6/4K7/4K8 as elective", () => {
    expect(isElectiveComision("4K6")).toBe(true);
    expect(isElectiveComision("4K7")).toBe(true);
    expect(isElectiveComision("4K8")).toBe(true);
  });
  it("rejects regular comisiones", () => {
    expect(isElectiveComision("4K1")).toBe(false);
    expect(isElectiveComision("4K5")).toBe(false);
    expect(isElectiveComision("")).toBe(false);
  });
});

describe("sortSubjectsForPicking electives-last", () => {
  it("puts subjects offered ONLY in elective comisiones last, stable otherwise", () => {
    const subjects = [
      { id: "s1", code: "A" },
      { id: "s2", code: "B" },
      { id: "s3", code: "C" },
      { id: "s4", code: "D" },
    ];
    const available = new Map<string, string[]>([
      ["s1", ["4K1", "4K2"]],
      ["s2", ["4K6"]],
      ["s3", ["4K1", "4K6"]],
      ["s4", ["4K7"]],
    ]);
    const sorted = sortSubjectsForPicking(subjects, available);
    expect(sorted.map((s) => s.id)).toEqual(["s1", "s3", "s2", "s4"]);
  });
  it("keeps original order within groups (stable)", () => {
    const subjects = [{ id: "a", code: "A" }, { id: "b", code: "B" }, { id: "c", code: "C" }];
    const available = new Map<string, string[]>([
      ["a", ["4K6"]],
      ["b", ["4K6"]],
      ["c", ["4K1"]],
    ]);
    expect(sortSubjectsForPicking(subjects, available).map((s) => s.id)).toEqual(["c", "a", "b"]);
  });
  it("treats missing available as non-elective (goes first)", () => {
    const subjects = [{ id: "x", code: "X" }, { id: "y", code: "Y" }];
    const available = new Map<string, string[]>([["y", ["4K6"]]]);
    expect(sortSubjectsForPicking(subjects, available).map((s) => s.id)).toEqual(["x", "y"]);
  });
});

describe("getEnrolledSchedule emptyMeansAll", () => {
  const schedule = [
    { subjectId: "s1", comisionId: "4K1", id: "a" },
    { subjectId: "s1", comisionId: "4K2", id: "b" },
    { subjectId: "s2", comisionId: "4K6", id: "c" },
    { subjectId: "s3", comisionId: null, id: "d" },
  ];
  it("empty map + emptyMeansAll true => returns all (backward compat)", () => {
    expect(getEnrolledSchedule(schedule, new Map(), { emptyMeansAll: true })).toEqual(schedule);
    expect(getEnrolledSchedule(schedule, new Map())).toEqual(schedule);
  });
  it("empty map + emptyMeansAll false => returns [] (onboarded empty calendar)", () => {
    expect(getEnrolledSchedule(schedule, new Map(), { emptyMeansAll: false })).toEqual([]);
  });
  it("non-empty map filters to enrolled comision and keeps global", () => {
    const enrollments = new Map([["s1", "4K1"]]);
    const filtered = getEnrolledSchedule(schedule, enrollments, { emptyMeansAll: false });
    expect(filtered.map((e) => e.id)).toEqual(["a", "d"]);
  });
  it('"no la curso" — row removed => subject hidden once map non-empty', () => {
    // User explicitly chose not to take s2 (elective) -> no entry for s2, but map is non-empty due to s1
    const enrollments = new Map([["s1", "4K1"]]);
    const filtered = getEnrolledSchedule(schedule, enrollments, { emptyMeansAll: false });
    // s2 (4K6 entry) should be hidden because s2 not in map
    expect(filtered.some((e) => e.subjectId === "s2")).toBe(false);
    // global entry stays
    expect(filtered.some((e) => e.id === "d")).toBe(true);
  });
});

describe("isEventVisible emptyMeansAll", () => {
  it("empty map + emptyMeansAll true => visible", () => {
    expect(isEventVisible({ subject_id: "s1", comision_id: "4K1" }, new Map(), { emptyMeansAll: true })).toBe(true);
    expect(isEventVisible({ subject_id: "s1", comision_id: "4K1" }, new Map())).toBe(true);
  });
  it("empty map + emptyMeansAll false => hidden for comision events", () => {
    expect(isEventVisible({ subject_id: "s1", comision_id: "4K1" }, new Map(), { emptyMeansAll: false })).toBe(false);
  });
  it("global events always visible regardless of emptyMeansAll", () => {
    expect(isEventVisible({ subject_id: "s1", comision_id: null }, new Map(), { emptyMeansAll: false })).toBe(true);
    expect(isEventVisible({ subject_id: null, comision_id: null }, new Map(), { emptyMeansAll: false })).toBe(true);
  });
  it("non-empty map respects enrollment", () => {
    const map = new Map([["s1", "4K1"]]);
    expect(isEventVisible({ subject_id: "s1", comision_id: "4K1" }, map, { emptyMeansAll: false })).toBe(true);
    expect(isEventVisible({ subject_id: "s1", comision_id: "4K2" }, map, { emptyMeansAll: false })).toBe(false);
    expect(isEventVisible({ subject_id: "s2", comision_id: "4K6" }, map, { emptyMeansAll: false })).toBe(false);
  });
});

describe("onboarding saved flag", () => {
  let origWindow: unknown;
  beforeEach(() => {
    origWindow = (globalThis as unknown as { window?: unknown }).window;
    const store = new Map<string, string>();
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      },
    };
  });
  afterEach(() => {
    if (origWindow === undefined) delete (globalThis as unknown as { window?: unknown }).window;
    else (globalThis as unknown as { window: unknown }).window = origWindow;
    vi.restoreAllMocks();
  });

  it("hasSavedOnboarding false initially, true after setSavedOnboarding", () => {
    expect(hasSavedOnboarding("u1")).toBe(false);
    setSavedOnboarding("u1");
    expect(hasSavedOnboarding("u1")).toBe(true);
    expect(hasSavedOnboarding("u2")).toBe(false);
  });

  it("Guardar-empty -> onboarded -> empty calendar (emptyMeansAll=false => [] )", () => {
    setSavedOnboarding("u1");
    const onboarded = new Map<string, string>().size > 0 || hasSavedOnboarding("u1");
    expect(onboarded).toBe(true);
    const schedule = [{ subjectId: "s1", comisionId: "4K1", id: "a" }];
    expect(getEnrolledSchedule(schedule, new Map(), { emptyMeansAll: !onboarded })).toEqual([]);
  });

  it('elegir-después -> not onboarded -> global view (emptyMeansAll=true => all)', () => {
    // user pressed "Elegir después": dismissed but never saved
    const onboarded = new Map<string, string>().size > 0 || hasSavedOnboarding("u1");
    expect(onboarded).toBe(false);
    const schedule = [{ subjectId: "s1", comisionId: "4K1", id: "a" }];
    expect(getEnrolledSchedule(schedule, new Map(), { emptyMeansAll: !onboarded })).toEqual(schedule);
  });

  it("getSavedOnboardingKey is stable", () => {
    expect(getSavedOnboardingKey("abc")).toBe("horarium:enrollments:saved:abc");
  });
});
