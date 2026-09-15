import "server-only";

import { NextResponse } from "next/server";

import { getAuthUser, getServiceClient } from "@/lib/supabase-server";
import { sendPushToUsers } from "@/lib/server-push";
import type { PushPayload } from "@/lib/push-target";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set(["new_comment", "mention", "new_event", "live_note", "event_completed"]);

type DispatchItem = {
  user_id?: unknown;
  type?: unknown;
  title?: unknown;
  body?: unknown;
  event_id?: unknown;
  note_id?: unknown;
  subject_id?: unknown;
  comment_id?: unknown;
};

function asId(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * POST /api/push/dispatch { items: [...] }
 * Client-created notifications (comments, mentions, new events) are inserted
 * from the browser, so the browser asks here to also fan out system push.
 * Anti-spam: every item must match a notification row this actor created in
 * the last 10 minutes (same recipient, type, title, body). Best-effort.
 */
export async function POST(req: Request) {
  const { user } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { items?: unknown } = {};
  try {
    body = (await req.json()) as { items?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 422 });
  }
  const raw = Array.isArray(body.items) ? (body.items as DispatchItem[]).slice(0, 100) : [];
  const items = raw
    .map((it) => ({
      user_id: asId(it.user_id),
      type: typeof it.type === "string" ? it.type : "",
      title: typeof it.title === "string" ? it.title.slice(0, 200) : "",
      body: typeof it.body === "string" ? it.body.slice(0, 500) : "",
      event_id: asId(it.event_id),
      note_id: asId(it.note_id),
      subject_id: asId(it.subject_id),
      comment_id: asId(it.comment_id),
    }))
    .filter((it) => it.user_id && ALLOWED_TYPES.has(it.type) && it.user_id !== user.id);

  if (items.length === 0) return NextResponse.json({ ok: true, pushed: 0 });

  try {
    const service = getServiceClient();
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recent, error: recentErr } = await service
      .from("notifications")
      .select("user_id, type, title, body")
      .eq("actor_id", user.id)
      .gte("created_at", since)
      .limit(500);
    if (recentErr) throw recentErr;
    const allowed = new Set(
      ((recent ?? []) as Array<{ user_id: string; type: string; title: string; body: string }>).map(
        (r) => `${r.user_id}|${r.type}|${r.title}|${r.body}`,
      ),
    );
    const verified = items.filter((it) => allowed.has(`${it.user_id}|${it.type}|${it.title}|${it.body}`));
    if (verified.length === 0) return NextResponse.json({ ok: true, pushed: 0 });

    // Group by identical content+target so one push covers all recipients.
    const groups = new Map<string, { payload: PushPayload; userIds: string[] }>();
    for (const it of verified) {
      const target: PushPayload["target"] = it.event_id
        ? { view: "events", eventId: it.event_id }
        : it.note_id
          ? { view: "notes", noteId: it.note_id, subjectId: it.subject_id, commentId: it.comment_id }
          : { view: "events" };
      const key = `${it.title}|${it.body}|${JSON.stringify(target)}`;
      const g = groups.get(key);
      if (g) g.userIds.push(it.user_id as string);
      else groups.set(key, { payload: { title: it.title, body: it.body, target }, userIds: [it.user_id as string] });
    }

    let pushed = 0;
    for (const g of groups.values()) {
      const r = await sendPushToUsers(service, g.userIds, g.payload);
      pushed += r.sent;
    }
    return NextResponse.json({ ok: true, pushed });
  } catch (e) {
    console.error("[push dispatch] error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
