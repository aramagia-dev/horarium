import { describe, it, expect } from "vitest";
import { getComisionYear, getSubjectYears, sortSubjectsForPicking } from "@/lib/enrollments";

describe("getComisionYear", () => {
  it("returns first char for 3K/4K codes", () => {
    expect(getComisionYear("3K1")).toBe("3");
    expect(getComisionYear("3K5")).toBe("3");
    expect(getComisionYear("4K1")).toBe("4");
    expect(getComisionYear("4K8")).toBe("4");
  });
  it("returns empty for unknown/empty", () => {
    expect(getComisionYear("")).toBe("");
    expect(getComisionYear(null as unknown as string)).toBe("");
    expect(getComisionYear(undefined as unknown as string)).toBe("");
  });
  it("returns first char even for other strings", () => {
    expect(getComisionYear("XYZ")).toBe("X");
  });
});

describe("getSubjectYears", () => {
  it("derives years per subject from available comisiones", () => {
    const available = new Map<string, string[]>([
      ["s-dsi", ["3K1", "4K1"]],
      ["s-anu", ["3K1"]],
      ["s-red", ["4K1", "4K2"]],
      ["s-fux", ["3K5"]],
    ]);
    const years = getSubjectYears(available);
    expect(years.get("s-dsi")).toEqual(["3", "4"]);
    expect(years.get("s-anu")).toEqual(["3"]);
    expect(years.get("s-red")).toEqual(["4"]);
    expect(years.get("s-fux")).toEqual(["3"]);
  });
  it("cross-year subjects appear under both years", () => {
    const available = new Map<string, string[]>([["s-mix", ["3K2", "4K3"]]]);
    const years = getSubjectYears(available);
    expect(years.get("s-mix")).toEqual(["3", "4"]);
    // filtering simulation
    const filterBy = (year: string) =>
      Array.from(years.entries())
        .filter(([, yrs]) => yrs.includes(year))
        .map(([id]) => id);
    expect(filterBy("3")).toContain("s-mix");
    expect(filterBy("4")).toContain("s-mix");
  });
  it("empty available yields empty map", () => {
    expect(getSubjectYears(new Map()).size).toBe(0);
  });
});

describe("sortSubjectsForPicking section-based", () => {
  it("puts subjects with only Electivas sections last (SIN-in-3K1 case)", () => {
    const subjects = [
      { id: "s-dsi", code: "DSI" },
      { id: "s-sin", code: "SIN" },
      { id: "s-anu", code: "ANU" },
    ];
    const available = new Map<string, string[]>([
      ["s-dsi", ["3K1"]],
      ["s-sin", ["3K1"]],
      ["s-anu", ["3K1"]],
    ]);
    const sessions = [
      { subjectId: "s-dsi", section: "Teoría" },
      { subjectId: "s-dsi", section: "Práctica" },
      { subjectId: "s-sin", section: "Electivas" },
      { subjectId: "s-anu", section: "Teoría" },
      { subjectId: "s-anu", section: "Práctica" },
    ];
    const sorted = sortSubjectsForPicking(subjects, available, sessions);
    expect(sorted.map((s) => s.id)).toEqual(["s-dsi", "s-anu", "s-sin"]);
  });

  it("3K5 electives with single Electivas session are last", () => {
    const subjects = [
      { id: "s-dsi", code: "DSI" },
      { id: "s-fux", code: "FUX" },
      { id: "s-dux", code: "DUX" },
    ];
    const available = new Map<string, string[]>([
      ["s-dsi", ["3K1"]],
      ["s-fux", ["3K5"]],
      ["s-dux", ["3K5"]],
    ]);
    const sessions = [
      { subjectId: "s-dsi", section: "Teoría" },
      { subjectId: "s-dsi", section: "Práctica" },
      { subjectId: "s-fux", section: "Electivas" },
      { subjectId: "s-dux", section: "Electivas" },
    ];
    const sorted = sortSubjectsForPicking(subjects, available, sessions);
    // core first, electives last, stable within groups
    expect(sorted.map((s) => s.id)).toEqual(["s-dsi", "s-fux", "s-dux"]);
  });

  it("subject with mixed sections (Teoría+Electivas) is NOT elective", () => {
    const subjects = [
      { id: "s-mix", code: "MIX" },
      { id: "s-elec", code: "ELEC" },
    ];
    const available = new Map<string, string[]>([
      ["s-mix", ["3K1"]],
      ["s-elec", ["3K5"]],
    ]);
    const sections = new Map<string, string[]>([
      ["s-mix", ["Teoría", "Electivas"]],
      ["s-elec", ["Electivas"]],
    ]);
    const sorted = sortSubjectsForPicking(subjects, available, sections);
    expect(sorted.map((s) => s.id)).toEqual(["s-mix", "s-elec"]);
  });

  it("accepts Map<string, Set<string>> as sections", () => {
    const subjects = [
      { id: "s-a", code: "A" },
      { id: "s-b", code: "B" },
    ];
    const available = new Map<string, string[]>([
      ["s-a", ["3K1"]],
      ["s-b", ["3K5"]],
    ]);
    const sections = new Map<string, Set<string>>([
      ["s-a", new Set(["Teoría", "Práctica"])],
      ["s-b", new Set(["Electivas"])],
    ]);
    const sorted = sortSubjectsForPicking(subjects, available, sections);
    expect(sorted.map((s) => s.id)).toEqual(["s-a", "s-b"]);
  });

  it("fallback to comision-based when no sections provided (backward compat)", () => {
    const subjects = [
      { id: "s1", code: "A" },
      { id: "s2", code: "B" },
    ];
    const available = new Map<string, string[]>([
      ["s1", ["4K1"]],
      ["s2", ["4K6"]],
    ]);
    const sorted = sortSubjectsForPicking(subjects, available);
    expect(sorted.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("year filtering leaves cross-year subjects visible in both", () => {
    const subjects = [
      { id: "s-dsi", code: "DSI" },
      { id: "s-anu", code: "ANU" },
      { id: "s-eco", code: "ECO" },
    ];
    const available = new Map<string, string[]>([
      ["s-dsi", ["3K1", "4K1"]], // spans both
      ["s-anu", ["3K1"]],
      ["s-eco", ["4K1"]],
    ]);
    const years = getSubjectYears(available);
    const filterByYear = (year: "3" | "4") => subjects.filter((s) => (years.get(s.id) ?? []).includes(year));
    expect(filterByYear("3").map((s) => s.id)).toEqual(["s-dsi", "s-anu"]);
    expect(filterByYear("4").map((s) => s.id)).toEqual(["s-dsi", "s-eco"]);
    // ensure sorting still works after filtering via sections
    const sessions = [
      { subjectId: "s-dsi", section: "Teoría" },
      { subjectId: "s-dsi", section: "Práctica" },
      { subjectId: "s-anu", section: "Teoría" },
      { subjectId: "s-anu", section: "Práctica" },
      { subjectId: "s-eco", section: "Teoría" },
      { subjectId: "s-eco", section: "Práctica" },
    ];
    const sorted3 = sortSubjectsForPicking(filterByYear("3"), available, sessions);
    expect(sorted3.map((s) => s.id)).toContain("s-dsi");
    const sorted4 = sortSubjectsForPicking(filterByYear("4"), available, sessions);
    expect(sorted4.map((s) => s.id)).toContain("s-dsi");
  });

  it("default-year behavior: 4 shows only 4th-year subjects, 3 shows only 3rd", () => {
    const available = new Map<string, string[]>([
      ["s-3only", ["3K2"]],
      ["s-4only", ["4K1"]],
      ["s-both", ["3K3", "4K2"]],
    ]);
    const years = getSubjectYears(available);
    const subjects = [{ id: "s-3only", code: "A" }, { id: "s-4only", code: "B" }, { id: "s-both", code: "C" }];
    const filtered4 = subjects.filter((s) => (years.get(s.id) ?? []).includes("4"));
    const filtered3 = subjects.filter((s) => (years.get(s.id) ?? []).includes("3"));
    expect(filtered4.map((s) => s.id)).toEqual(["s-4only", "s-both"]);
    expect(filtered3.map((s) => s.id)).toEqual(["s-3only", "s-both"]);
  });
});
