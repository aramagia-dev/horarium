import { describe, expect, it } from "vitest";
import { DEFAULT_LEADS, leadsFor, sanitizeLeads } from "@/lib/reminder-prefs";

describe("leadsFor", () => {
  it("returns defaults when there is no stored row", () => {
    expect(leadsFor("parcial", null)).toEqual([1, 7]);
    expect(leadsFor("tarea", undefined)).toEqual([1, 2]);
    expect(leadsFor("feriado", null)).toEqual([1]);
  });

  it("returns stored leads when the key exists", () => {
    expect(leadsFor("parcial", { parcial: [3] })).toEqual([3]);
  });

  it("treats a stored empty array as explicitly disabled", () => {
    expect(leadsFor("tarea", { tarea: [] })).toEqual([]);
  });

  it("sanitizes stored values (dupes, out of range, non-integers)", () => {
    expect(leadsFor("parcial", { parcial: [7, 7, 0, 31, 2.5, "x", 3] })).toEqual([3, 7]);
  });

  it("falls back to [1] for unknown types", () => {
    expect(leadsFor("invento", null)).toEqual([1]);
    expect(leadsFor(null, null)).toEqual(DEFAULT_LEADS.otro);
  });
});

describe("sanitizeLeads", () => {
  it("returns [] for non-arrays", () => {
    expect(sanitizeLeads(null)).toEqual([]);
    expect(sanitizeLeads("7")).toEqual([]);
  });
});
