export type EnrollmentMap = Map<string, string>;

type SessionWithComision = {
  subjectId: string;
  comisionId?: string | null;
};

type EventWithComision = {
  subject_id: string | null;
  comision_id: string | null;
};

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
