import { supabase } from "@/lib/supabase";
import type { AcademicEvent } from "@/lib/academic-events";

export type NotificationType = "new_comment" | "mention" | "new_event" | "live_note";

export type Notification = {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  note_id: string | null;
  event_id: string | null;
  comment_id: string | null;
  read: boolean;
  created_at: string;
};

const MENTION_RE = /@([a-zA-Z0-9._-]{2,24})/g;

export function parseMentions(content: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  // reset lastIndex for global regex
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(content)) !== null) {
    const token = m[1]?.trim().toLowerCase();
    if (token) out.add(token);
  }
  return Array.from(out);
}

export async function createNotifications(
  items: Omit<Notification, "id" | "read" | "created_at">[],
): Promise<void> {
  if (items.length === 0) return;
  if (!supabase) return;
  const { error } = await supabase.from("notifications").insert(
    items.map((it) => ({
      user_id: it.user_id,
      actor_id: it.actor_id,
      type: it.type,
      title: it.title,
      body: it.body,
      note_id: it.note_id,
      event_id: it.event_id,
      comment_id: it.comment_id,
    })),
  );
  if (error) throw error;
}

export async function fetchNotifications(userId: string): Promise<Notification[]> {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("id, user_id, actor_id, type, title, body, note_id, event_id, comment_id, read, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as Notification[];
}

export async function markAsRead(ids: string | string[], userId: string): Promise<void> {
  if (!supabase || !userId) return;
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 0) return;
  const { error } = await supabase.from("notifications").update({ read: true }).in("id", list).eq("user_id", userId);
  if (error) throw error;
}

export async function markAllRead(userId: string): Promise<void> {
  if (!supabase || !userId) return;
  const { error } = await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
  if (error) throw error;
}

// --- event_due derived -------------------------------------------------

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getDueEvents(events: AcademicEvent[]): AcademicEvent[] {
  const now = new Date();
  const todayStr = toLocalISODate(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowStr = toLocalISODate(tomorrow);
  return events.filter((e) => {
    if (e.status === "cancelled" || e.status === "completed") return false;
    return e.date === todayStr || e.date === tomorrowStr;
  });
}

export function formatNotificationTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
