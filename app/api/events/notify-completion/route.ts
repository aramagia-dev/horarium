import "server-only";

import { NextResponse } from "next/server";

import { getAuthUser, getServiceClient } from "@/lib/supabase-server";
import { formatEventCompletedBody } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, init?: number | ResponseInit) {
  const status = typeof init === "number" ? init : (init as ResponseInit)?.status;
  return NextResponse.json(data, { status } as ResponseInit);
}

/**
 * POST /api/events/notify-completion { eventId }
 * Fan-out grouped event_completed notifications to all users except actor.
 * Uses service_role, batches 100, vencido still notifies, best-effort.
 * Single row per (user_id, event_id) where type='event_completed' via upsert onConflict.
 */
export async function POST(req: Request) {
  const { user } = await getAuthUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: { eventId?: string } = {};
  try {
    body = (await req.json()) as { eventId?: string };
  } catch {
    return json({ error: "Invalid JSON" }, 422);
  }
  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  if (!eventId) return json({ error: "eventId required" }, 422);

  try {
    const service = getServiceClient();

    // Fetch event (title + type + completed_by)
    const { data: eventRow, error: eventErr } = await service
      .from("academic_events")
      .select("id, title, event_type, completed_by")
      .eq("id", eventId)
      .maybeSingle();
    if (eventErr) throw eventErr;
    if (!eventRow) return json({ error: "Event not found" }, 404);

    const eventTitle = (eventRow as { title: string }).title ?? "evento";
    const eventType = (eventRow as { event_type?: string }).event_type ?? "individual";
    const completedBy = (eventRow as { completed_by: string | null }).completed_by ?? null;

    // Determine completers ordered by completed_at asc
    let completers: Array<{ user_id: string; display_name: string | null; completed_at: string | null }> = [];

    if (eventType === "grupal") {
      if (completedBy) {
        const { data: prof } = await service.from("profiles").select("display_name").eq("id", completedBy).maybeSingle();
        completers = [
          {
            user_id: completedBy,
            display_name: (prof as { display_name?: string | null } | null)?.display_name ?? null,
            completed_at: null,
          },
        ];
      } else {
        // not completed -> no notification (uncomplete path shouldn't have called us)
        return json({ ok: true, skipped: "not_completed" }, 200);
      }
    } else {
      const { data: rows, error: compErr } = await service
        .from("academic_event_completions")
        .select("user_id, completed_at, profiles(display_name)")
        .eq("event_id", eventId)
        .order("completed_at", { ascending: true });
      if (compErr) throw compErr;
      completers = ((rows ?? []) as unknown as Array<{ user_id: string; completed_at: string | null; profiles?: { display_name: string | null } | null } & { profiles?: unknown }>).map((r) => ({
        user_id: r.user_id,
        display_name: (r.profiles as { display_name?: string | null } | null)?.display_name ?? null,
        completed_at: r.completed_at ?? null,
      }));
      if (completers.length === 0) {
        // fallback: actor might be the only completer but row not yet visible due to timing; use actor
        const { data: prof } = await service.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
        completers = [{ user_id: user.id, display_name: (prof as { display_name?: string | null } | null)?.display_name ?? null, completed_at: new Date().toISOString() }];
      }
    }

    if (completers.length === 0) return json({ ok: true, skipped: "no_completers" }, 200);

    const firstName = completers[0]?.display_name?.trim() || "Alguien";
    const otherCount = Math.max(0, completers.length - 1);
    const notifBody = formatEventCompletedBody(firstName, otherCount, eventTitle);
    const notifTitle = "Evento completado";

    // Recipients: all profiles except actor
    const { data: profiles, error: profErr } = await service.from("profiles").select("id").neq("id", user.id).limit(1000);
    if (profErr) throw profErr;
    const recipientIds = (profiles ?? []).map((p: { id: string }) => p.id).filter(Boolean);
    if (recipientIds.length === 0) return json({ ok: true, recipients: 0 }, 200);

    // Build rows and upsert batched 100 onConflict (user_id,event_id) for type='event_completed'
    const baseRows = recipientIds.map((uid: string) => ({
      user_id: uid,
      actor_id: user.id,
      type: "event_completed",
      title: notifTitle,
      body: notifBody,
      note_id: null,
      event_id: eventId,
      comment_id: null,
      read: false,
    }));

    for (let i = 0; i < baseRows.length; i += 100) {
      const batch = baseRows.slice(i, i + 100);
      const { error: upErr } = await (service.from("notifications") as unknown as { upsert: (rows: unknown, opts: unknown) => Promise<{ error: unknown }> }).upsert(batch, { onConflict: "user_id,event_id", ignoreDuplicates: false });
      if (upErr) throw upErr;
    }

    return json({ ok: true, recipients: recipientIds.length, body: notifBody }, 200);
  } catch (e) {
    console.error("[POST notify-completion] error", e);
    // best-effort: still return 200? but signal error for retry
    return json({ error: "Internal error" }, 500);
  }
}
