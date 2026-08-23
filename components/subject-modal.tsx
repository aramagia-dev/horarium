"use client";

/* Signed Supabase URLs and local data URLs are intentionally rendered without Next image optimization. */
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AlignLeft, CalendarDays, ChevronDown, Heading2, List, ListChecks, Plus, UserRound, Users } from "lucide-react";
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

export function SubjectModal({
  subject,
  sessions,
  date,
  legacyEntryIds = [],
  onClose,
  workspace = false,
  onOpenNotes,
}: {
  subject: ScheduleEntry;
  sessions: ScheduleSession[];
  date?: Date;
  legacyEntryIds?: string[];
  onClose: () => void;
  workspace?: boolean;
  onOpenNotes?: () => void;
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [message, setMessage] = useState(
    supabaseConfigured
      ? ""
      : "Las notas se guardan en este navegador. Configurá Supabase para compartirlas.",
  );
  const { userId, isAdmin } = useAuth();
  const [openBlockMenuId, setOpenBlockMenuId] = useState<string | null>(null);
  const blockMenuRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"todas" | "mias" | "companeros" | "archivadas">("todas");
  const [authorMap, setAuthorMap] = useState<Record<string, { display_name?: string | null; avatar_url?: string | null }>>({});

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
            (grouped[item.note_id] ??= []).push({ id: item.id, name: item.name, mime_type: item.mime_type, size: item.size, path: item.storage_path, url: signedResults[index]?.data?.signedUrl ?? "", created_at: item.created_at });
          });
          setAttachments(grouped);
        } else setMessage((current) => current || "Los adjuntos requieren ejecutar la migración de Stage 2.");
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
      const upload = await supabase!.storage.from(ATTACHMENT_BUCKET).upload(path, file, { upsert: false });
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
    if (!supabase || !notes.length) return;
    const authorIds = Array.from(new Set(notes.map((n) => n.author_id).filter((id): id is string => Boolean(id))));
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
  }, [notes]);

  const isRemote = Boolean(supabase && userId);
  const canMutateNote = (note: LocalNote) => !isRemote || isAdmin || note.author_id === userId;

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

  return (
    <div className={workspace ? "min-h-full" : "fixed inset-0 z-50 flex justify-end"}>
      {!workspace ? <button
        type="button"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
        aria-label="Cerrar detalles de la materia"
        onClick={onClose}
      /> : null}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="subject-title"
        className={workspace ? "relative mx-auto flex min-h-full w-full max-w-5xl flex-col overflow-y-auto bg-[var(--surface)] px-4 py-8 sm:px-10 lg:px-16" : "relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-[var(--surface)] px-6 py-6 shadow-2xl sm:px-8"}
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
            <div className="mt-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[var(--soft)] px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-[var(--accent)] uppercase">{subject.code}</span>
                  <span className="text-[10px] font-bold tracking-[0.14em] text-[var(--muted)] uppercase">Notas elaboradas</span>
                </div>
                <span className="text-xs text-[var(--muted)]">{notes.length} {notes.length === 1 ? "nota" : "notas"}</span>
              </div>
              <h2 id="subject-title" className="mt-3 text-[28px] font-bold tracking-[-0.04em] text-[var(--ink)] leading-none">{subject.subject}</h2>
              <p className="mt-2 text-xs text-[var(--muted)]">{selectedSession ? `${formatDay(selectedSession.day)} · ${selectedSession.start} – ${selectedSession.end}` : "Contexto por materia"}</p>
            </div>
            <div className="mt-6 border-t border-[var(--line)] pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filtros de notas">
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
              {message ? <p className="mt-4 rounded-lg bg-[var(--soft)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">{message}</p> : null}
            </div>

            {isFormVisible ? (
              <form ref={formRef} onSubmit={saveNote} className="mt-6 space-y-5 rounded-xl border border-[var(--line)] bg-[var(--background)] p-4 shadow-sm sm:p-6">
                <input
                  ref={titleInputRef}
                  value={draft.title}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                  placeholder="Título del documento"
                  aria-label="Título del documento"
                  role="searchbox"
                  className="w-full border-0 bg-transparent px-0 py-2 text-3xl font-bold tracking-[-0.04em] text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-0 sm:text-4xl"
                />
                <label className="block rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-xs font-semibold text-[var(--muted)]">
                  <span className="flex items-center gap-2"><CalendarDays size={15} aria-hidden="true" /> Horario usado como contexto</span>
                  <select
                    value={selectedSessionId}
                    onChange={(event) => setDraft({ ...draft, sessionId: event.target.value })}
                    aria-label="Horario usado como contexto"
                    className="schedule-context-select mt-2 w-full bg-transparent text-sm font-normal text-[var(--ink)] outline-none"
                  >
                    <option value="">Toda la materia (sin horario específico)</option>
                    {sessions.map((session) => <option key={session.id} value={session.id}>{formatDay(session.day)} · {session.start} – {session.end} · {session.section} · {session.professor}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-y border-[var(--line)] py-4 sm:grid-cols-4">
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
                      <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="space-y-1" aria-label="Editor de bloques">
                  {draft.blocks.map((block, index) => <div key={block.id} className="flex gap-2">
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
                    <textarea value={block.text} onChange={(event) => setDraft({ ...draft, blocks: draft.blocks.map((item) => item.id === block.id ? { ...item, text: event.target.value } : item) })} rows={block.type === "heading" ? 1 : 2} placeholder={block.type === "heading" ? "Título del bloque" : "Escribí aquí... Usá / para ver comandos"} aria-label={`Texto del bloque ${index + 1}`} className={block.type === "heading" ? "min-w-0 flex-1 resize-y border-0 bg-transparent p-2 text-lg font-semibold leading-7 text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-0" : "min-w-0 flex-1 resize-y border-0 bg-transparent p-2 text-sm leading-7 text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-0"} />
                    <button type="button" onClick={() => setDraft({ ...draft, blocks: draft.blocks.filter((item) => item.id !== block.id) })} disabled={draft.blocks.length === 1} className="self-start px-1 py-2 text-xs text-[var(--muted)] opacity-0 transition hover:text-rose-500 focus-visible:opacity-100 disabled:opacity-0" aria-label="Eliminar bloque">×</button>
                  </div>)}
                  {draft.blocks.length === 1 && !draft.blocks[0].text ? <p className="ml-9 -mt-1 text-xs text-[var(--muted)]">Escribí aquí o usá / para ver comandos.</p> : null}
                  <button type="button" onClick={() => setDraft({ ...draft, blocks: [...draft.blocks, { id: crypto.randomUUID(), type: "paragraph", text: "" }] })} className="ml-9 mt-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--accent)]">+ Agregar bloque</button>
                </div>
                <label className="block border-t border-[var(--line)] pt-4 text-xs font-semibold text-[var(--muted)]">Adjuntos (imágenes, PDF u Office)
                  <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={(event) => setPendingFiles(Array.from(event.target.files ?? []))} className="mt-2 block w-full text-xs font-normal text-[var(--ink)]" />
                  {pendingFiles.length > 0 ? <span className="mt-2 block font-normal">{pendingFiles.map((file) => file.name).join(", ")}</span> : null}
                </label>
                <div className="grid gap-x-6 gap-y-3 border-t border-[var(--line)] pt-4 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-[var(--muted)]">
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
                  <label className="text-xs font-semibold text-[var(--muted)]">
                    Etiquetas
                    <input
                      value={draft.tags}
                      onChange={(event) =>
                        setDraft({ ...draft, tags: event.target.value })
                      }
                      placeholder="ej. parcial, teoría"
                      aria-label="Etiquetas separadas por comas"
                      role="searchbox"
                      className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm font-normal text-[var(--ink)]"
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
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
                <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
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

            <div className="mt-6 space-y-3 pb-10">
              {loading ? (
                <p className="text-sm text-[var(--muted)]">Cargando notas...</p>
              ) : filteredNotes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--line)] px-4 py-6 text-center text-sm text-[var(--muted)]">
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
                  return (
                  <article
                    key={note.id}
                    className={`rounded-xl border border-[var(--line)] border-l-2 border-l-[var(--accent)] bg-[var(--soft)]/20 p-4 ${note.status === "archived" ? "opacity-70" : ""}`}
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
                    {isLong && !isExpanded ? (
                      <p className="mt-2 line-clamp-4 text-sm leading-6 text-[var(--ink)]">{preview}</p>
                    ) : isLong && isExpanded ? (
                      <div className="mt-2 space-y-1 text-sm leading-6 text-[var(--ink)]">
                        {normalizeBlocks(note.blocks, note.content).map((block) => <div key={block.id} className={block.type === "heading" ? "font-semibold" : ""}>{block.type === "bullet" ? "• " : block.type === "checklist" ? `${block.checked ? "☑" : "☐"} ` : ""}{block.text}</div>)}
                      </div>
                    ) : (
                      <div className="mt-2 space-y-1 text-sm leading-6 text-[var(--ink)]">
                        {normalizeBlocks(note.blocks, note.content).map((block) => <div key={block.id} className={block.type === "heading" ? "font-semibold" : ""}>{block.type === "bullet" ? "• " : block.type === "checklist" ? `${block.checked ? "☑" : "☐"} ` : ""}{block.text}</div>)}
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
                    {(attachments[note.id] ?? note.attachments).length > 0 ? <div className="mt-3 space-y-2 border-t border-[var(--line)] pt-3">
                      <p className="text-xs font-semibold text-[var(--muted)]">Adjuntos</p>
                      {(attachments[note.id] ?? note.attachments).map((attachment) => <div key={attachment.id} className="flex items-center gap-2 text-xs">
                        {attachment.mime_type.startsWith("image/") && attachment.url ? <img src={attachment.url} alt={attachment.name} className="h-10 w-10 rounded object-cover" /> : <a href={attachment.url} download={attachment.name} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[var(--accent)]">{attachment.name}</a>}
                        {attachment.mime_type.startsWith("image/") ? <a href={attachment.url} download={attachment.name} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[var(--accent)]">{attachment.name}</a> : null}
                         {canMutateNote(note) ? <button type="button" onClick={() => void deleteAttachment(note.id, attachment)} className="shrink-0 text-rose-500">Eliminar</button> : null}
                      </div>)}
                    </div> : null}
                    <div className="mt-3 flex items-center justify-between">
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
                  </article>
                  );
                })
              )}
            </div>
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
                  return (
                  <article
                    key={note.id}
                    className={`rounded-xl border border-[var(--line)] border-l-2 border-l-[var(--accent)] bg-[var(--soft)]/20 p-4 ${note.status === "archived" ? "opacity-70" : ""}`}
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
                    {(attachments[note.id] ?? note.attachments).length > 0 ? <div className="mt-3 space-y-2 border-t border-[var(--line)] pt-3">
                      <p className="text-xs font-semibold text-[var(--muted)]">Adjuntos</p>
                      {(attachments[note.id] ?? note.attachments).map((attachment) => <div key={attachment.id} className="flex items-center gap-2 text-xs">
                        {attachment.mime_type.startsWith("image/") && attachment.url ? <img src={attachment.url} alt={attachment.name} className="h-10 w-10 rounded object-cover" /> : <a href={attachment.url} download={attachment.name} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[var(--accent)]">{attachment.name}</a>}
                        {attachment.mime_type.startsWith("image/") ? <a href={attachment.url} download={attachment.name} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[var(--accent)]">{attachment.name}</a> : null}
                         {canMutateNote(note) ? <button type="button" onClick={() => void deleteAttachment(note.id, attachment)} className="shrink-0 text-rose-500">Eliminar</button> : null}
                      </div>)}
                    </div> : null}
                    <div className="mt-3 flex items-center justify-between">
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
                  </article>
                  );
                })
              )}
            </div>
          </>
        )}
      </aside>
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
