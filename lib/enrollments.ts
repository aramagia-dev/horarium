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

export function getSavedOnboardingKey(userId: string): string {
  return `horarium:enrollments:saved:${userId}`;
}

export function hasSavedOnboarding(userId: string | null | undefined): boolean {
  if (typeof window === "undefined" || !userId) return false;
  try {
    return window.localStorage.getItem(getSavedOnboardingKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function setSavedOnboarding(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.setItem(getSavedOnboardingKey(userId), "1");
  } catch {
    // ignore
  }
}

const ELECTIVE_COMISIONES = new Set<string>(["4K6", "4K7", "4K8"]);

export function isElectiveComision(c: string): boolean {
  return ELECTIVE_COMISIONES.has(c);
}

export function getComisionYear(c: string | null | undefined): string {
  if (typeof c !== "string" || c.length === 0) return "";
  return c.charAt(0) ?? "";
}

export function getSubjectYears(available: Map<string, string[]>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [sid, comisiones] of available.entries()) {
    const years = new Set<string>();
    for (const c of comisiones) {
      const y = getComisionYear(c);
      if (y) years.add(y);
    }
    out.set(sid, Array.from(years).sort());
  }
  return out;
}

export function sortSubjectsForPicking<T extends { id: string }>(
  subjects: T[],
  available: Map<string, string[]>,
  sessionsOrSections?: Map<string, string[] | Set<string>> | Array<{ subjectId?: string; subject_id?: string; section: string }>,
): T[] {
  let sectionsBySubject: Map<string, Set<string>> | undefined;
  if (Array.isArray(sessionsOrSections)) {
    sectionsBySubject = new Map<string, Set<string>>();
    for (const s of sessionsOrSections as Array<{ subjectId?: string; subject_id?: string; section: string }>) {
      const sid = (s.subjectId ?? s.subject_id) as string | undefined;
      const sec = s.section;
      if (!sid || !sec) continue;
      const set = sectionsBySubject.get(sid) ?? new Set<string>();
      set.add(sec);
      sectionsBySubject.set(sid, set);
    }
  } else if (sessionsOrSections instanceof Map) {
    sectionsBySubject = new Map<string, Set<string>>();
    for (const [k, v] of (sessionsOrSections as Map<string, string[] | Set<string>>).entries()) {
      if (v instanceof Set) sectionsBySubject.set(k, new Set(v as Set<string>));
      else if (Array.isArray(v)) sectionsBySubject.set(k, new Set(v as string[]));
      else sectionsBySubject.set(k, new Set<string>());
    }
  }

  const electiveOnly: T[] = [];
  const others: T[] = [];
  for (const subject of subjects) {
    const comisiones = available.get(subject.id);
    if (!comisiones || comisiones.length === 0) {
      others.push(subject);
      continue;
    }
    let onlyElective: boolean;
    if (sectionsBySubject) {
      const sections = sectionsBySubject.get(subject.id);
      if (!sections || sections.size === 0) {
        onlyElective = false;
      } else {
        onlyElective = Array.from(sections).every((sec) => sec === "Electivas");
      }
    } else {
      onlyElective = comisiones.every((c) => isElectiveComision(c));
    }
    if (onlyElective) electiveOnly.push(subject);
    else others.push(subject);
  }
  return [...others, ...electiveOnly];
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
  opts?: { emptyMeansAll?: boolean },
): T[] {
  const emptyMeansAll = opts?.emptyMeansAll ?? true;
  if (enrollments.size === 0) return emptyMeansAll ? schedule : [];
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
  opts?: { emptyMeansAll?: boolean },
): boolean {
  // subject-less global events always visible
  if (!event.subject_id) return true;
  // global events (no comision) visible to everyone
  if (!event.comision_id) return true;
  const emptyMeansAll = opts?.emptyMeansAll ?? true;
  // empty enrollments fallback — show everything when not onboarded (backward compat)
  if (enrollments.size === 0) return emptyMeansAll ? true : false;
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

export type OverlapSlot = {
  subjectId: string;
  comisionId?: string | null;
  day: string;
  start: string;
  end: string;
};

export type EnrollmentOverlap = { day: string; a: OverlapSlot; b: OverlapSlot };

function slotsOverlap(a: OverlapSlot, b: OverlapSlot): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Finds time conflicts among the user's enrolled sessions.
 * Returns one entry per overlapping pair (same day, intersecting HH:MM ranges),
 * so pickers can warn instead of silently stacking subjects in the calendar.
 */
export function findEnrollmentOverlaps<T extends OverlapSlot>(schedule: T[], enrollments: EnrollmentMap): EnrollmentOverlap[] {
  const mine = schedule.filter((entry) => {
    const enrolled = enrollments.get(entry.subjectId);
    if (enrolled === undefined) return false;
    const cid = entry.comisionId ?? null;
    return cid === null || cid === enrolled;
  });
  const byDay = new Map<string, T[]>();
  for (const entry of mine) {
    const list = byDay.get(entry.day) ?? [];
    list.push(entry);
    byDay.set(entry.day, list);
  }
  const out: EnrollmentOverlap[] = [];
  for (const [day, list] of byDay) {
    const sorted = [...list].sort((x, y) => (x.start < y.start ? -1 : x.start > y.start ? 1 : 0));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!;
        const b = sorted[j]!;
        if (b.start >= a.end) break;
        if (slotsOverlap(a, b)) out.push({ day, a, b });
      }
    }
  }
  return out;
}
