export type EnrollmentMap = Map<string, string>;

type SessionWithComision = {
  subjectId: string;
  comisionId?: string | null;
};

type EventWithComision = {
  subject_id: string | null;
  comision_id: string | null;
};

export const ENROLLMENTS_LOCAL_KEY = "horarium:enrollments:local";

export function getDismissedKey(userId: string): string {
  return `horarium:enrollments:dismissed:${userId}`;
}

export function serializeEnrollments(map: EnrollmentMap): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [k, v] of map) obj[k] = v;
  return obj;
}

export function deserializeEnrollments(obj: unknown): EnrollmentMap {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return new Map();
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out.set(k, v.trim());
  }
  return out;
}

export function loadLocalEnrollments(): EnrollmentMap {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(ENROLLMENTS_LOCAL_KEY);
    if (!raw) return new Map();
    return deserializeEnrollments(JSON.parse(raw));
  } catch {
    return new Map();
  }
}

export function saveLocalEnrollments(map: EnrollmentMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ENROLLMENTS_LOCAL_KEY, JSON.stringify(serializeEnrollments(map)));
  } catch {
    // ignore quota
  }
}

export function isOnboardingDismissed(userId: string): boolean {
  if (typeof window === "undefined" || !userId) return false;
  try {
    return window.localStorage.getItem(getDismissedKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function setOnboardingDismissed(userId: string, dismissed: boolean): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    if (dismissed) window.localStorage.setItem(getDismissedKey(userId), "1");
    else window.localStorage.removeItem(getDismissedKey(userId));
  } catch {
    // ignore
  }
}

export function shouldShowOnboarding(enrollments: EnrollmentMap, dismissed: boolean, userId: string | null): boolean {
  if (!userId) return false;
  if (enrollments.size > 0) return false;
  if (dismissed) return false;
  return true;
}

export function deriveAvailableComisiones(
  schedule: Array<{ subjectId: string; comisionId?: string | null }>,
): Map<string, string[]> {
  const acc = new Map<string, Set<string>>();
  for (const entry of schedule) {
    const cid = entry.comisionId ?? null;
    if (!cid) continue;
    const set = acc.get(entry.subjectId) ?? new Set<string>();
    set.add(cid);
    acc.set(entry.subjectId, set);
  }
  const out = new Map<string, string[]>();
  for (const [sid, set] of acc) out.set(sid, Array.from(set).sort());
  return out;
}

export function getOnboardingPreselections(available: Map<string, string[]>): EnrollmentMap {
  const out = new Map<string, string>();
  for (const [sid, comisiones] of available) {
    if (comisiones.length === 1 && comisiones[0]) out.set(sid, comisiones[0]);
  }
  return out;
}

export function getEnrolledSchedule<T extends SessionWithComision>(
  schedule: T[],
  enrollments: EnrollmentMap,
): T[] {
  if (enrollments.size === 0) return schedule;
  return schedule.filter((entry) => {
    const cid = entry.comisionId ?? null;
    if (!cid) return true;
    const enrolled = enrollments.get(entry.subjectId);
    if (enrolled === undefined) return false;
    return cid === enrolled;
  });
}

export function isEventVisible(
  event: EventWithComision,
  enrollments: EnrollmentMap,
): boolean {
  // subject-less global events always visible
  if (!event.subject_id) return true;
  // global events (no comision) visible to everyone
  if (!event.comision_id) return true;
  // empty enrollments fallback — show everything (backward compat)
  if (enrollments.size === 0) return true;
  const enrolled = enrollments.get(event.subject_id);
  if (enrolled === undefined) return false;
  return event.comision_id === enrolled;
}

export function isSameComision(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null);
}

export function shouldOverlapBeChecked(
  candidateComision: string | null | undefined,
  existingComision: string | null | undefined,
): boolean {
  return isSameComision(candidateComision, existingComision);
}
