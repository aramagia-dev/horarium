import { describe, expect, it } from "vitest";
import { getLiveDocName, getLiveNoteExpiry, getLiveNoteDurationHours, resetDriveClientForTests } from "@/lib/google-drive";
import { checkRateLimit, resetRateLimitForTests } from "@/lib/rate-limit";

describe("getLiveDocName", () => {
  it("formats as 'CODE DD/MM/YYYY'", () => {
    const d = new Date(2026, 0, 15); // Jan 15 2026 local
    expect(getLiveDocName("ASI", d)).toBe("ASI 15/01/2026");
  });
  it("pads month/day", () => {
    const d = new Date(2026, 8, 5); // Sep 5
    expect(getLiveDocName("RDS", d)).toBe("RDS 05/09/2026");
  });
  it("uses today when no date passed", () => {
    const name = getLiveDocName("ASI");
    expect(name).toMatch(/^ASI \d{2}\/\d{2}\/\d{4}$/);
  });
  it("trims code and falls back to HOR when empty", () => {
    const d = new Date(2026, 0, 15);
    expect(getLiveDocName("  ASI  ", d)).toBe("ASI 15/01/2026");
    expect(getLiveDocName("", d)).toBe("HOR 15/01/2026");
    expect(getLiveDocName("   ", d)).toBe("HOR 15/01/2026");
  });
});

describe("getLiveNoteExpiry", () => {
  it("adds duration hours (default 4h) to from", () => {
    const from = new Date("2026-03-10T10:00:00.000Z");
    const exp = getLiveNoteExpiry(from, 4);
    expect(exp.toISOString()).toBe("2026-03-10T14:00:00.000Z");
  });
  it("respects LIVE_NOTE_DURATION_HOURS env fallback", () => {
    const prev = process.env.LIVE_NOTE_DURATION_HOURS;
    process.env.LIVE_NOTE_DURATION_HOURS = "6";
    expect(getLiveNoteDurationHours()).toBe(6);
    const from = new Date("2026-03-10T10:00:00.000Z");
    expect(getLiveNoteExpiry(from).toISOString()).toBe("2026-03-10T16:00:00.000Z");
    process.env.LIVE_NOTE_DURATION_HOURS = prev;
    resetDriveClientForTests();
  });
  it("defaults to 4 when env invalid", () => {
    const prev = process.env.LIVE_NOTE_DURATION_HOURS;
    process.env.LIVE_NOTE_DURATION_HOURS = "oops";
    expect(getLiveNoteDurationHours()).toBe(4);
    process.env.LIVE_NOTE_DURATION_HOURS = prev;
  });
});

describe("rate-limit (live-notes)", () => {
  it("allows first per-subject then blocks within 60s with retryAfter", () => {
    resetRateLimitForTests();
    const now = Date.now();
    expect(checkRateLimit("userA", "subject-red", now).allowed).toBe(true);
    const second = checkRateLimit("userA", "subject-red", now + 10_000);
    expect(second.allowed).toBe(false);
    expect(second.retryAfter).toBeGreaterThan(0);
    expect(second.retryAfter).toBeLessThanOrEqual(60);
  });

  it("allows different subject immediately (per-subject is scoped)", () => {
    resetRateLimitForTests();
    const now = Date.now();
    expect(checkRateLimit("userA", "s1", now).allowed).toBe(true);
    expect(checkRateLimit("userA", "s2", now + 1_000).allowed).toBe(true);
  });

  it("global 5/min cap blocks 6th request even on new subject", () => {
    resetRateLimitForTests();
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("userB", `s${i}`, now + i * 1_000).allowed).toBe(true);
    }
    const sixth = checkRateLimit("userB", "s5", now + 5_000);
    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfter).toBeGreaterThan(0);
  });

  it("window slides after 60s", () => {
    resetRateLimitForTests();
    const now = Date.now();
    expect(checkRateLimit("userC", "s1", now).allowed).toBe(true);
    // still blocked within window
    expect(checkRateLimit("userC", "s1", now + 30_000).allowed).toBe(false);
    // after window passes, allowed again
    expect(checkRateLimit("userC", "s1", now + 61_000).allowed).toBe(true);
  });

  it("rejects missing userId/subjectId", () => {
    resetRateLimitForTests();
    expect(checkRateLimit("", "s1").allowed).toBe(false);
    expect(checkRateLimit("u1", "").allowed).toBe(false);
  });
});
