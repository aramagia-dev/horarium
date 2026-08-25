"use client";

/* eslint-disable react-hooks/set-state-in-effect */
/* Signed Supabase URLs and local data URLs are intentionally rendered without Next image optimization. */
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AlignLeft, CalendarDays, ChevronDown, FileText, Heading2, List, ListChecks, Loader2, Plus, UserRound, Users } from "lucide-react";
import {
  addLocalDays,
  formatClassDate,
  getWeekStart,
} from "@/lib/calendar-utils";
import {
  normalizeTags,
  contentFromBlocks,
  isAllowedAttachment,
  LOCAL_ATTACHMENT_LIMIT,
  REMOTE_ATTACHMENT_LIMIT,
  ATTACHMENT_BUCKET,
  normalizeBlocks,
  notesChangedEvent,
  readLocalNotes,
  writeLocalNotes,
  type LocalNote,
  type NoteAttachment,
  type NoteBlock,
  type NoteBlockType,
  type NoteStatus,
} from "@/lib/notes-storage";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import {
  formatDay,
  type ScheduleEntry,
  type ScheduleSession,
} from "@/lib/schedule-data";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { motion } from "framer-motion";
import { hoverTransition, staggerContainer, staggerItem, subtleCardHover, useReducedMotion } from "@/lib/motion";

type NoteComment = { id: string; note_id: string; author_id: string | null; content: string; created_at: string; updated_at: string };

export function SubjectModal({
  subject,
  sessions,
  date,
  legacyEntryIds = [],
  onClose,
  workspace = false,
  onOpenNotes,
  highlightNoteId = null,
  highlightCommentId = null,
}: {
  subject: ScheduleEntry;
  sessions: ScheduleSession[];
  date?: Date;
  legacyEntryIds?: string[];
  onClose: () => void;
  workspace?: boolean;
  onOpenNotes?: () => void;
  highlightNoteId?: string | null;
  highlightCommentId?: string | null;
}) {
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [draft, setDraft] = useState({
    title: "",
    blocks: [{ id: crypto.randomUUID(), type: "paragraph" as NoteBlockType, text: "" }] as NoteBlock[],
    noteDate: "",
    tags: "",
    status: "active" as NoteStatus,
    sessionId: sessions.length === 1 ? sessions[0].id : "",
  });
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachments, setAttachments] = useState<Record<string, NoteAttachment[]>>({});
  const [comments, setComments] = useState<Record<string, NoteComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [message, setMessage] = useState(
    supabaseConfigured
      ? ""
      : "Las notas se guardan en este navegador. Configurá Supabase para compartirlas.",
  );
  const { userId, isAdmin } = useAuth();
  // Live notes CTA state (MVP A — SA-owned Google Doc, max-1-live, 4h)
  const LIVE_NOTES_ENABLED = process.env.NEXT_PUBLIC_LIVE_NOTES_ENABLED !== "false";
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [liveRetryable, setLiveRetryable] = useState(false);
  const [openBlockMenuId, setOpenBlockMenuId] = useState<string | null>(null);
  const blockMenuRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"todas" | "mias" | "companeros" | "archivadas">("todas");
  const [authorMap, setAuthorMap] = useState<Record<string, { display_name?: string | null; avatar_url?: string | null }>>({});
  const [previewAttachment, setPreviewAttachment] = useState<NoteAttachment | null>(null);
  const dialogRef = useDialogA11y(!workspace, onClose);
  const previewDialogRef = useDialogA11y(Boolean(previewAttachment), () => setPreviewAttachment(null));

  const selectedSessionId = sessions.length === 1 ? sessions[0].id : draft.sessionId;
  const selectedSession = sessions.find((session) => session.id === selectedSessionId);
  const contextSession = selectedSession ?? subject;
  const classDate =
    date ??
    addLocalDays(
      getWeekStart(new Date()),
      ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].indexOf(
        contextSession.day,
      ),
    );

  const isFormVisible = showForm || editingId !== null;

  useEffect(() => {
    if (!openBlockMenuId) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!blockMenuRef.current?.contains(event.target as Node)) setOpenBlockMenuId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenBlockMenuId(null);
        window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-block-trigger="${openBlockMenuId}"]`)?.focus());
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openBlockMenuId]);

  const loadNotes = useCallback(async () => {
    const useLocal = !supabase || !userId;
    if (useLocal) {
      setNotes(
        readLocalNotes(
          subject.code,
          Array.from(new Set([subject.id, ...legacyEntryIds])),
        ),
      );
      setMessage(
        supabase && !userId
          ? "Las notas se guardan en este navegador. Iniciá sesión para compartirlas."
          : supabase
            ? ""
            : "Las notas se guardan en este navegador. Configurá Supabase para compartirlas.",
      );
      setAttachments({});
      setComments({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: initialError } = await supabase!
      .from("notes")
      .select(
        "id, author_id, title, content, blocks, note_date, tags, status, created_at, updated_at, session_id",
      )
      .eq("subject_id", subject.subjectId)
      .order("created_at", { ascending: false });
    let error = initialError;
    let noteRows: Array<Record<string, unknown>> = (data ?? []) as Array<Record<string, unknown>>;
    if (error) {
      const fallback = await supabase!.from("notes").select("id, author_id, title, content, note_date, tags, status, created_at, updated_at").eq("subject_id", subject.subjectId).order("created_at", { ascending: false });
      error = fallback.error;
      noteRows = (fallback.data ?? []) as Array<Record<string, unknown>>;
      if (!error) setMessage("La base todavía no tiene bloques; ejecutá la migración Stage 2 para habilitar todas las funciones.");
    }
    if (error) setMessage("No se pudieron cargar las notas compartidas. Revisá la migración de Stage 2.");
    else {
      setNotes(noteRows.map((note) => ({ id: String(note.id), author_id: typeof note.author_id === "string" ? note.author_id : null, title: typeof note.title === "string" ? note.title : "Sin título", content: typeof note.content === "string" ? note.content : "", blocks: normalizeBlocks(note.blocks, typeof note.content === "string" ? note.content : ""), attachments: [], note_date: typeof note.note_date === "string" ? note.note_date : null, tags: Array.isArray(note.tags) ? note.tags.map(String) : [], status: note.status === "archived" ? "archived" : "active", created_at: String(note.created_at), updated_at: String(note.updated_at), session_id: typeof note.session_id === "string" ? note.session_id : null })));
      const noteIds = noteRows.map((note) => String(note.id));
      if (noteIds.length > 0) {
        const attachmentResult = await supabase!.from("note_attachments").select("id, note_id, name, mime_type, size, storage_path, created_at").in("note_id", noteIds);
        if (!attachmentResult.error) {
          const rows = attachmentResult.data ?? [];
          const signedResults = await Promise.all(rows.map((item) => supabase!.storage.from(ATTACHMENT_BUCKET).createSignedUrl(item.storage_path, 3600)));
          const grouped: Record<string, NoteAttachment[]> = {};
          rows.forEach((item, index) => {
            const signed = signedResults[index];
            if (signed?.error) console.warn("[horarium] createSignedUrl failed", item.storage_path, signed.error);
            (grouped[item.note_id] ??= []).push({ id: item.id, name: item.name, mime_type: item.mime_type, size: item.size, path: item.storage_path, url: signed?.data?.signedUrl ?? "", created_at: item.created_at });
          });
          setAttachments(grouped);
        } else setMessage((current) => current || "Los adjuntos requieren ejecutar la migración de Stage 2.");
        const commentResult = await supabase!.from("note_comments").select("id, note_id, author_id, content, created_at, updated_at").in("note_id", noteIds).order("created_at", { ascending: true });
        if (!commentResult.error) {
          const rows = (commentResult.data ?? []) as NoteComment[];
          const groupedComments: Record<string, NoteComment[]> = {};
          const commentAuthorIds = new Set<string>();
          rows.forEach((c) => { (groupedComments[c.note_id] ??= []).push(c); if (c.author_id) commentAuthorIds.add(c.author_id); });
          setComments(groupedComments);
          if (commentAuthorIds.size > 0) {
            const noteAuthorIds = noteRows.map((n) => n.author_id).filter((id): id is string => typeof id === "string" && Boolean(id));
            const allIds = Array.from(new Set([...noteAuthorIds, ...commentAuthorIds]));
            const profileResult = await supabase!.from("profiles").select("id, display_name, avatar_url").in("id", allIds);
            if (!profileResult.error && profileResult.data) {
              const next: Record<string, { display_name?: string | null; avatar_url?: string | null }> = {};
              for (const row of profileResult.data as Array<{ id: string; display_name?: string | null; avatar_url?: string | null }>) next[row.id] = { display_name: row.display_name ?? null, avatar_url: row.avatar_url ?? null };
              if (Object.keys(next).length) setAuthorMap((prev) => ({ ...prev, ...next }));
            }
          }
        } else {
          setComments({});
        }
      } else {
        setAttachments({});
        setComments({});
      }
    }
    setLoading(false);
  }, [legacyEntryIds, subject.code, subject.id, subject.subjectId, userId]);

  useEffect(() => {
    if (!workspace) document.body.style.overflow = "hidden";
    const request = window.setTimeout(() => void loadNotes(), 0);
    return () => {
      window.clearTimeout(request);
      if (!workspace) document.body.style.overflow = "";
    };
  }, [loadNotes, workspace]);

  // ---- Live notes helpers (SA-owned Doc, max-1-live, anyone-with-link writer, external tab) ----
  function openLiveUrl(url: string) {
    // External link always — not iframe, persists after expiry as writer link
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    // Copy-link fallback (toast via message or liveError)
    void navigator.clipboard.writeText(url).catch(() => {});
    if (!opened) {
      setMessage("Se copió el enlace. Pegalo en una pestaña nueva si no se abrió automáticamente.");
    } else {
      setMessage("Apuntes en vivo abiertos en Drive. El enlace también se copió.");
    }
    // Notify bell listeners best-effort
    window.dispatchEvent(new CustomEvent("notifications-updated"));
    // Trigger refresh of board pinned card
    window.dispatchEvent(new CustomEvent("horarium:live-notes-changed", { detail: { subjectId: subject.subjectId } }));
  }

  async function handleCreateLiveNote() {
    if (!LIVE_NOTES_ENABLED) return;
    if (!userId) {
      setLiveError("Iniciá sesión para crear apuntes en vivo.");
      setLiveRetryable(false);
      return;
    }
    setLiveLoading(true);
    setLiveError("");
    setLiveRetryable(false);
    setMessage("");
    let sessionToken: string | null = null;
    try {
      const { data } = await (supabase?.auth.getSession() ?? { data: { session: null } } as unknown as { data: { session: { access_token: string } | null } });
      sessionToken = (data as { session?: { access_token?: string } | null })?.session?.access_token ?? null;
    } catch {
      sessionToken = null;
    }
    if (!sessionToken) {
      setLiveError("Sesión expirada. Iniciá sesión de nuevo.");
      setLiveLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/drive/live-note", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ subjectId: subject.subjectId }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; url?: string; existing?: boolean; code?: string; error?: string; retryable?: boolean; retryAfter?: number };
      if (res.status === 201 && data.url) {
        openLiveUrl(data.url);
        return;
      }
      if (res.status === 409 && data.url) {
        // Redirect to existing live doc (max-1 per subject)
        openLiveUrl(data.url);
        setLiveError("");
        setMessage("Ya existe un apunte en vivo para esta materia. Se abrió el documento vigente.");
        return;
      }
      if (res.status === 401) {
        setLiveError("Sesión expirada. Iniciá sesión de nuevo.");
        return;
      }
      if (res.status === 422 && data.code === "FOLDER_NOT_CONFIGURED") {
        setLiveError("Carpeta no configurada para esta materia. Contactá al administrador.");
        return;
      }
      if (res.status === 507 || data.code === "QUOTA_EXCEEDED") {
        setLiveError(data.error ?? "Cuota de Drive del Service Account excedida. Creá un Shared Drive y compartilo con el SA como Manager.");
        setLiveRetryable(false);
        return;
      }
      if (res.status === 429 || data.retryable) {
        const after = typeof data.retryAfter === "number" ? ` Reintentá en ${data.retryAfter}s.` : "";
        setLiveError((data.error ?? "Límite alcanzado. Demasiadas solicitudes.") + after);
        setLiveRetryable(true);
        return;
      }
      if (res.status === 502 || data.retryable) {
        setLiveError(data.error ?? "Drive no disponible. Reintentá en unos segundos.");
        setLiveRetryable(true);
        return;
      }
      setLiveError(data.error ?? "No se pudo crear el apunte en vivo.");
      if (data.retryable) setLiveRetryable(true);
    } catch {
      setLiveError("Error de red. Reintentá.");
      setLiveRetryable(true);
    } finally {
      setLiveLoading(false);
    }
  }

  function resetDraft() {
    setDraft({
      title: "",
      blocks: [{ id: crypto.randomUUID(), type: "paragraph", text: "" }],
      noteDate: "",
      tags: "",
      status: "active",
      sessionId: sessions.length === 1 ? sessions[0].id : "",
    });
    setPendingFiles([]);
  }

  function handleCreateClick() {
    setShowForm(true);
    // editingId stays null for create flow
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      titleInputRef.current?.focus();
    });
  }

  function handleCancelForm() {
    setEditingId(null);
    setShowForm(false);
    resetDraft();
  }

  async function saveNote(event: FormEvent) {
    event.preventDefault();
    const title = draft.title.trim() || "Sin título";
    const content = contentFromBlocks(draft.blocks);
    if (!content) return;
    const tags = normalizeTags(draft.tags.split(","));
    const now = new Date().toISOString();
    if (!supabase || !userId) {
      const localAttachments = workspace ? await Promise.all(pendingFiles.filter((file) => isAllowedAttachment(file, LOCAL_ATTACHMENT_LIMIT)).map(async (file) => ({ id: crypto.randomUUID(), name: file.name, mime_type: file.type || "application/octet-stream", size: file.size, url: await fileAsDataUrl(file), created_at: now }))) : [];
      if (pendingFiles.some((file) => !isAllowedAttachment(file, LOCAL_ATTACHMENT_LIMIT))) setMessage("Adjunto rechazado: en este navegador sólo se permiten imágenes, PDF u Office de hasta 2 MB.");
      const nextNotes = editingId
        ? notes.map((note) =>
            note.id === editingId
              ? {
                  ...note,
                  title,
                  content,
                  blocks: workspace ? draft.blocks : [{ id: note.blocks[0]?.id ?? crypto.randomUUID(), type: "paragraph" as NoteBlockType, text: content }],
                  attachments: workspace && localAttachments.length ? [...note.attachments, ...localAttachments] : note.attachments,
                  note_date: workspace ? draft.noteDate || null : note.note_date,
                  tags: workspace ? tags : note.tags,
                  status: workspace ? draft.status : note.status,
                  session_id: workspace ? selectedSessionId || null : note.session_id,
                  updated_at: now,
                }
              : note,
          )
        : [
            {
              id: crypto.randomUUID(),
              title,
              content, blocks: draft.blocks, attachments: localAttachments,
              note_date: draft.noteDate || null,
              tags,
              status: draft.status,
              session_id: selectedSessionId || null,
              created_at: now,
              updated_at: now,
            },
            ...notes,
          ];
      setNotes(nextNotes);
      if (!writeLocalNotes(subject.code, nextNotes))
        setMessage(
          "La nota se agregó en esta sesión, pero no se pudo guardar en este navegador.",
        );
      resetDraft();
      setEditingId(null);
      if (workspace) setShowForm(false);
      return;
    }
    setMessage("");
    const payload = {
      title,
      content,
      blocks: draft.blocks,
      note_date: draft.noteDate || null,
      tags,
      status: draft.status,
      session_id: selectedSessionId || null,
      updated_at: now,
    };
    const query = editingId
      ? supabase!.from("notes").update(payload).eq("id", editingId)
      : supabase!
          .from("notes")
          .insert({ subject_id: subject.subjectId, author_id: userId, ...payload });
    let { error } = await query;
    if (error) {
      const fallbackPayload = { title, content, note_date: draft.noteDate || null, tags, status: draft.status, updated_at: now };
      const fallbackQuery = editingId ? supabase!.from("notes").update(fallbackPayload).eq("id", editingId) : supabase!.from("notes").insert({ subject_id: subject.subjectId, author_id: userId, ...fallbackPayload });
      ({ error } = await fallbackQuery);
      if (!error) setMessage("Nota guardada, pero la base todavía no tiene la columna de bloques. Ejecutá la migración Stage 2.");
    }
    if (error) setMessage("No se pudo guardar la nota. Revisá la migración de Stage 2.");
    else {
      const noteId = editingId ?? (await supabase!.from("notes").select("id").eq("subject_id", subject.subjectId).order("created_at", { ascending: false }).limit(1).single()).data?.id;
      if (workspace && noteId && pendingFiles.length > 0) await uploadRemoteAttachments(noteId, pendingFiles);
      resetDraft();
      setEditingId(null);
      if (workspace) setShowForm(false);
      window.dispatchEvent(new CustomEvent(notesChangedEvent));
      await loadNotes();
    }
  }

  async function uploadRemoteAttachments(noteId: string, files: File[]) {
    for (const file of files) {
      if (!isAllowedAttachment(file, REMOTE_ATTACHMENT_LIMIT)) { setMessage("Adjunto rechazado: usá imágenes, PDF u Office de hasta 10 MB."); continue; }
      const path = `${userId}/${noteId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const upload = await supabase!.storage.from(ATTACHMENT_BUCKET).upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
      if (upload.error) { setMessage("No se pudo subir el adjunto. Revisá el bucket de Supabase."); continue; }
      const inserted = await supabase!.from("note_attachments").insert({ note_id: noteId, name: file.name, mime_type: file.type || "application/octet-stream", size: file.size, storage_path: path });
      if (inserted.error) { await supabase!.storage.from(ATTACHMENT_BUCKET).remove([path]); setMessage("No se pudo guardar la información del adjunto."); }
    }
  }

  async function deleteNote(id: string) {
    if (!supabase || !userId) {
      const nextNotes = notes.filter((note) => note.id !== id);
      setNotes(nextNotes);
      if (!writeLocalNotes(subject.code, nextNotes))
        setMessage(
          "La nota se eliminó en esta sesión, pero no se pudo actualizar este navegador.",
        );
      return;
    }
    const remoteAttachments = await supabase!.from("note_attachments").select("id, storage_path").eq("note_id", id);
    if (!remoteAttachments.error && remoteAttachments.data?.length) {
      await supabase!.storage.from(ATTACHMENT_BUCKET).remove(remoteAttachments.data.map((item) => item.storage_path));
      await supabase!.from("note_attachments").delete().eq("note_id", id);
    }
    const { error } = await supabase!.from("notes").delete().eq("id", id);
    if (error) setMessage(error.message);
    else {
      window.dispatchEvent(new CustomEvent(notesChangedEvent));
      await loadNotes();
    }
  }

  async function deleteAttachment(noteId: string, attachment: NoteAttachment) {
    if (!supabase || !userId || !attachment.path) {
      const nextNotes = notes.map((note) => note.id === noteId ? { ...note, attachments: note.attachments.filter((item) => item.id !== attachment.id) } : note);
      setNotes(nextNotes);
      writeLocalNotes(subject.code, nextNotes);
      return;
    }
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([attachment.path]);
    const { error } = await supabase.from("note_attachments").delete().eq("id", attachment.id);
    if (error) setMessage("No se pudo eliminar el adjunto."); else await loadNotes();
  }

  function isPdfAttachment(attachment: NoteAttachment): boolean {
    return attachment.mime_type === "application/pdf" || attachment.name.toLowerCase().endsWith(".pdf");
  }

  function isImageAttachment(attachment: NoteAttachment): boolean {
    return attachment.mime_type.startsWith("image/");
  }

  async function handleDownload(attachment: NoteAttachment) {
    if (!attachment.url && !attachment.path) return;
    // Local mode: url is dataURL — trigger direct download
    if (!supabase || !attachment.path) {
      const anchor = document.createElement("a");
      anchor.href = attachment.url;
      anchor.download = attachment.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return;
    }
    if (!attachment.url) {
      setMessage("Enlace no disponible. Recargá las notas.");
      return;
    }
    // Prefer fetching the existing inline signedUrl as blob and downloading same-origin.
    // This avoids a second createSignedUrl with `download` that was failing cross-account (filename encoding / RLS edge).
    try {
      const response = await fetch(attachment.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = attachment.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
      return;
    } catch (fetchError) {
      console.warn("[horarium] download via fetch failed, falling back to signedUrl with download disposition", fetchError);
    }
    // Fallback: try a short-lived signed URL with Content-Disposition: attachment so the browser honors the filename even cross-origin.
    try {
      const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(attachment.path, 60, { download: attachment.name });
      const href = data?.signedUrl ?? "";
      if (error || !href) throw error ?? new Error("empty href");
      // Use window.open as ultimate fallback if anchor download is ignored cross-origin.
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = attachment.name;
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Also open as navigation fallback if download attribute is ignored.
      window.setTimeout(() => {
        if (document.visibilityState === "visible") window.open(href, "_blank", "noopener");
      }, 300);
    } catch (signedError) {
      console.error("[horarium] signed download fallback failed", signedError);
      // Last resort: open the inline URL directly — browser will at least show the PDF.
      window.open(attachment.url, "_blank", "noopener");
      setMessage("No se pudo forzar la descarga; se abrió el archivo en una pestaña nueva. Usá Guardar como allí.");
    }
  }

  const NOTE_PREVIEW_LIMIT = 280;

  function plainFromNote(note: LocalNote): string {
    const blocks = normalizeBlocks(note.blocks, note.content);
    const joined = blocks.map((b) => b.text.trim()).filter(Boolean).join(" ");
    return joined || note.content || "";
  }

  function truncateAtWordBoundary(text: string, limit: number): string {
    if (text.length <= limit) return text;
    const slice = text.slice(0, limit);
    const lastSpace = slice.lastIndexOf(" ");
    const cut = lastSpace > limit * 0.6 ? slice.slice(0, lastSpace) : slice;
    return `${cut.trimEnd()}…`;
  }

  function initialsFromName(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  function authorBadgeInfo(note: LocalNote): { label: string; initials: string; isMine: boolean; avatarUrl: string | null } {
    const isMine = Boolean(userId && note.author_id === userId);
    const authorEntry = note.author_id ? authorMap[note.author_id] : undefined;
    const avatarUrl = authorEntry?.avatar_url?.trim() ? authorEntry.avatar_url!.trim() : null;
    if (isMine) return { label: "Vos", initials: "V", isMine: true, avatarUrl };
    if (note.author_id && authorEntry?.display_name) {
      const name = authorEntry.display_name!.trim();
      return { label: name || "Compartida", initials: initialsFromName(name || "C"), isMine: false, avatarUrl };
    }
    if (note.author_id) return { label: "Compartida", initials: "C", isMine: false, avatarUrl };
    return { label: "Compartida", initials: "C", isMine: false, avatarUrl: null };
  }

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredNotes = (() => {
    if (!workspace) return notes;
    if (filter === "todas") return notes;
    if (filter === "mias") return notes.filter((n) => n.author_id === userId);
    if (filter === "companeros") return notes.filter((n) => n.author_id !== userId && n.author_id != null);
    if (filter === "archivadas") return notes.filter((n) => n.status === "archived");
    return notes;
  })();

  // Al llegar desde una notificación, asegurar que la nota esté visible, expandida y scrolleada
  useEffect(() => {
    if (!highlightNoteId) return;
    if (notes.length === 0) return;
    const target = notes.find((note) => note.id === highlightNoteId);
    if (!target) return;
    // Si el filtro actual ocultaría la nota, forzar "todas"
    const wouldBeHidden =
      filter === "mias" ? target.author_id !== userId :
      filter === "companeros" ? target.author_id === userId || target.author_id == null :
      filter === "archivadas" ? target.status !== "archived" : false;
    if (wouldBeHidden) setFilter("todas");
    setExpandedIds((prev) => {
      if (prev.has(highlightNoteId)) return prev;
      const next = new Set(prev);
      next.add(highlightNoteId);
      return next;
    });
    // esperar a que el DOM se actualice con la expansión y el filtro
    const esc = (value: string) => (typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value.replace(/"/g, '\\"'));
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const el = document.querySelector(`[data-note-id="${esc(highlightNoteId)}"]`) as HTMLElement | null;
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        if (highlightCommentId) {
          const cel = document.querySelector(`[data-comment-id="${esc(highlightCommentId)}"]`) as HTMLElement | null;
          if (cel) cel.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [highlightNoteId, highlightCommentId, notes, filter, userId]);

  const filterCounts = {
    todas: notes.length,
    mias: notes.filter((n) => n.author_id === userId).length,
    companeros: notes.filter((n) => n.author_id !== userId && n.author_id != null).length,
    archivadas: notes.filter((n) => n.status === "archived").length,
  };

  useEffect(() => {
    const handleProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail as { userId?: string } | undefined;
      const targetId = detail?.userId;
      if (!targetId || !supabase) return;
      void supabase.from("profiles").select("id, display_name, avatar_url").eq("id", targetId).maybeSingle().then(({ data }) => {
        if (!data) return;
        setAuthorMap((prev) => ({ ...prev, [targetId]: { display_name: (data as { display_name?: string | null }).display_name ?? null, avatar_url: (data as { avatar_url?: string | null }).avatar_url ?? null } }));
      });
    };
    window.addEventListener("profile-updated", handleProfileUpdated as EventListener);
    return () => window.removeEventListener("profile-updated", handleProfileUpdated as EventListener);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const noteAuthorIds = notes.map((n) => n.author_id).filter((id): id is string => Boolean(id));
    const commentAuthorIds = Object.values(comments).flat().map((c) => c.author_id).filter((id): id is string => Boolean(id));
    const authorIds = Array.from(new Set([...noteAuthorIds, ...commentAuthorIds]));
    if (authorIds.length === 0) return;
    let active = true;
    void (async () => {
      try {
        const result = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", authorIds);
        if (!active) return;
        if (result.error || !result.data) return;
        const next: Record<string, { display_name?: string | null; avatar_url?: string | null }> = {};
        for (const row of result.data as Array<{ id: string; display_name?: string | null; avatar_url?: string | null }>) {
          next[row.id] = { display_name: row.display_name ?? null, avatar_url: row.avatar_url ?? null };
        }
        if (Object.keys(next).length) setAuthorMap((prev) => {
          // only update if something actually changed to avoid loops
          let changed = false;
          for (const id of Object.keys(next)) {
            const prevEntry = prev[id];
            const nextEntry = next[id];
            if (!prevEntry || prevEntry.display_name !== nextEntry.display_name || prevEntry.avatar_url !== nextEntry.avatar_url) { changed = true; break; }
          }
          if (!changed && Object.keys(prev).length === Object.keys(next).length) return prev;
          return { ...prev, ...next };
        });
      } catch {
        // silent fallback to Vos/Compartida
      }
    })();
    return () => {
      active = false;
    };
  }, [notes, comments]);

  const isRemote = Boolean(supabase && userId);
  const canMutateNote = (note: LocalNote) => !isRemote || isAdmin || note.author_id === userId;

  function formatCommentTime(iso: string): string {
    try { return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return iso; }
  }
  function canMutateComment(c: NoteComment): boolean { return c.author_id === userId || isAdmin; }
  async function handleCreateComment(noteId: string) {
    const raw = commentDrafts[noteId] ?? "";
    const trimmed = raw.trim();
    if (!supabase || !userId) { setMessage("Iniciá sesión para comentar."); return; }
    if (trimmed.length < 1 || trimmed.length > 500) return;
    const { data, error } = await supabase.from("note_comments").insert({ note_id: noteId, author_id: userId, content: trimmed }).select("id, note_id, author_id, content, created_at, updated_at").single();
    if (error) { setMessage("No se pudo guardar el comentario."); return; }
    const inserted = data as NoteComment;
    setComments((prev) => ({ ...prev, [noteId]: [...(prev[noteId] ?? []), inserted] }));
    setCommentDrafts((s) => ({ ...s, [noteId]: "" }));
    if (inserted.author_id && !authorMap[inserted.author_id]) {
      const pr = await supabase.from("profiles").select("id, display_name, avatar_url").eq("id", inserted.author_id).maybeSingle();
      if (pr.data) setAuthorMap((prev) => ({ ...prev, [inserted.author_id!]: { display_name: (pr.data as { display_name?: string | null }).display_name ?? null, avatar_url: (pr.data as { avatar_url?: string | null }).avatar_url ?? null } }));
    }
    // best-effort notifications: new_comment + mentions
    try {
      const { parseMentions, createNotifications } = await import("@/lib/notifications");
      // fetch note author
      let noteAuthorId: string | null = null;
      let noteTitle: string | null = null;
      try {
        const { data: noteRow } = await supabase.from("notes").select("author_id, title, subject_id").eq("id", noteId).maybeSingle();
        noteAuthorId = (noteRow as { author_id?: string | null } | null)?.author_id ?? null;
        noteTitle = (noteRow as { title?: string | null } | null)?.title ?? null;
      } catch {
        // ignore
      }
      const items: Parameters<typeof createNotifications>[0] = [];
      const subjectCode = subject.code;
      if (noteAuthorId && noteAuthorId !== userId) {
        items.push({
          user_id: noteAuthorId,
          actor_id: userId,
          type: "new_comment",
          title: `Nuevo comentario en ${subjectCode}`,
          body: noteTitle ? `"${noteTitle}": ${trimmed.slice(0, 120)}` : trimmed.slice(0, 140),
          note_id: noteId,
          event_id: null,
          comment_id: inserted.id,
        });
      }
      const mentions = parseMentions(trimmed);
      if (mentions.length > 0) {
        const alreadyNotified = new Set<string>(items.map((i) => i.user_id));
        alreadyNotified.add(userId);
        // lookup profiles where display_name ilike mention
        for (const alias of mentions) {
          try {
            const { data: profs } = await supabase.from("profiles").select("id, display_name").ilike("display_name", alias);
            const matched = (profs ?? []) as Array<{ id: string; display_name: string | null }>;
            for (const p of matched) {
              if (!p.id || alreadyNotified.has(p.id)) continue;
              // case-insensitive exact match after ilike broad search (ilike without % does exact but we ensure)
              if (p.display_name?.toLowerCase() !== alias.toLowerCase()) continue;
              alreadyNotified.add(p.id);
              items.push({
                user_id: p.id,
                actor_id: userId,
                type: "mention",
                title: "Te mencionaron",
                body: trimmed.slice(0, 140),
                note_id: noteId,
                event_id: null,
                comment_id: inserted.id,
              });
            }
          } catch {
            // per-alias ignore
          }
        }
        // fallback: if no exact matches, also try ilike with %? spec says ilike mention — keep simple exact via ilike without wildcard already did.
        // To support partial, second attempt with % wrapping if still no mentions found for that alias
        // (keep behavior conservative to avoid spam)
      }
      if (items.length > 0) {
        await createNotifications(items);
        window.dispatchEvent(new CustomEvent("notifications-updated"));
      }
    } catch (e) {
      console.warn("[horarium] comment notifications failed", e);
    }
  }
  async function handleUpdateComment(c: NoteComment) {
    const trimmed = editingCommentText.trim();
    if (!supabase || !userId) return;
    if (trimmed.length < 1 || trimmed.length > 500) return;
    if (!canMutateComment(c)) return;
    const { data, error } = await supabase.from("note_comments").update({ content: trimmed }).eq("id", c.id).select("id, note_id, author_id, content, created_at, updated_at").single();
    if (error) { setMessage("No se pudo actualizar el comentario."); return; }
    const updated = data as NoteComment;
    setComments((prev) => ({ ...prev, [updated.note_id]: (prev[updated.note_id] ?? []).map((x) => x.id === updated.id ? updated : x) }));
    setEditingCommentId(null); setEditingCommentText("");
  }
  async function handleDeleteComment(c: NoteComment) {
    if (!supabase || !userId) return;
    if (!canMutateComment(c)) return;
    const { error } = await supabase.from("note_comments").delete().eq("id", c.id);
    if (error) { setMessage("No se pudo eliminar el comentario."); return; }
    setComments((prev) => ({ ...prev, [c.note_id]: (prev[c.note_id] ?? []).filter((x) => x.id !== c.id) }));
    if (editingCommentId === c.id) { setEditingCommentId(null); setEditingCommentText(""); }
  }

  const editNote = (note: LocalNote) => {
    if (!canMutateNote(note)) return;
    setDraft({
      title: note.title,
      blocks: normalizeBlocks(note.blocks, note.content),
      noteDate: note.note_date ?? "",
      tags: note.tags.join(", "),
      status: note.status,
      sessionId: note.session_id ?? "",
    });
    setPendingFiles([]);
    setEditingId(note.id);
    if (workspace) {
      setShowForm(true);
      window.requestAnimationFrame(() => {
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        titleInputRef.current?.focus();
      });
    }
  };

  useEffect(() => {
    if (!openBlockMenuId) return;
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-block-option^="${openBlockMenuId}-"]`)?.focus());
  }, [openBlockMenuId]);

  const reduced = useReducedMotion();

  return (
    <div className={workspace ? "min-h-full w-full max-w-full min-w-0 overflow-x-hidden" : "fixed inset-0 z-50 flex justify-end overflow-hidden"}>
      {!workspace ? <button
        type="button"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
        aria-label="Cerrar detalles de la materia"
        onClick={onClose}
      /> : null}
      <aside
        ref={workspace ? undefined : dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="subject-title"
        className={workspace ? "relative mx-auto flex min-h-full w-full max-w-full min-w-0 flex-col overflow-x-hidden overflow-y-auto bg-[var(--surface)] px-4 py-6 sm:px-6 lg:px-10 xl:px-16" : "relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-[var(--surface)] px-6 py-6 shadow-2xl sm:px-8"}
      >
        {!workspace ? <div className="flex items-center justify-between">
          <span className="rounded-full bg-[var(--soft)] px-3 py-1 text-[10px] font-bold tracking-[0.14em] text-[var(--accent)] uppercase">
            {subject.code}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-[var(--muted)] hover:bg-[var(--soft)]"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div> : null}

        {workspace ? (
          <>
            <div className="mt-2 min-w-0 max-w-full overflow-x-hidden">
              <div className="flex min-w-0 max-w-full flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded-full bg-[var(--soft)] px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-[var(--accent)] uppercase">{subject.code}</span>
                  <span className="break-words text-[10px] font-bold tracking-[0.14em] text-[var(--muted)] uppercase">Notas elaboradas</span>
                </div>
                <span className="shrink-0 text-xs text-[var(--muted)]">{notes.length} {notes.length === 1 ? "nota" : "notas"}</span>
              </div>
              <h2 id="subject-title" className="mt-3 min-w-0 max-w-full break-words text-[28px] font-bold tracking-[-0.04em] text-[var(--ink)] leading-none">{subject.subject}</h2>
              <p className="mt-2 min-w-0 max-w-full break-words text-xs text-[var(--muted)]">{selectedSession ? `${formatDay(selectedSession.day)} · ${selectedSession.start} – ${selectedSession.end}` : "Contexto por materia"}</p>
            </div>
            <div className="mt-6 min-w-0 max-w-full overflow-x-hidden border-t border-[var(--line)] pt-6">
              <div className="flex min-w-0 max-w-full flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 max-w-full flex-wrap gap-2" role="group" aria-label="Filtros de notas">
                  {([
                    ["todas", `Todas (${filterCounts.todas})`],
                    ["mias", `Mías (${filterCounts.mias})`],
                    ["companeros", `De compañeros (${filterCounts.companeros})`],
                    ["archivadas", `Archivadas (${filterCounts.archivadas})`],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFilter(value)}
                      aria-pressed={filter === value}
                      className={filter === value ? "rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white" : "rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleCreateClick}
                  aria-expanded={isFormVisible}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90"
                >
                  <Plus size={14} aria-hidden="true" /> Nueva nota
                </button>
              </div>
              {LIVE_NOTES_ENABLED ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCreateLiveNote()}
                    disabled={liveLoading || !userId}
                    title={!userId ? "Iniciá sesión para crear apuntes en vivo" : "Crea un Google Doc colaborativo (4h, anyone-with-link writer)"}
                    aria-label="Apuntes en vivo — Google Doc colaborativo (4h)"
                    className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold shadow-sm transition focus-visible:outline-2 focus-visible:outline-amber-500 ${liveLoading || !userId ? "cursor-not-allowed border border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100" : "bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-500"}`}
                  >
                    {liveLoading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
                    {!userId ? "Iniciá sesión — Apuntes en vivo" : "Apuntes en vivo — Google Doc colaborativo (4h)"}
                  </button>
                  {liveLoading ? <span className="text-xs font-medium text-amber-800 dark:text-amber-200">Creando documento…</span> : null}
                  {!userId && !liveLoading ? <span className="text-xs font-medium text-amber-800 dark:text-amber-200">Iniciá sesión para crear el Doc.</span> : null}
                </div>
              ) : null}
              {liveError ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:border-amber-600/30 dark:bg-amber-500/15 dark:text-amber-200">
                  <span className="flex-1 break-words">{liveError}</span>
                  {liveRetryable ? (
                    <button type="button" onClick={() => void handleCreateLiveNote()} className="shrink-0 rounded bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-500">
                      Reintentar
                    </button>
                  ) : null}
                </div>
              ) : null}
              {message ? <p className="mt-4 max-w-full break-words rounded-lg bg-[var(--soft)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">{message}</p> : null}
            </div>

            {isFormVisible ? (
              <form ref={formRef} onSubmit={saveNote} className="mt-6 w-full max-w-full min-w-0 space-y-5 overflow-x-hidden rounded-xl border border-[var(--line)] bg-[var(--background)] p-4 shadow-sm sm:p-6">
                <input
                  ref={titleInputRef}
                  value={draft.title}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                  placeholder="Título del documento"
                  aria-label="Título del documento"
                  role="searchbox"
                  className="w-full max-w-full min-w-0 break-words border-0 bg-transparent px-0 py-2 text-3xl font-bold tracking-[-0.04em] text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-0 sm:text-4xl"
                />
                <label className="block w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-xs font-semibold text-[var(--muted)]">
                  <span className="flex items-center gap-2"><CalendarDays size={15} aria-hidden="true" /> Horario usado como contexto</span>
                  <select
                    value={selectedSessionId}
                    onChange={(event) => setDraft({ ...draft, sessionId: event.target.value })}
                    aria-label="Horario usado como contexto"
                    className="schedule-context-select mt-2 w-full max-w-full bg-transparent text-sm font-normal text-[var(--ink)] outline-none"
                  >
                    <option value="">Toda la materia (sin horario específico)</option>
                    {sessions.map((session) => <option key={session.id} value={session.id}>{formatDay(session.day)} · {session.start} – {session.end} · {session.section} · {session.professor}</option>)}
                  </select>
                </label>
                <div className="grid w-full max-w-full min-w-0 grid-cols-2 gap-x-4 gap-y-3 overflow-hidden border-y border-[var(--line)] py-4 sm:grid-cols-4">
                  {[
                    ["Profesor", contextSession.professor],
                    ["Sección", contextSession.section],
                    ["Aula", contextSession.room],
                    ["Duración", `${minutes(contextSession.start, contextSession.end)} min`],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <p className="flex items-center gap-1 text-[10px] font-bold tracking-[0.12em] text-[var(--muted)] uppercase">
                        {label === "Profesor" ? <UserRound size={12} aria-hidden="true" /> : null}{label}
                      </p>
                      <p className="mt-1 break-words text-sm font-semibold text-[var(--ink)]">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="w-full max-w-full min-w-0 space-y-1 overflow-x-hidden" aria-label="Editor de bloques">
                  {draft.blocks.map((block, index) => <div key={block.id} className="flex min-w-0 max-w-full gap-2 overflow-hidden">
                    <div ref={openBlockMenuId === block.id ? blockMenuRef : undefined} className="relative shrink-0 pt-2">
                      <button type="button" data-block-trigger={block.id} aria-label={`Cambiar tipo del bloque ${index + 1}`} aria-haspopup="menu" aria-expanded={openBlockMenuId === block.id} onClick={() => setOpenBlockMenuId(openBlockMenuId === block.id ? null : block.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--soft)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
                        <BlockIcon type={block.type} />
                        <ChevronDown size={11} aria-hidden="true" />
                      </button>
                      {openBlockMenuId === block.id ? <div role="menu" aria-label={`Tipos para el bloque ${index + 1}`} className="absolute left-0 top-11 z-20 w-44 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1 shadow-xl">
                        {blockTypeOptions.map((option, optionIndex) => <button key={option.value} type="button" role="menuitem" data-block-option={`${block.id}-${option.value}`} onKeyDown={(event) => {
                          const nextIndex = event.key === "ArrowDown" ? (optionIndex + 1) % blockTypeOptions.length : event.key === "ArrowUp" ? (optionIndex - 1 + blockTypeOptions.length) % blockTypeOptions.length : event.key === "Home" ? 0 : event.key === "End" ? blockTypeOptions.length - 1 : -1;
                          if (nextIndex >= 0) { event.preventDefault(); document.querySelector<HTMLButtonElement>(`[data-block-option="${block.id}-${blockTypeOptions[nextIndex].value}"]`)?.focus(); }
                        }} onClick={() => { setDraft({ ...draft, blocks: draft.blocks.map((item) => item.id === block.id ? { ...item, type: option.value, checked: option.value === "checklist" ? Boolean(item.checked) : undefined } : item) }); setOpenBlockMenuId(null); window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-block-trigger="${block.id}"]`)?.focus()); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[var(--ink)] hover:bg-[var(--soft)] focus-visible:bg-[var(--soft)] focus-visible:outline-none">
                          <BlockIcon type={option.value} /><span>{option.label}</span>
                        </button>)}
                      </div> : null}
                    </div>
                    {block.type === "checklist" ? <input type="checkbox" checked={Boolean(block.checked)} onChange={(event) => setDraft({ ...draft, blocks: draft.blocks.map((item) => item.id === block.id ? { ...item, checked: event.target.checked } : item) })} aria-label="Marcar checklist" className="mt-3 accent-[var(--accent)]" /> : null}
                    <textarea value={block.text} onChange={(event) => setDraft({ ...draft, blocks: draft.blocks.map((item) => item.id === block.id ? { ...item, text: event.target.value } : item) })} rows={block.type === "heading" ? 1 : 2} placeholder={block.type === "heading" ? "Título del bloque" : "Escribí aquí... Usá / para ver comandos"} aria-label={`Texto del bloque ${index + 1}`} className={block.type === "heading" ? "min-w-0 max-w-full flex-1 resize-y break-words border-0 bg-transparent p-2 text-lg font-semibold leading-7 text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-0" : "min-w-0 max-w-full flex-1 resize-y break-words border-0 bg-transparent p-2 text-sm leading-7 text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-0"} />
                    <button type="button" onClick={() => setDraft({ ...draft, blocks: draft.blocks.filter((item) => item.id !== block.id) })} disabled={draft.blocks.length === 1} className="self-start px-1 py-2 text-xs text-[var(--muted)] opacity-0 transition hover:text-rose-500 focus-visible:opacity-100 disabled:opacity-0" aria-label="Eliminar bloque">×</button>
                  </div>)}
                  {draft.blocks.length === 1 && !draft.blocks[0].text ? <p className="ml-9 -mt-1 text-xs text-[var(--muted)]">Escribí aquí o usá / para ver comandos.</p> : null}
                  <button type="button" onClick={() => setDraft({ ...draft, blocks: [...draft.blocks, { id: crypto.randomUUID(), type: "paragraph", text: "" }] })} className="ml-9 mt-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--accent)]">+ Agregar bloque</button>
                </div>
                <label className="block w-full max-w-full min-w-0 overflow-hidden border-t border-[var(--line)] pt-4 text-xs font-semibold text-[var(--muted)]">Adjuntos (imágenes, PDF u Office)
                  <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={(event) => setPendingFiles(Array.from(event.target.files ?? []))} className="mt-2 block w-full max-w-full text-xs font-normal text-[var(--ink)]" />
                  {pendingFiles.length > 0 ? <span className="mt-2 block max-w-full break-words font-normal">{pendingFiles.map((file) => file.name).join(", ")}</span> : null}
                </label>
                <div className="grid w-full max-w-full min-w-0 gap-x-6 gap-y-3 overflow-hidden border-t border-[var(--line)] pt-4 sm:grid-cols-2">
                  <label className="min-w-0 text-xs font-semibold text-[var(--muted)]">
                    Fecha de la nota
                    <input
                      type="date"
                      value={draft.noteDate}
                      onChange={(event) =>
                        setDraft({ ...draft, noteDate: event.target.value })
                      }
                      aria-label="Fecha de la nota (opcional)"
                      role="spinbutton"
                      className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm font-normal text-[var(--ink)]"
                    />
                  </label>
                  <label className="min-w-0 text-xs font-semibold text-[var(--muted)]">
                    Etiquetas
                    <input
                      value={draft.tags}
                      onChange={(event) =>
                        setDraft({ ...draft, tags: event.target.value })
                      }
                      placeholder="ej. parcial, teoría"
                      aria-label="Etiquetas separadas por comas"
                      role="searchbox"
                      className="mt-1 w-full max-w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm font-normal text-[var(--ink)]"
                    />
                  </label>
                </div>
                <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={draft.status === "archived"}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        status: event.target.checked ? "archived" : "active",
                      })
                    }
                  />{" "}
                  Guardar como archivada
                </label>
                <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--line)] pt-4">
                  <button
                    type="button"
                    onClick={handleCancelForm}
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-[var(--muted)]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90"
                  >
                    {editingId ? "Guardar cambios" : "Agregar nota"}
                  </button>
                </div>
              </form>
            ) : null}

            <motion.div className="mt-6 w-full max-w-full min-w-0 space-y-3 overflow-x-hidden pb-10" variants={reduced ? undefined : staggerContainer} initial="hidden" animate="visible">
              {loading ? (
                <p className="text-sm text-[var(--muted)]">Cargando notas...</p>
              ) : filteredNotes.length === 0 ? (
                <div className="w-full max-w-full rounded-xl border border-dashed border-[var(--line)] px-4 py-6 text-center text-sm break-words text-[var(--muted)]">
                  {notes.length === 0 ? "Todavía no hay notas. Agregá la primera arriba." : "No hay notas para este filtro."}
                </div>
              ) : (
                filteredNotes.map((note) => {
                  const plain = plainFromNote(note);
                  const isLong = plain.length > NOTE_PREVIEW_LIMIT;
                  const isExpanded = expandedIds.has(note.id);
                  const preview = isLong && !isExpanded ? truncateAtWordBoundary(plain, NOTE_PREVIEW_LIMIT) : plain;
                  const badge = authorBadgeInfo(note);
                  const isMine = badge.isMine;
                  const isHighlighted = highlightNoteId === note.id;
                  return (
                  <motion.article
                    key={note.id}
                    data-note-id={note.id}
                    variants={reduced ? undefined : staggerItem}
                    whileHover={reduced ? undefined : subtleCardHover}
                    transition={hoverTransition}
                    className={`note-article w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-[var(--line)] border-l-2 border-l-[var(--accent)] bg-[var(--soft)]/20 p-4 ${note.status === "archived" ? "opacity-70" : ""}${isHighlighted ? " ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface)] shadow-lg" : ""}`}
                  >
                    <div className="flex min-w-0 max-w-full items-start justify-between gap-3 overflow-hidden">
                      <h4 className="min-w-0 flex-1 break-words font-semibold text-[var(--ink)]">
                        {note.title}
                      </h4>
                      <span className="shrink-0 rounded-full bg-[var(--soft)] px-2 py-1 text-[10px] font-semibold text-[var(--muted)]">
                        {note.status === "archived" ? "Archivada" : "Activa"}
                      </span>
                    </div>
                    <div className="mt-2 flex min-w-0 max-w-full flex-wrap items-center gap-2 overflow-hidden">
                      <span className={isMine ? "inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[10px] font-semibold text-white" : "inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[10px] font-semibold text-[var(--muted)]"}>
                        {badge.avatarUrl ? <img src={badge.avatarUrl} alt="" className="h-4 w-4 rounded-full object-cover" /> : isMine ? <UserRound size={12} aria-hidden="true" /> : badge.initials ? <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--soft)] text-[8px] font-bold text-[var(--accent)]">{badge.initials.slice(0,2)}</span> : <Users size={12} aria-hidden="true" />}
                        <span className="max-w-[14ch] truncate">{badge.label}</span>
                      </span>
                    </div>
                    {note.session_id ? <p className="mt-2 flex items-center gap-1 text-xs text-[var(--muted)]"><CalendarDays size={13} aria-hidden="true" /> Contexto: {(() => { const noteSession = sessions.find((session) => session.id === note.session_id); return noteSession ? `${formatDay(noteSession.day)} · ${noteSession.start} – ${noteSession.end} · ${noteSession.section}` : "horario guardado"; })()}</p> : null}
                    {isLong && !isExpanded ? (
                      <p className="mt-2 line-clamp-4 max-w-full break-words text-sm leading-6 text-[var(--ink)]">{preview}</p>
                    ) : isLong && isExpanded ? (
                      <div className="mt-2 w-full max-w-full min-w-0 space-y-1 overflow-hidden text-sm leading-6 text-[var(--ink)]">
                        {normalizeBlocks(note.blocks, note.content).map((block) => <div key={block.id} className={`break-words ${block.type === "heading" ? "font-semibold" : ""}`}>{block.type === "bullet" ? "• " : block.type === "checklist" ? `${block.checked ? "☑" : "☐"} ` : ""}{block.text}</div>)}
                      </div>
                    ) : (
                      <div className="mt-2 w-full max-w-full min-w-0 space-y-1 overflow-hidden text-sm leading-6 text-[var(--ink)]">
                        {normalizeBlocks(note.blocks, note.content).map((block) => <div key={block.id} className={`break-words ${block.type === "heading" ? "font-semibold" : ""}`}>{block.type === "bullet" ? "• " : block.type === "checklist" ? `${block.checked ? "☑" : "☐"} ` : ""}{block.text}</div>)}
                      </div>
                    )}
                    {isLong ? (
                      <button type="button" aria-expanded={isExpanded} onClick={() => toggleExpanded(note.id)} className="mt-2 text-xs font-semibold text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2">
                        {isExpanded ? "Ver menos" : "Ver más"}
                      </button>
                    ) : null}
                    {note.note_date ? (
                      <time className="mt-3 block text-xs text-[var(--muted)]">
                        Fecha:{" "}
                        {new Date(`${note.note_date}T00:00:00`).toLocaleDateString(
                          "es-AR",
                        )}
                      </time>
                    ) : null}
                    {note.tags.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {note.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-[var(--soft)] px-2 py-1 text-[10px] text-[var(--accent)]"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {(attachments[note.id] ?? note.attachments).length > 0 ? <div className="mt-3 w-full max-w-full min-w-0 space-y-2 overflow-hidden border-t border-[var(--line)] pt-3">
                      <p className="text-xs font-semibold text-[var(--muted)]">Adjuntos</p>
                      {(attachments[note.id] ?? note.attachments).map((attachment) => {
                        const isImage = isImageAttachment(attachment);
                        const isPdf = isPdfAttachment(attachment);
                        return (
                          <div key={attachment.id} className="flex w-full max-w-full min-w-0 items-center gap-2 overflow-hidden text-xs">
                            {isImage && attachment.url ? <img src={attachment.url} alt={attachment.name} className="h-10 w-10 shrink-0 rounded object-cover" /> : null}
                            {isPdf && !isImage ? <span className="shrink-0 rounded bg-[var(--soft)] px-1.5 py-1 text-[10px] font-bold text-[var(--accent)]">PDF</span> : null}
                            <span className="min-w-0 flex-1 truncate break-all text-[var(--ink)]" title={attachment.name}>{attachment.name}</span>
                            {attachment.url ? (
                              isPdf || isImage ? (
                                <button type="button" onClick={() => setPreviewAttachment(attachment)} className="shrink-0 font-semibold text-[var(--accent)] hover:underline">Ver</button>
                              ) : (
                                <a href={attachment.url} target="_blank" rel="noreferrer" className="shrink-0 font-semibold text-[var(--accent)] hover:underline">Ver</a>
                              )
                            ) : null}
                            <button type="button" onClick={() => void handleDownload(attachment)} className="shrink-0 font-semibold text-[var(--accent)] hover:underline">Descargar</button>
                            {canMutateNote(note) ? <button type="button" onClick={() => void deleteAttachment(note.id, attachment)} className="shrink-0 font-semibold text-rose-500">Eliminar</button> : null}
                          </div>
                        );
                      })}
                                        </div> : null}
                    <div className="mt-3 w-full max-w-full min-w-0 overflow-hidden border-t border-[var(--line)] pt-3">
                      <p className="mb-2 text-xs font-semibold text-[var(--muted)]">Comentarios {(comments[note.id]?.length ?? 0) > 0 ? `· ${comments[note.id].length}` : ""}</p>
                      <div className="space-y-2">
                        {(comments[note.id] ?? []).map((c) => {
                          const info = c.author_id ? authorMap[c.author_id] : null;
                          const isOwn = c.author_id === userId;
                          const isCommentHighlighted = highlightCommentId === c.id;
                          return (
                            <div key={c.id} data-comment-id={c.id} className={`flex gap-2 ${isCommentHighlighted ? "rounded-lg ring-2 ring-[var(--accent)] ring-offset-1 p-1 -m-1 bg-[var(--accent)]/5" : ""}`}>
                              {info?.avatar_url ? <img src={info.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" /> : <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-white">{(info?.display_name ?? "U")[0]?.toUpperCase()}</div>}
                              <div className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold text-[var(--ink)]">{info?.display_name ?? (isOwn ? "Vos" : "Usuario")}</span>
                                  {isOwn ? <span className="rounded bg-[var(--accent)] px-1 py-0.5 text-[9px] font-bold text-white">Vos</span> : null}
                                  <time className="text-[10px] text-[var(--muted)]">{formatCommentTime(c.created_at)}{c.created_at !== c.updated_at ? " · editado" : ""}</time>
                                  {canMutateComment(c) ? <span className="ml-auto flex gap-1"><button type="button" onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.content); }} className="text-[10px] font-semibold text-[var(--accent)]">Editar</button><button type="button" onClick={() => void handleDeleteComment(c)} className="text-[10px] font-semibold text-rose-500">Eliminar</button></span> : null}
                                </div>
                                {editingCommentId === c.id ? <div className="mt-1.5 flex gap-1.5"><textarea value={editingCommentText} onChange={(e) => setEditingCommentText(e.target.value)} maxLength={500} rows={2} className="flex-1 rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--ink)] placeholder:text-[var(--muted)]" /><button type="button" onClick={() => void handleUpdateComment(c)} className="shrink-0 rounded bg-[var(--accent)] px-2 py-1 text-xs font-semibold text-white">Guardar</button><button type="button" onClick={() => { setEditingCommentId(null); setEditingCommentText(""); }} className="shrink-0 rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--ink)]">Cancelar</button></div> : <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-[var(--ink)]">{c.content}</p>}
                              </div>
                            </div>
                          );
                        })}
                        {(comments[note.id] ?? []).length === 0 ? <p className="text-xs text-[var(--muted)]">Sé el primero en comentar.</p> : null}
                      </div>
                      {supabase && userId ? <div className="mt-2.5 flex gap-2"><input value={commentDrafts[note.id] ?? ""} onChange={(e) => setCommentDrafts((s) => ({ ...s, [note.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleCreateComment(note.id); } }} maxLength={500} placeholder="Escribí un comentario..." className="flex-1 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--ink)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)]" /><button type="button" onClick={() => void handleCreateComment(note.id)} disabled={!(commentDrafts[note.id]?.trim())} className="shrink-0 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Enviar</button></div> : <p className="mt-2 text-[11px] text-[var(--muted)]">Iniciá sesión para comentar.</p>}
                    </div>
                     <div className="mt-3 flex w-full max-w-full min-w-0 flex-wrap items-center justify-between gap-2 overflow-hidden">
                      <time className="text-[10px] font-medium text-[var(--muted)]">
                        Actualizada{" "}
                        {new Date(note.updated_at).toLocaleDateString("es-AR", {
                          month: "short",
                          day: "numeric",
                        })}
                      </time>
                       {canMutateNote(note) ? <div className="flex gap-3">
                         <button
                          type="button"
                          onClick={() => editNote(note)}
                          className="text-xs font-semibold text-[var(--accent)]"
                        >
                          Editar
                         </button>
                        <button
                          type="button"
                          onClick={() => void deleteNote(note.id)}
                          className="text-xs font-semibold text-rose-500"
                        >
                          Eliminar
                        </button>
                       </div> : <span className="text-xs text-[var(--muted)]">Solo lectura</span>}
                    </div>
                  </motion.article>
                  );
                })
              )}
            </motion.div>
          </>
        ) : (
          <>
            <h2 id="subject-title" className="mt-6 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
              {subject.subject}
            </h2>
            {onOpenNotes ? <button type="button" onClick={onOpenNotes} className="mt-3 text-left text-xs font-semibold text-[var(--accent)] hover:underline">Abrir en Notas</button> : null}
            <p className="mt-2 text-sm text-[var(--muted)]">
              {formatClassDate(classDate)} · {subject.start} – {subject.end}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[
                ["Profesor", subject.professor],
                ["Sección", subject.section],
                ["Aula", subject.room],
                ["Duración", `${minutes(subject.start, subject.end)} min`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-[var(--line)] bg-[var(--background)] p-3">
                  <p className="text-[10px] font-bold tracking-[0.12em] text-[var(--muted)] uppercase">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{value}</p>
                </div>
              ))}
            </div>
            <section aria-labelledby="weekly-sessions-title" className="mt-8">
              <div className="flex items-center justify-between">
                <h3 id="weekly-sessions-title" className="text-xs font-bold tracking-[0.14em] text-[var(--muted)] uppercase">Sesiones semanales</h3>
                <span className="text-xs text-[var(--muted)]">{sessions.length} {sessions.length === 1 ? "sesión" : "sesiones"}</span>
              </div>
              <div className="mt-3 space-y-2">
                {sessions.map((session) => (
                  <div key={session.id} className="rounded-xl border border-[var(--line)] bg-[var(--background)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[var(--ink)]">{formatDay(session.day)} · {session.start} – {session.end}</p>
                      <span className="text-xs text-[var(--muted)]">{session.section}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">{session.professor} · {session.room}</p>
                  </div>
                ))}
              </div>
            </section>
            <div className="mt-8 flex items-end justify-between">
              <div>
                <p className="text-xs font-bold tracking-[0.14em] text-[var(--accent)] uppercase">Notas compartidas</p>
                <h3 className="mt-1 text-lg font-semibold text-[var(--ink)]">Mantené el contexto cerca.</h3>
              </div>
              <span className="text-xs text-[var(--muted)]">{notes.length} {notes.length === 1 ? "nota" : "notas"}</span>
            </div>
            {LIVE_NOTES_ENABLED ? (
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreateLiveNote()}
                  disabled={liveLoading || !userId}
                  title={!userId ? "Iniciá sesión para crear apuntes en vivo" : "Crea un Google Doc colaborativo (4h, anyone-with-link writer)"}
                  aria-label="Apuntes en vivo — Google Doc colaborativo (4h)"
                  className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-semibold shadow-sm transition focus-visible:outline-2 focus-visible:outline-amber-500 ${liveLoading || !userId ? "cursor-not-allowed border border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100" : "bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-500"}`}
                >
                  {liveLoading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
                  {!userId ? "Iniciá sesión — Apuntes en vivo" : "Apuntes en vivo — Google Doc colaborativo (4h)"}
                </button>
                {!userId && !liveLoading ? <span className="text-xs font-medium text-amber-800 dark:text-amber-200">Iniciá sesión para crear el Doc colaborativo.</span> : null}
                {liveLoading ? <span className="text-xs font-medium text-amber-800 dark:text-amber-200">Creando documento…</span> : null}
                {liveError ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:border-amber-600/30 dark:bg-amber-500/15 dark:text-amber-200">
                    <span className="flex-1 break-words">{liveError}</span>
                    {liveRetryable ? (
                      <button type="button" onClick={() => void handleCreateLiveNote()} className="shrink-0 rounded bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-500">
                        Reintentar
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {message ? <p className="mt-4 rounded-lg bg-[var(--soft)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">{message}</p> : null}
            <form onSubmit={saveNote} className="mt-5 space-y-2">
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
                placeholder="Título del documento"
                aria-label="Título del documento"
                role="searchbox"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm font-semibold text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              />
              <textarea value={draft.blocks[0]?.text ?? ""} onChange={(event) => setDraft({ ...draft, blocks: [{ id: draft.blocks[0]?.id ?? crypto.randomUUID(), type: "paragraph", text: event.target.value }] })} rows={4} placeholder="Escribí una nota rápida..." aria-label="Texto de la nota" className="w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
              <div className="flex justify-end gap-2">
                {editingId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      resetDraft();
                    }}
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-[var(--muted)]"
                  >
                    Cancelar
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90"
                >
                  {editingId ? "Guardar cambios" : "Agregar nota"}
                </button>
              </div>
            </form>
            <div className="mt-6 space-y-3">
              {loading ? (
                <p className="text-sm text-[var(--muted)]">Cargando notas...</p>
              ) : filteredNotes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--line)] px-4 py-6 text-center text-sm text-[var(--muted)]">
                  Todavía no hay notas. Agregá la primera arriba.
                </div>
              ) : (
                filteredNotes.map((note) => {
                  const badge = authorBadgeInfo(note);
                  const isMine = badge.isMine;
                  const isHighlighted = highlightNoteId === note.id;
                  return (
                  <motion.article
                    key={note.id}
                    data-note-id={note.id}
                    whileHover={reduced ? undefined : subtleCardHover}
                    transition={hoverTransition}
                    className={`note-article rounded-xl border border-[var(--line)] border-l-2 border-l-[var(--accent)] bg-[var(--soft)]/20 p-4 ${note.status === "archived" ? "opacity-70" : ""}${isHighlighted ? " ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface)] shadow-lg" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="font-semibold text-[var(--ink)]">
                        {note.title}
                      </h4>
                      <span className="rounded-full bg-[var(--soft)] px-2 py-1 text-[10px] font-semibold text-[var(--muted)]">
                        {note.status === "archived" ? "Archivada" : "Activa"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={isMine ? "inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[10px] font-semibold text-white" : "inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[10px] font-semibold text-[var(--muted)]"}>
                        {badge.avatarUrl ? <img src={badge.avatarUrl} alt="" className="h-4 w-4 rounded-full object-cover" /> : isMine ? <UserRound size={12} aria-hidden="true" /> : badge.initials ? <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--soft)] text-[8px] font-bold text-[var(--accent)]">{badge.initials.slice(0,2)}</span> : <Users size={12} aria-hidden="true" />}
                        <span className="max-w-[14ch] truncate">{badge.label}</span>
                      </span>
                    </div>
                    {note.session_id ? <p className="mt-2 flex items-center gap-1 text-xs text-[var(--muted)]"><CalendarDays size={13} aria-hidden="true" /> Contexto: {(() => { const noteSession = sessions.find((session) => session.id === note.session_id); return noteSession ? `${formatDay(noteSession.day)} · ${noteSession.start} – ${noteSession.end} · ${noteSession.section}` : "horario guardado"; })()}</p> : null}
                    <div className="mt-2 space-y-1 text-sm leading-6 text-[var(--ink)]">
                      {normalizeBlocks(note.blocks, note.content).map((block) => <div key={block.id} className={block.type === "heading" ? "font-semibold" : ""}>{block.type === "bullet" ? "• " : block.type === "checklist" ? `${block.checked ? "☑" : "☐"} ` : ""}{block.text}</div>)}
                    </div>
                    {note.note_date ? (
                      <time className="mt-3 block text-xs text-[var(--muted)]">
                        Fecha:{" "}
                        {new Date(`${note.note_date}T00:00:00`).toLocaleDateString(
                          "es-AR",
                        )}
                      </time>
                    ) : null}
                    {note.tags.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {note.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-[var(--soft)] px-2 py-1 text-[10px] text-[var(--accent)]"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {(attachments[note.id] ?? note.attachments).length > 0 ? <div className="mt-3 w-full max-w-full min-w-0 space-y-2 overflow-hidden border-t border-[var(--line)] pt-3">
                      <p className="text-xs font-semibold text-[var(--muted)]">Adjuntos</p>
                      {(attachments[note.id] ?? note.attachments).map((attachment) => {
                        const isImage = isImageAttachment(attachment);
                        const isPdf = isPdfAttachment(attachment);
                        return (
                          <div key={attachment.id} className="flex w-full max-w-full min-w-0 items-center gap-2 overflow-hidden text-xs">
                            {isImage && attachment.url ? <img src={attachment.url} alt={attachment.name} className="h-10 w-10 shrink-0 rounded object-cover" /> : null}
                            {isPdf && !isImage ? <span className="shrink-0 rounded bg-[var(--soft)] px-1.5 py-1 text-[10px] font-bold text-[var(--accent)]">PDF</span> : null}
                            <span className="min-w-0 flex-1 truncate break-all text-[var(--ink)]" title={attachment.name}>{attachment.name}</span>
                            {attachment.url ? (
                              isPdf || isImage ? (
                                <button type="button" onClick={() => setPreviewAttachment(attachment)} className="shrink-0 font-semibold text-[var(--accent)] hover:underline">Ver</button>
                              ) : (
                                <a href={attachment.url} target="_blank" rel="noreferrer" className="shrink-0 font-semibold text-[var(--accent)] hover:underline">Ver</a>
                              )
                            ) : null}
                            <button type="button" onClick={() => void handleDownload(attachment)} className="shrink-0 font-semibold text-[var(--accent)] hover:underline">Descargar</button>
                            {canMutateNote(note) ? <button type="button" onClick={() => void deleteAttachment(note.id, attachment)} className="shrink-0 font-semibold text-rose-500">Eliminar</button> : null}
                          </div>
                        );
                      })}
                                        </div> : null}
                    <div className="mt-3 w-full max-w-full min-w-0 overflow-hidden border-t border-[var(--line)] pt-3">
                      <p className="mb-2 text-xs font-semibold text-[var(--muted)]">Comentarios {(comments[note.id]?.length ?? 0) > 0 ? `· ${comments[note.id].length}` : ""}</p>
                      <div className="space-y-2">
                        {(comments[note.id] ?? []).map((c) => {
                          const info = c.author_id ? authorMap[c.author_id] : null;
                          const isOwn = c.author_id === userId;
                          const isCommentHighlighted = highlightCommentId === c.id;
                          return (
                            <div key={c.id} data-comment-id={c.id} className={`flex gap-2 ${isCommentHighlighted ? "rounded-lg ring-2 ring-[var(--accent)] ring-offset-1 p-1 -m-1 bg-[var(--accent)]/5" : ""}`}>
                              {info?.avatar_url ? <img src={info.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" /> : <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-white">{(info?.display_name ?? "U")[0]?.toUpperCase()}</div>}
                              <div className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold text-[var(--ink)]">{info?.display_name ?? (isOwn ? "Vos" : "Usuario")}</span>
                                  {isOwn ? <span className="rounded bg-[var(--accent)] px-1 py-0.5 text-[9px] font-bold text-white">Vos</span> : null}
                                  <time className="text-[10px] text-[var(--muted)]">{formatCommentTime(c.created_at)}{c.created_at !== c.updated_at ? " · editado" : ""}</time>
                                  {canMutateComment(c) ? <span className="ml-auto flex gap-1"><button type="button" onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.content); }} className="text-[10px] font-semibold text-[var(--accent)]">Editar</button><button type="button" onClick={() => void handleDeleteComment(c)} className="text-[10px] font-semibold text-rose-500">Eliminar</button></span> : null}
                                </div>
                                {editingCommentId === c.id ? <div className="mt-1.5 flex gap-1.5"><textarea value={editingCommentText} onChange={(e) => setEditingCommentText(e.target.value)} maxLength={500} rows={2} className="flex-1 rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--ink)] placeholder:text-[var(--muted)]" /><button type="button" onClick={() => void handleUpdateComment(c)} className="shrink-0 rounded bg-[var(--accent)] px-2 py-1 text-xs font-semibold text-white">Guardar</button><button type="button" onClick={() => { setEditingCommentId(null); setEditingCommentText(""); }} className="shrink-0 rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--ink)]">Cancelar</button></div> : <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-[var(--ink)]">{c.content}</p>}
                              </div>
                            </div>
                          );
                        })}
                        {(comments[note.id] ?? []).length === 0 ? <p className="text-xs text-[var(--muted)]">Sé el primero en comentar.</p> : null}
                      </div>
                      {supabase && userId ? <div className="mt-2.5 flex gap-2"><input value={commentDrafts[note.id] ?? ""} onChange={(e) => setCommentDrafts((s) => ({ ...s, [note.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleCreateComment(note.id); } }} maxLength={500} placeholder="Escribí un comentario..." className="flex-1 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--ink)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)]" /><button type="button" onClick={() => void handleCreateComment(note.id)} disabled={!(commentDrafts[note.id]?.trim())} className="shrink-0 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Enviar</button></div> : <p className="mt-2 text-[11px] text-[var(--muted)]">Iniciá sesión para comentar.</p>}
                    </div>
                     <div className="mt-3 flex w-full max-w-full min-w-0 flex-wrap items-center justify-between gap-2 overflow-hidden">
                      <time className="text-[10px] font-medium text-[var(--muted)]">
                        Actualizada{" "}
                        {new Date(note.updated_at).toLocaleDateString("es-AR", {
                          month: "short",
                          day: "numeric",
                        })}
                      </time>
                       {canMutateNote(note) ? <div className="flex gap-3">
                         <button
                          type="button"
                          onClick={() => editNote(note)}
                          className="text-xs font-semibold text-[var(--accent)]"
                        >
                          Editar
                         </button>
                        <button
                          type="button"
                          onClick={() => void deleteNote(note.id)}
                          className="text-xs font-semibold text-rose-500"
                        >
                          Eliminar
                        </button>
                       </div> : <span className="text-xs text-[var(--muted)]">Solo lectura</span>}
                    </div>
                  </motion.article>
                  );
                })
              )}
            </div>
          </>
        )}
      </aside>
      {previewAttachment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/60 p-4" onClick={() => setPreviewAttachment(null)}>
          <div ref={previewDialogRef as unknown as React.RefObject<HTMLDivElement>} role="dialog" aria-modal="true" aria-label={`Vista previa de ${previewAttachment.name}`} className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-[var(--surface)] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <p className="truncate text-sm font-semibold text-[var(--ink)]" title={previewAttachment.name}>{previewAttachment.name}</p>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => void handleDownload(previewAttachment)} className="text-xs font-semibold text-[var(--accent)] hover:underline">Descargar</button>
                <button type="button" onClick={() => setPreviewAttachment(null)} aria-label="Cerrar vista previa" className="rounded-full p-1 text-[var(--muted)] hover:bg-[var(--soft)] hover:text-[var(--ink)]">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-[var(--soft)]">
              {isImageAttachment(previewAttachment) ? (
                <img src={previewAttachment.url} alt={previewAttachment.name} className="mx-auto max-h-[80vh] w-auto max-w-full object-contain" />
              ) : isPdfAttachment(previewAttachment) ? (
                <div className="flex h-[80vh] flex-col">
                  <iframe src={previewAttachment.url} title={previewAttachment.name} className="flex-1 w-full border-0 bg-white" />
                  <div className="border-t border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-center">
                    <a href={previewAttachment.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[var(--accent)] hover:underline">Si no ves el PDF, abrir en nueva pestaña</a>
                    <span className="mx-2 text-[var(--muted)]">·</span>
                    <button type="button" onClick={() => void handleDownload(previewAttachment)} className="text-xs font-semibold text-[var(--accent)] hover:underline">Descargar</button>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-sm text-[var(--muted)]">
                  Vista previa no disponible para este tipo de archivo. Usá Descargar.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function minutes(start: string, end: string) {
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  return toMinutes(end) - toMinutes(start);
}

function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const blockTypeOptions: Array<{ value: NoteBlockType; label: string }> = [
  { value: "paragraph", label: "Párrafo" },
  { value: "heading", label: "Título" },
  { value: "bullet", label: "Viñeta" },
  { value: "checklist", label: "Checklist" },
];

function BlockIcon({ type }: { type: NoteBlockType }) {
  const Icon = type === "heading" ? Heading2 : type === "bullet" ? List : type === "checklist" ? ListChecks : AlignLeft;
  return <Icon size={15} aria-hidden="true" />;
}
