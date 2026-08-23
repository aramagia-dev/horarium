"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from "react";
import { AtSign, Bell, CalendarCheck2, MessageCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useSchedule } from "@/lib/schedule-context";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import {
  fetchNotifications,
  formatNotificationTime,
  getDueEvents,
  markAllRead,
  markAsRead,
  type Notification,
} from "@/lib/notifications";

type Props = {
  onSelectEvent?: (eventId: string) => void;
  onSelectNote?: (subjectId: string | null, noteId: string | null, commentId?: string | null) => void;
  onNavigateView?: (view: "events" | "notes") => void;
};

export function NotificationsBell({ onSelectEvent, onSelectNote, onNavigateView }: Props) {
  const { userId } = useAuth();
  const { publicData } = useSchedule();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const dueEvents = getDueEvents(publicData?.events ?? []);
  const limitedDue = dueEvents.slice(0, 3);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const badgeText = unreadCount > 9 ? "9+" : String(unreadCount);

  const load = useCallback(async () => {
    if (!userId || !supabase) {
      setNotifications([]);
      return;
    }
    try {
      const data = await fetchNotifications(userId);
      setNotifications(data);
    } catch (e) {
      console.warn("[horarium] fetchNotifications failed", e);
    }
  }, [userId]);

  useEffect(() => {
    void load();
    if (!userId) return;
    const onFocus = () => void load();
    const onUpdated = () => void load();
    const id = window.setInterval(() => void load(), 30000);
    window.addEventListener("focus", onFocus);
    window.addEventListener("notifications-updated", onUpdated as EventListener);
    // also refresh when events change to update due section
    window.addEventListener("horarium:events-changed", onUpdated as EventListener);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("notifications-updated", onUpdated as EventListener);
      window.removeEventListener("horarium:events-changed", onUpdated as EventListener);
    };
  }, [load, userId]);

  // outside click + Escape
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // focus first button when opened
  useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>("button");
      first?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  const handleMarkAll = async () => {
    if (!userId || unreadCount === 0) return;
    try {
      await markAllRead(userId);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      window.dispatchEvent(new CustomEvent("notifications-updated"));
    } catch (e) {
      console.warn("[horarium] markAllRead failed", e);
    }
  };

  const handleSelect = async (n: Notification) => {
    if (!n.read && userId) {
      try {
        await markAsRead(n.id, userId);
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      } catch (e) {
        console.warn("[horarium] markAsRead failed", e);
      }
    }
    setOpen(false);
    if (n.event_id) {
      if (onSelectEvent) onSelectEvent(n.event_id);
      else if (onNavigateView) onNavigateView("events");
      else window.dispatchEvent(new CustomEvent("horarium:navigate", { detail: { view: "events", eventId: n.event_id } }));
    } else if (n.note_id) {
      // Obtener subject_id para dirigir a la materia correcta y resaltar la nota
      let subjectId: string | null = null;
      if (supabase) {
        try {
          const { data } = await supabase.from("notes").select("subject_id").eq("id", n.note_id).maybeSingle();
          subjectId = (data as { subject_id?: string } | null)?.subject_id ?? null;
        } catch {
          // ignore — navega igual sin materia específica
        }
      }
      const commentId = (n as { comment_id?: string | null }).comment_id ?? null;
      if (onSelectNote) onSelectNote(subjectId, n.note_id, commentId);
      else window.dispatchEvent(new CustomEvent("horarium:navigate", { detail: { view: "notes", noteId: n.note_id, subjectId, commentId } }));
    }
  };

  const handleDueClick = (eventId: string) => {
    setOpen(false);
    if (onSelectEvent) onSelectEvent(eventId);
    else if (onNavigateView) onNavigateView("events");
    else window.dispatchEvent(new CustomEvent("horarium:navigate", { detail: { view: "events", eventId } }));
  };

  const disabled = !supabaseConfigured || !userId;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Notificaciones"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        title={disabled ? "Iniciá sesión" : "Notificaciones"}
        className={`relative flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-[var(--secondary)] text-[var(--ink)] transition hover:bg-[var(--soft)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${disabled ? "opacity-60" : ""}`}
      >
        <Bell size={17} aria-hidden="true" />
        {!disabled && unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
            {badgeText}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notificaciones"
          aria-modal="false"
          className="absolute right-0 top-11 z-50 max-h-[min(70vh,480px)] w-[min(92vw,360px)] overflow-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
        >
          <div className="sticky top-0 flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Notificaciones</h2>
            {unreadCount > 0 ? (
              <button type="button" onClick={() => void handleMarkAll()} className="text-xs font-semibold text-[var(--accent)] hover:underline">
                Marcar todas como leídas
              </button>
            ) : null}
          </div>

          {/* Por vencer */}
          <div className="border-b border-[var(--line)] px-4 py-3">
            <p className="text-xs font-bold tracking-[0.12em] text-[var(--muted)] uppercase">Por vencer</p>
            {limitedDue.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--muted)]">Nada por vencer pronto.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {limitedDue.map((ev) => (
                  <li key={ev.id}>
                    <button
                      type="button"
                      onClick={() => handleDueClick(ev.id)}
                      className="flex w-full items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-left hover:bg-amber-500/15"
                    >
                      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-[var(--ink)]">{ev.title}</span>
                        <span className="block text-[11px] text-[var(--muted)]">
                          {ev.date.slice(8, 10)}/{ev.date.slice(5, 7)} {ev.time ? `· ${ev.time.slice(0, 5)}` : ""} {ev.subject_code ? `· ${ev.subject_code}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recientes */}
          <div className="px-4 py-3">
            <p className="text-xs font-bold tracking-[0.12em] text-[var(--muted)] uppercase">Recientes</p>
            {notifications.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-[var(--line)] bg-[var(--soft)]/30 px-4 py-6 text-center text-xs text-[var(--muted)]">Sin notificaciones</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => void handleSelect(n)}
                      className={`flex w-full gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:bg-[var(--soft)] ${n.read ? "border-[var(--line)] bg-[var(--surface)]" : "border-[var(--accent)]/20 bg-[var(--soft)]/40"}`}
                    >
                      <span className="mt-0.5 shrink-0 text-[var(--accent)]">
                        {n.type === "mention" ? <AtSign size={14} aria-hidden="true" /> : n.type === "new_event" ? <CalendarCheck2 size={14} aria-hidden="true" /> : <MessageCircle size={14} aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-xs font-semibold text-[var(--ink)]">{n.title}</span>
                          {!n.read ? <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" /> : null}
                        </span>
                        <span className="mt-0.5 line-clamp-2 text-xs leading-4 text-[var(--muted)]">{n.body}</span>
                        <time className="mt-1 block text-[11px] text-[var(--muted)]">{formatNotificationTime(n.created_at)}</time>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
