// Pure push-target helpers: no browser/server deps, safe to unit test.

export type PushTarget =
  | { view: "events"; eventId?: string }
  | { view: "notes"; noteId?: string; subjectId?: string | null; commentId?: string | null };

export type PushPayload = {
  title: string;
  body: string;
  target: PushTarget;
};

/**
 * Landing URL opened from a system notification. The app consumes the `push`
 * params on mount (app-shell) and routes through the internal navigate event,
 * then cleans the URL.
 */
export function buildPushUrl(payload: PushPayload): string {
  const params = new URLSearchParams();
  params.set("push", payload.target.view);
  if (payload.target.view === "events") {
    if (payload.target.eventId) params.set("event", payload.target.eventId);
  } else {
    if (payload.target.noteId) params.set("note", payload.target.noteId);
    if (payload.target.subjectId) params.set("subject", payload.target.subjectId);
    if (payload.target.commentId) params.set("comment", payload.target.commentId);
  }
  return `/?${params.toString()}`;
}

/** Collapse key so updates to the same event/note replace each other. */
export function pushTag(payload: PushPayload): string {
  const t = payload.target;
  if (t.view === "events") return `horarium-event-${t.eventId ?? "list"}`;
  return `horarium-note-${t.noteId ?? "list"}`;
}
