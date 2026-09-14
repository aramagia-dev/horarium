import { describe, it, expect } from "vitest";
import { getElectiveOnlySubjectIds } from "@/lib/enrollments";

describe("getElectiveOnlySubjectIds", () => {
  it("marks subjects with only Electivas sessions", () => {
    const sessions = [
      { subjectId: "s-ago", section: "Electivas" },
      { subjectId: "s-pad", section: "Electivas" },
      { subjectId: "s-asi", section: "Teoría" },
      { subjectId: "s-asi", section: "Práctica" },
    ];
    const out = getElectiveOnlySubjectIds(sessions);
    expect(out.has("s-ago")).toBe(true);
    expect(out.has("s-pad")).toBe(true);
    expect(out.has("s-asi")).toBe(false);
  });

  it("supports subject_id shaped rows and ignores empty sections", () => {
    const sessions = [
      { subject_id: "s-fux", section: "Electivas" },
      { subject_id: "s-mix", section: "Electivas" },
      { subject_id: "s-mix", section: "Teoría" },
      { subject_id: "s-empty", section: "" },
    ];
    const out = getElectiveOnlySubjectIds(sessions);
    expect(out.has("s-fux")).toBe(true);
    expect(out.has("s-mix")).toBe(false);
    expect(out.has("s-empty")).toBe(false);
  });
});
