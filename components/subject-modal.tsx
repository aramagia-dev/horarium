"use client";

/* Signed Supabase URLs and local data URLs are intentionally rendered without Next image optimization. */
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useCallback, useEffect, useState } from "react";
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
  });
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachments, setAttachments] = useState<Record<string, NoteAttachment[]>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [message, setMessage] = useState(
    supabaseConfigured
      ? ""
      : "Las notas se guardan en este navegador. Configurá Supabase para compartirlas.",
  );
  const classDate =
    date ??
    addLocalDays(
      getWeekStart(new Date()),
      ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].indexOf(
        subject.day,
      ),
    );
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (active) {
        const nextUserId = data.session?.user?.id ?? null;
        setUserId(nextUserId);
        if (nextUserId) {
          const profile = await supabase!.from("profiles").select("role").eq("id", nextUserId).maybeSingle();
          if (active) setIsAdmin(profile.data?.role === "admin");
        } else setIsAdmin(false);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (active) {
          const nextUserId = session?.user?.id ?? null;
          setUserId(nextUserId);
          if (nextUserId) void supabase!.from("profiles").select("role").eq("id", nextUserId).maybeSingle().then(({ data }) => { if (active) setIsAdmin(data?.role === "admin"); });
          else setIsAdmin(false);
        }
      },
    );
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

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
        "id, author_id, title, content, blocks, note_date, tags, status, created_at, updated_at",
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
      setNotes(noteRows.map((note) => ({ id: String(note.id), author_id: typeof note.author_id === "string" ? note.author_id : null, title: typeof note.title === "string" ? note.title : "Sin título", content: typeof note.content === "string" ? note.content : "", blocks: normalizeBlocks(note.blocks, typeof note.content === "string" ? note.content : ""), attachments: [], note_date: typeof note.note_date === "string" ? note.note_date : null, tags: Array.isArray(note.tags) ? note.tags.map(String) : [], status: note.status === "archived" ? "archived" : "active", created_at: String(note.created_at), updated_at: String(note.updated_at) })));
      const noteIds = noteRows.map((note) => String(note.id));
      if (noteIds.length > 0) {
        const attachmentResult = await supabase!.from("note_attachments").select("id, note_id, name, mime_type, size, storage_path, created_at").in("note_id", noteIds);
        if (!attachmentResult.error) {
          const grouped: Record<string, NoteAttachment[]> = {};
          for (const item of attachmentResult.data ?? []) {
            const signed = await supabase!.storage.from(ATTACHMENT_BUCKET).createSignedUrl(item.storage_path, 3600);
            (grouped[item.note_id] ??= []).push({ id: item.id, name: item.name, mime_type: item.mime_type, size: item.size, path: item.storage_path, url: signed.data?.signedUrl ?? "", created_at: item.created_at });
          }
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
      setDraft({
        title: "",
        blocks: [{ id: crypto.randomUUID(), type: "paragraph", text: "" }],
        noteDate: "",
        tags: "",
        status: "active",
      });
      setEditingId(null);
      setPendingFiles([]);
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
      setDraft({
        title: "",
        blocks: [{ id: crypto.randomUUID(), type: "paragraph", text: "" }],
        noteDate: "",
        tags: "",
        status: "active",
      });
      setEditingId(null);
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
    });
    setPendingFiles([]);
    setEditingId(note.id);
  };
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
        <div className={workspace ? "flex items-center justify-between border-b border-[var(--line)] pb-4" : "flex items-center justify-between"}>
          <span className={workspace ? "text-xs font-bold tracking-[0.14em] text-[var(--accent)] uppercase" : "rounded-full bg-[var(--soft)] px-3 py-1 text-[10px] font-bold tracking-[0.14em] text-[var(--accent)] uppercase"}>
            {subject.code}
          </span>
          {!workspace ? <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-[var(--muted)] hover:bg-[var(--soft)]"
            aria-label="Cerrar"
          >
            ×
          </button> : null}
        </div>
        {workspace ? <span className="mt-8 text-[10px] font-bold tracking-[0.16em] text-[var(--muted)] uppercase">Notas elaboradas</span> : null}
        <form onSubmit={saveNote} className={workspace ? "order-1 mt-8 space-y-5" : "order-3 mt-5 space-y-2"}>
          <input
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
            placeholder="Título del documento"
            aria-label="Título del documento"
            role="searchbox"
            className={workspace ? "w-full border-0 bg-transparent px-0 py-2 text-3xl font-bold tracking-[-0.04em] text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-0 sm:text-4xl" : "w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm font-semibold text-[var(--ink)] outline-none focus:border-[var(--accent)]"}
          />
          {workspace ? <>
            <h2 id="subject-title" className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
              {subject.subject}
            </h2>
            <p className="text-xs text-[var(--muted)]">
              {formatClassDate(classDate)} · {subject.start} – {subject.end}
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-y border-[var(--line)] py-4 sm:grid-cols-4">
              {[
                ["Profesor", subject.professor],
                ["Sección", subject.section],
                ["Aula", subject.room],
                ["Duración", `${minutes(subject.start, subject.end)} min`],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <p className="text-[10px] font-bold tracking-[0.12em] text-[var(--muted)] uppercase">
                    {label}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </> : null}
          {workspace ? <div className="space-y-1 border-t border-[var(--line)] pt-6" aria-label="Editor de bloques">
            {draft.blocks.map((block, index) => <div key={block.id} className="flex gap-2">
              <select value={block.type} onChange={(event) => setDraft({ ...draft, blocks: draft.blocks.map((item) => item.id === block.id ? { ...item, type: event.target.value as NoteBlockType, checked: event.target.value === "checklist" ? Boolean(item.checked) : undefined } : item) })} aria-label={`Tipo del bloque ${index + 1}`} className="w-7 shrink-0 appearance-none border-0 bg-transparent p-0 text-[10px] text-[var(--muted)] outline-none focus:ring-2 focus:ring-[var(--accent)] sm:w-8">
                <option value="paragraph">Párrafo</option><option value="heading">Título</option><option value="bullet">Viñeta</option><option value="checklist">Checklist</option>
              </select>
              {block.type === "checklist" ? <input type="checkbox" checked={Boolean(block.checked)} onChange={(event) => setDraft({ ...draft, blocks: draft.blocks.map((item) => item.id === block.id ? { ...item, checked: event.target.checked } : item) })} aria-label="Marcar checklist" className="mt-3 accent-[var(--accent)]" /> : null}
              <textarea value={block.text} onChange={(event) => setDraft({ ...draft, blocks: draft.blocks.map((item) => item.id === block.id ? { ...item, text: event.target.value } : item) })} rows={block.type === "heading" ? 1 : 2} placeholder={block.type === "heading" ? "Título del bloque" : "Escribí aquí... Usá / para ver comandos"} aria-label={`Texto del bloque ${index + 1}`} className={block.type === "heading" ? "min-w-0 flex-1 resize-y border-0 bg-transparent p-2 text-lg font-semibold leading-7 text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-0" : "min-w-0 flex-1 resize-y border-0 bg-transparent p-2 text-sm leading-7 text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-0"} />
              <button type="button" onClick={() => setDraft({ ...draft, blocks: draft.blocks.filter((item) => item.id !== block.id) })} disabled={draft.blocks.length === 1} className="self-start px-1 py-2 text-xs text-[var(--muted)] opacity-0 transition hover:text-rose-500 focus-visible:opacity-100 disabled:opacity-0" aria-label="Eliminar bloque">×</button>
            </div>)}
            {draft.blocks.length === 1 && !draft.blocks[0].text ? <p className="ml-9 -mt-1 text-xs text-[var(--muted)]">Escribí aquí o usá / para ver comandos.</p> : null}
            <button type="button" onClick={() => setDraft({ ...draft, blocks: [...draft.blocks, { id: crypto.randomUUID(), type: "paragraph", text: "" }] })} className="ml-9 mt-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--accent)]">+ Agregar bloque</button>
          </div> : <textarea value={draft.blocks[0]?.text ?? ""} onChange={(event) => setDraft({ ...draft, blocks: [{ id: draft.blocks[0]?.id ?? crypto.randomUUID(), type: "paragraph", text: event.target.value }] })} rows={4} placeholder="Escribí una nota rápida..." aria-label="Texto de la nota" className="w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--accent)]" />}
          {workspace ? <label className="block border-t border-[var(--line)] pt-4 text-xs font-semibold text-[var(--muted)]">Adjuntos (imágenes, PDF u Office)
            <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={(event) => setPendingFiles(Array.from(event.target.files ?? []))} className="mt-2 block w-full text-xs font-normal text-[var(--ink)]" />
            {pendingFiles.length > 0 ? <span className="mt-2 block font-normal">{pendingFiles.map((file) => file.name).join(", ")}</span> : null}
          </label> : null}
          {workspace ? <div className="grid gap-x-6 gap-y-3 border-t border-[var(--line)] pt-4 sm:grid-cols-2">
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
          </div> : null}
          {workspace ? <label className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
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
          </label> : null}
          <div className={workspace ? "flex justify-end gap-2 border-t border-[var(--line)] pt-4" : "flex justify-end gap-2"}>
            {editingId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setDraft({
                    title: "",
                    blocks: [{ id: crypto.randomUUID(), type: "paragraph", text: "" }],
                    noteDate: "",
                    tags: "",
                    status: "active",
                  });
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
        <div className={workspace ? "order-2" : "order-1"}>
          {!workspace ? <>
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
          </> : null}
          <section
            aria-labelledby="weekly-sessions-title"
            className={workspace ? "mt-12 border-b border-[var(--line)] pb-5" : "mt-8 border-t border-[var(--line)] pt-6"}
          >
            <p id="weekly-sessions-title" className="text-xs font-bold tracking-[0.14em] text-[var(--accent)] uppercase">
              Sesiones semanales
            </p>
            <div className={workspace ? "mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2" : "mt-3 space-y-2"}>
              {sessions.map((session) => (
                <div key={session.id} className={workspace ? "border-l-2 border-[var(--line)] py-1 pl-3" : "rounded-xl border border-[var(--line)] bg-[var(--background)] p-3"}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--ink)]">{formatDay(session.day)} · {session.start} – {session.end}</p>
                    <span className="text-xs text-[var(--muted)]">{session.section}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">{session.professor} · {session.room}</p>
                </div>
              ))}
            </div>
          </section>
          <div className={workspace ? "my-10 border-t border-[var(--line)]" : "my-8 border-t border-[var(--line)]"} />
          <div className={workspace ? "flex items-end justify-between px-1" : "flex items-end justify-between"}>
            <div>
              <p className="text-xs font-bold tracking-[0.14em] text-[var(--accent)] uppercase">Notas compartidas</p>
              <h3 className={workspace ? "mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]" : "mt-1 text-lg font-semibold text-[var(--ink)]"}>Mantené el contexto cerca.</h3>
            </div>
            <span className="text-xs text-[var(--muted)]">{notes.length} {notes.length === 1 ? "nota" : "notas"}</span>
          </div>
          {message ? <p className="mt-4 rounded-lg bg-[var(--soft)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">{message}</p> : null}
        </div>
        <div className={workspace ? "order-3 mt-12 space-y-5 pb-10" : "order-4 mt-6 space-y-3"}>
          {loading ? (
            <p className="text-sm text-[var(--muted)]">Cargando notas...</p>
          ) : notes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--line)] px-4 py-6 text-center text-sm text-[var(--muted)]">
              Todavía no hay notas. Agregá la primera arriba.
            </div>
          ) : (
            notes.map((note) => (
              <article
                key={note.id}
                className={`${workspace ? "border-t border-[var(--line)] py-5" : "rounded-xl border border-[var(--line)] bg-[var(--background)] p-4"} ${note.status === "archived" ? "opacity-70" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-semibold text-[var(--ink)]">
                    {note.title}
                  </h4>
                  <span className="rounded-full bg-[var(--soft)] px-2 py-1 text-[10px] font-semibold text-[var(--muted)]">
                    {note.status === "archived" ? "Archivada" : "Activa"}
                  </span>
                </div>
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
                     {workspace && canMutateNote(note) ? <button type="button" onClick={() => void deleteAttachment(note.id, attachment)} className="shrink-0 text-rose-500">Eliminar</button> : null}
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
            ))
          )}
        </div>
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
