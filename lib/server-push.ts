import "server-only";

import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildPushUrl, pushTag, type PushPayload } from "@/lib/push-target";

type StoredSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

let vapidConfigured = false;

function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:horarium-app@example.com", publicKey, privateKey);
  } catch {
    return false;
  }
  vapidConfigured = true;
  return true;
}

/**
 * Best-effort fan-out: sends a web push to every stored subscription of the
 * given users. Dead endpoints (404/410) are pruned. Never throws.
 */
export async function sendPushToUsers(
  service: SupabaseClient,
  userIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; removed: number }> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return { sent: 0, removed: 0 };
  if (!ensureVapid()) return { sent: 0, removed: 0 };

  let subs: StoredSubscription[] = [];
  try {
    const { data, error } = await service.from("push_subscriptions").select("endpoint, p256dh, auth").in("user_id", unique);
    if (error) throw error;
    subs = ((data ?? []) as StoredSubscription[]).filter((s) => s.endpoint && s.p256dh && s.auth);
  } catch (e) {
    console.error("[push] fetch subscriptions failed", e);
    return { sent: 0, removed: 0 };
  }
  if (subs.length === 0) return { sent: 0, removed: 0 };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: buildPushUrl(payload),
    tag: pushTag(payload),
  });
  const dead: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
        sent += 1;
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) dead.push(s.endpoint);
        else console.error("[push] send failed", status ?? e);
      }
    }),
  );
  if (dead.length > 0) {
    try {
      await service.from("push_subscriptions").delete().in("endpoint", dead);
    } catch (e) {
      console.error("[push] prune dead endpoints failed", e);
    }
  }
  return { sent, removed: dead.length };
}
