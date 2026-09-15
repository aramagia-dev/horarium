"use client";

import { supabase } from "@/lib/supabase";

export type PushState = "unsupported" | "denied" | "off" | "on";

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function bearer(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

function authHeaders(token: string | null): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? "on" : "off";
  } catch {
    return "off";
  }
}

export async function enablePush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isPushSupported()) return { ok: false, reason: "Este navegador no soporta notificaciones push." };
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return { ok: false, reason: "Falta configurar la clave VAPID en el servidor." };
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return {
        ok: false,
        reason: permission === "denied" ? "Permiso denegado en el navegador." : "Permiso no otorgado.",
      };
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const json = sub.toJSON();
    const token = await bearer();
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    if (!res.ok) {
      await sub.unsubscribe().catch(() => {});
      return { ok: false, reason: "No se pudo registrar en el servidor." };
    }
    return { ok: true };
  } catch (e) {
    console.error("[push] enable failed", e);
    return { ok: false, reason: "No se pudo activar." };
  }
}

export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    const endpoint = sub?.endpoint ?? null;
    if (endpoint) {
      const token = await bearer();
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ endpoint }),
      }).catch(() => {});
    }
    await sub?.unsubscribe().catch(() => {});
  } catch (e) {
    console.warn("[push] disable failed", e);
  }
}

export type DispatchItem = {
  user_id: string;
  type: string;
  title: string;
  body: string;
  event_id?: string | null;
  note_id?: string | null;
  subject_id?: string | null;
  comment_id?: string | null;
};

/** Best-effort: after client-side notification inserts, fan out system push. Never throws. */
export async function dispatchPush(items: DispatchItem[]): Promise<void> {
  if (items.length === 0 || !isPushSupported()) return;
  try {
    const token = await bearer();
    if (!token) return;
    await fetch("/api/push/dispatch", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ items }),
    });
  } catch (e) {
    console.warn("[push] dispatch failed", e);
  }
}
