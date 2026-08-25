import { describe, expect, it } from "vitest";
import { getLiveDocName, getLiveNoteExpiry, getLiveNoteDurationHours, resetDriveClientForTests } from "@/lib/google-drive";
import { checkRateLimit, resetRateLimitForTests } from "@/lib/rate-limit";

describe("getLiveDocName", () => {
  it("formats as 'Materia - YYYY-MM-DD - Apuntes en vivo'", () => {
    const d = new Date(2026, 0, 15); // Jan 15 2026 local
    expect(getLiveDocName("Redes de Datos", d)).toBe("Redes de Datos - 2026-01-15 - Apuntes en vivo");
  });
  it("pads month/day", () => {
    const d = new Date(2026, 8, 5); // Sep 5
    expect(getLiveDocName("Programación", d)).toBe("Programación - 2026-09-05 - Apuntes en vivo");
  });
  it("uses today when no date passed", () => {
    const name = getLiveDocName("Matemática");
    expect(name).toMatch(/^Matemática - \d{4}-\d{2}-\d{2} - Apuntes en vivo$/);
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
