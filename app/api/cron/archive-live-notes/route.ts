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
 * POST /api/cron/archive-live-notes
 * Guarded by CRON_SECRET (x-cron-secret or Authorization Bearer).
 * Idempotent: UPDATE live_notes SET status='archived', archived_at=now()
 *             WHERE status='live' AND expires_at <= now()
 * Returns {archived: number}
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
    if (ids.length === 0) return json({ archived: 0 });

    const { data: updated, error: updErr } = await supabase
      .from("live_notes")
      .update({ status: "archived", archived_at: nowIso })
      .in("id", ids)
      .eq("status", "live")
      .select("id");

    if (updErr) throw updErr;
    const archived = (updated ?? []).length;
    return json({ archived });
  } catch (e) {
    console.error("[POST cron archive-live-notes] error", e);
    return json({ error: "Internal error" }, 500);
  }
}

// Allow GET for manual testing/Vercel Cron that may use GET
export async function GET(req: Request) {
  return POST(req);
}
