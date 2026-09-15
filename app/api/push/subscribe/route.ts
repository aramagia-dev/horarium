import "server-only";

import { NextResponse } from "next/server";

import { getAuthUser, getServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/push/subscribe { endpoint, keys: { p256dh, auth } }
 * Stores (or refreshes) this device's push subscription for the caller.
 */
export async function POST(req: Request) {
  const { user } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { endpoint?: unknown; keys?: unknown } = {};
  try {
    body = (await req.json()) as { endpoint?: unknown; keys?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 422 });
  }
  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  const keys = (body.keys ?? {}) as { p256dh?: unknown; auth?: unknown };
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh.trim() : "";
  const auth = typeof keys.auth === "string" ? keys.auth.trim() : "";
  if (endpoint.length < 20 || p256dh.length < 10 || auth.length < 5) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 422 });
  }

  try {
    const service = getServiceClient();
    const { error } = await service
      .from("push_subscriptions")
      .upsert({ user_id: user.id, endpoint, p256dh, auth }, { onConflict: "endpoint" });
    if (error) throw error;
  } catch (e) {
    console.error("[push subscribe] error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
