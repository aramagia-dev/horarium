import { describe, it, expect } from "vitest";
import {
  deriveAvailableComisiones,
  getOnboardingPreselections,
  serializeEnrollments,
  deserializeEnrollments,
  shouldShowOnboarding,
  isSameComision,
  shouldOverlapBeChecked,
  getDismissedKey,
  ENROLLMENTS_LOCAL_KEY,
} from "@/lib/enrollments";

describe("enrollments slice3 — deriveAvailableComisiones", () => {
  it("derives distinct comisionId per subjectId sorted", () => {
    const schedule = [
      { subjectId: "subject-asi", comisionId: "4K2" },
      { subjectId: "subject-asi", comisionId: "4K1" },
      { subjectId: "subject-asi", comisionId: "4K1" },
      { subjectId: "subject-red", comisionId: "4K1" },
      { subjectId: "subject-asi", comisionId: null },
      { subjectId: "subject-asi" },
    ];
    const map = deriveAvailableComisiones(schedule);
    expect(map.get("subject-asi")).toEqual(["4K1", "4K2"]);
    expect(map.get("subject-red")).toEqual(["4K1"]);
  });

  it("ignores subjects with only null comisiones", () => {
    const schedule = [
      { subjectId: "subject-ago", comisionId: null },
      { subjectId: "subject-ago", comisionId: null },
    ];
    const map = deriveAvailableComisiones(schedule);
    expect(map.has("subject-ago")).toBe(false);
  });

  it("empty schedule yields empty map", () => {
    expect(deriveAvailableComisiones([]).size).toBe(0);
  });
});

describe("enrollments slice3 — getOnboardingPreselections", () => {
  it("pre-selects subjects with single comisión", () => {
    const available = new Map<string, string[]>([
      ["subject-asi", ["4K1"]],
      ["subject-red", ["4K1", "4K2"]],
      ["subject-ics", ["4K3"]],
    ]);
    const pre = getOnboardingPreselections(available);
    expect(pre.get("subject-asi")).toBe("4K1");
    expect(pre.get("subject-ics")).toBe("4K3");
    expect(pre.has("subject-red")).toBe(false);
    expect(pre.size).toBe(2);
  });

  it("empty available yields empty preselections", () => {
    expect(getOnboardingPreselections(new Map()).size).toBe(0);
  });
});

describe("enrollments slice3 — serialize/deserialize", () => {
  it("round-trips EnrollmentMap", () => {
    const map = new Map<string, string>([
      ["subject-asi", "4K1"],
      ["subject-red", "4K2"],
    ]);
    const obj = serializeEnrollments(map);
    expect(obj).toEqual({ "subject-asi": "4K1", "subject-red": "4K2" });
    expect(deserializeEnrollments(obj)).toEqual(map);
  });

  it("deserialize ignores non-string values", () => {
    const out = deserializeEnrollments({ a: "4K1", b: 123, c: null, d: "  " });
    expect(out.get("a")).toBe("4K1");
    expect(out.has("b")).toBe(false);
    expect(out.has("c")).toBe(false);
    expect(out.has("d")).toBe(false);
  });

  it("deserialize handles invalid input", () => {
    expect(deserializeEnrollments(null).size).toBe(0);
    expect(deserializeEnrollments("bad").size).toBe(0);
    expect(deserializeEnrollments([]).size).toBe(0);
  });
});

describe("enrollments slice3 — shouldShowOnboarding", () => {
  it("shows when logged-in, zero enrollments, not dismissed", () => {
    expect(shouldShowOnboarding(new Map(), false, "user-1")).toBe(true);
  });
  it("hides when dismissed", () => {
    expect(shouldShowOnboarding(new Map(), true, "user-1")).toBe(false);
  });
  it("hides when has enrollments", () => {
    expect(shouldShowOnboarding(new Map([["subject-asi", "4K1"]]), false, "user-1")).toBe(false);
  });
  it("hides when logged out", () => {
    expect(shouldShowOnboarding(new Map(), false, null)).toBe(false);
    expect(shouldShowOnboarding(new Map(), false, "")).toBe(false);
  });
});

describe("enrollments slice3 — comision overlap scoping", () => {
  it("isSameComision treats null/undef as equal", () => {
    expect(isSameComision(null, null)).toBe(true);
    expect(isSameComision(undefined, null)).toBe(true);
    expect(isSameComision("4K1", "4K1")).toBe(true);
    expect(isSameComision("4K1", "4K2")).toBe(false);
    expect(isSameComision("4K1", null)).toBe(false);
  });
  it("shouldOverlapBeChecked only same comision", () => {
    expect(shouldOverlapBeChecked("4K1", "4K1")).toBe(true);
    expect(shouldOverlapBeChecked(null, null)).toBe(true);
    expect(shouldOverlapBeChecked("4K1", "4K2")).toBe(false);
    expect(shouldOverlapBeChecked("4K1", null)).toBe(false);
  });
});

describe("enrollments slice3 — constants", () => {
  it("exposes local key", () => {
    expect(ENROLLMENTS_LOCAL_KEY).toBe("horarium:enrollments:local");
  });
  it("getDismissedKey per user", () => {
    expect(getDismissedKey("abc-123")).toBe("horarium:enrollments:dismissed:abc-123");
  });
});
