/**
 * In-memory rate limiter for live-notes.
 * - 5/min sliding window per user globally (across subjects) + 1/60s per user+subject
 * - Returns Retry-After in seconds for 429 handling.
 * - Server-only, not persisted across instances; Vercel edge-safe fallback still throttles single instance.
 */

const GLOBAL_WINDOW_MS = 60_000;
const GLOBAL_MAX = 5;
const PER_SUBJECT_WINDOW_MS = 60_000;
const PER_SUBJECT_MAX = 1;

type Entry = { timestamps: number[] };

const globalStore = new Map<string, Entry>();
const perSubjectStore = new Map<string, Entry>();

function prune(entry: Entry, now: number, windowMs: number) {
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
}

export function checkRateLimit(
  userId: string,
  subjectId: string,
  nowMs: number = Date.now(),
): { allowed: boolean; retryAfter?: number } {
  if (!userId || !subjectId) {
    return { allowed: false, retryAfter: 60 };
  }

  const globalKey = userId;
  const subjectKey = `${userId}:${subjectId}`;

  // Per-subject: 1 per 60s — check first because it's stricter
  let ps = perSubjectStore.get(subjectKey);
  if (!ps) {
    ps = { timestamps: [] };
    perSubjectStore.set(subjectKey, ps);
  }
  prune(ps, nowMs, PER_SUBJECT_WINDOW_MS);
  if (ps.timestamps.length >= PER_SUBJECT_MAX) {
    const oldest = ps.timestamps[0] ?? nowMs;
    const retryAfter = Math.ceil((PER_SUBJECT_WINDOW_MS - (nowMs - oldest)) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  // Global: 5 per 60s per user
  let g = globalStore.get(globalKey);
  if (!g) {
    g = { timestamps: [] };
    globalStore.set(globalKey, g);
  }
  prune(g, nowMs, GLOBAL_WINDOW_MS);
  if (g.timestamps.length >= GLOBAL_MAX) {
    const oldest = g.timestamps[0] ?? nowMs;
    const retryAfter = Math.ceil((GLOBAL_WINDOW_MS - (nowMs - oldest)) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  // Record
  ps.timestamps.push(nowMs);
  g.timestamps.push(nowMs);
  return { allowed: true };
}

/** Test helper: clear all buckets */
export function resetRateLimitForTests() {
  globalStore.clear();
  perSubjectStore.clear();
}

/** For diagnostics / testing */
export function _getBuckets() {
  return { globalStore, perSubjectStore };
}
