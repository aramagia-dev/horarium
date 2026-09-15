import "server-only";

import { NextResponse } from "next/server";

import { getServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const headerSecret = req.headers.get("x-cron-secret") ?? req.headers.get("X-Cron-Secret") ?? req.headers.get("x-vercel-cron-secret");
  if (headerSecret && headerSecret === secret) return true;
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m?.[1] && m[1].trim() === secret) return true;
  }
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET> when configured; also allow query fallback in dev
  const url = new URL(req.url);
  const qs = url.searchParams.get("cron_secret") ?? url.searchParams.get("secret");
  if (qs && qs === secret) return true;
  return false;
}

/**
 * Cron diario (vercel.json): dos trabajos en uno (límite de crons del plan Hobby).
 * 1. Archiva live notes vencidas (idempotente).
 * 2. Push "Se vence mañana" para eventos de mañana (AR) aún pendientes.
 * Guarded by CRON_SECRET (x-cron-secret or Authorization Bearer).
 * Returns {archived, reminders: {events, pushed}}
 */
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET) {
    return json({ error: "CRON_SECRET not configured" }, 500);
  }
  if (!isAuthorized(req)) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const supabase = getServiceClient();
    const nowIso = new Date().toISOString();

    // Fetch ids that will be archived (for count + idempotency)
    const { data: expired, error: fetchErr } = await supabase
      .from("live_notes")
      .select("id")
      .eq("status", "live")
      .lte("expires_at", nowIso);

    if (fetchErr) throw fetchErr;
    const ids = (expired ?? []).map((r: { id: string }) => r.id);

    let archived = 0;

    if (ids.length > 0) {
      const { data: updated, error: updErr } = await supabase
        .from("live_notes")
        .update({ status: "archived", archived_at: nowIso })
        .in("id", ids)
        .eq("status", "live")
        .select("id");

      if (updErr) throw updErr;
      archived = (updated ?? []).length;
    }

    // Due-tomorrow reminders (best-effort, never blocks archival reporting)
    let reminders = { events: 0, pushed: 0 };
    try {
      reminders = await sendDueReminders(supabase);
    } catch (e) {
      console.error("[POST cron archive-live-notes] reminders failed (non-fatal)", e);
    }
    return json({ archived, reminders });
  } catch (e) {
    console.error("[POST cron archive-live-notes] error", e);
    return json({ error: "Internal error" }, 500);
  }
}

// Allow GET for manual testing/Vercel Cron that may use GET
export async function GET(req: Request) {
  return POST(req);
}

// ---------------------------------------------------------------------------
// Due-tomorrow reminders: push "Se vence mañana" for pending events dated
// tomorrow in America/Argentina (UTC-3 todo el año, sin horario de verano).
// - Grupal terminada (completed_by) se saltea para todos.
// - Individual se saltea por usuario que ya la completó (completions table).
// - Con comisión: solo cursantes de esa comisión. Sin comisión: todos.
// - Push-only: no crea fila en notifications (el "Por vencer" de la campanita
//   ya cubre lo visual). Stateless: si el cron reintenta, el tag del push
//   reemplaza la tarjeta anterior en vez de apilar.
// ---------------------------------------------------------------------------
function arDate(offsetDays: number): string {
  const d = new Date(Date.now() - 3 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

type DueEvent = {
  id: string;
  title: string | null;
  date: string;
  time: string | null;
  subject_id: string | null;
  comision_id: string | null;
  status: string | null;
  event_type: string | null;
  completed_by: string | null;
};

async function sendDueReminders(
  supabase: ReturnType<typeof getServiceClient>,
): Promise<{ events: number; pushed: number }> {
  const tomorrow = arDate(1);
  const { data: rows, error: evErr } = await supabase
    .from("academic_events")
    .select("id, title, date, time, subject_id, comision_id, status, event_type, completed_by")
    .eq("date", tomorrow);
  if (evErr) throw evErr;
  // Status se filtra en código (el volumen es mínimo: solo eventos de mañana).
  const list = ((rows ?? []) as DueEvent[]).filter(
    (e) => e.id && e.date && e.status !== "cancelled" && e.status !== "completed",
  );
  if (list.length === 0) return { events: 0, pushed: 0 };

  const subjectIds = [...new Set(list.map((e) => e.subject_id).filter(Boolean))] as string[];
  const codeById = new Map<string, string>();
  if (subjectIds.length > 0) {
    const { data: subs } = await supabase.from("subjects").select("id, code").in("id", subjectIds);
    for (const s of ((subs ?? []) as Array<{ id: string; code: string | null }>)) codeById.set(s.id, s.code ?? "");
  }

  const ids = list.map((e) => e.id);
  const doneByEvent = new Map<string, Set<string>>();
  const { data: comps } = await supabase.from("academic_event_completions").select("event_id, user_id").in("event_id", ids);
  for (const c of ((comps ?? []) as Array<{ event_id: string; user_id: string }>)) {
    if (!doneByEvent.has(c.event_id)) doneByEvent.set(c.event_id, new Set());
    doneByEvent.get(c.event_id)?.add(c.user_id);
  }

  const { data: profiles } = await supabase.from("profiles").select("id").limit(1000);
  const allIds = ((profiles ?? []) as Array<{ id: string }>).map((p) => p.id).filter(Boolean);

  const { sendPushToUsers } = await import("@/lib/server-push");
  const { formatReminderBody } = await import("@/lib/push-target");
  let pushed = 0;
  let reminded = 0;
  for (const e of list) {
    if (e.event_type === "grupal" && e.completed_by) continue;
    let recipients: string[];
    if (e.subject_id && e.comision_id) {
      const { data: enrollRows } = await supabase
        .from("user_enrollments")
        .select("user_id")
        .eq("subject_id", e.subject_id)
        .eq("comision_id", e.comision_id)
        .limit(1000);
      recipients = ((enrollRows ?? []) as Array<{ user_id: string }>).map((r) => r.user_id).filter(Boolean);
      if (recipients.length === 0) continue;
    } else {
      recipients = allIds;
    }
    const done = doneByEvent.get(e.id);
    if (done) recipients = recipients.filter((id) => !done.has(id));
    if (recipients.length === 0) continue;
    const body = formatReminderBody(e.title ?? "evento", codeById.get(e.subject_id ?? "") ?? "", e.date, e.time);
    const r = await sendPushToUsers(supabase, recipients, {
      title: "Se vence mañana",
      body,
      target: { view: "events", eventId: e.id },
    });
    pushed += r.sent;
    reminded += 1;
  }
  return { events: reminded, pushed };
}
