import "server-only";

import { NextResponse } from "next/server";

import { getAuthUser, getServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/push/unsubscribe { endpoint }
 * Removes this device's subscription (only the caller's own rows).
 */
export async function POST(req: Request) {
  const { user } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { endpoint?: unknown } = {};
  try {
    body = (await req.json()) as { endpoint?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 422 });
  }
  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 422 });

  try {
    const service = getServiceClient();
    const { error } = await service.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
    if (error) throw error;
  } catch (e) {
    console.error("[push unsubscribe] error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
