"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, FileText } from "lucide-react";
import { motion } from "framer-motion";
import { SubjectModal } from "@/components/subject-modal";
import { notesChangedEvent, readLocalNotes } from "@/lib/notes-storage";
import type { ScheduleEntry } from "@/lib/schedule-data";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { cardHover, hoverTransition, staggerContainer, staggerItem, useReducedMotion } from "@/lib/motion";

type NotesFocus = { subjectId: string | null; noteId: string | null; commentId: string | null } | null;

export function NotesBoard({ schedule, focus }: { schedule: ScheduleEntry[]; focus?: NotesFocus }) {
  const [query, setQuery] = useState("");
  const [selectedCode, setSelectedCode] = useState("");
  const { userId } = useAuth();
  const reduced = useReducedMotion();
  const authResolved = true;
  const [remoteCounts, setRemoteCounts] = useState<Record<string, number>>({});
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countsVersion, setCountsVersion] = useState(0);
  const LIVE_NOTES_ENABLED = process.env.NEXT_PUBLIC_LIVE_NOTES_ENABLED !== "false";
  type LiveNoteCard = { id: string; subject_id: string; title: string; drive_web_view_link: string; drive_file_id: string; expires_at: string | null; created_at: string; is_active?: boolean };
  const [liveMap, setLiveMap] = useState<Record<string, LiveNoteCard | null>>({});
  const [liveCopiedId, setLiveCopiedId] = useState<string | null>(null);
  const subjectGroups = Array.from(new Map(schedule.map((entry) => [entry.code, entry])).values()).map((subject) => ({
    subject,
    entries: schedule.filter((entry) => entry.code === subject.code),
  }));

  useEffect(() => {
    setRemoteCounts({});
    setError("");
    setLoading(Boolean(supabase && userId));
  }, [userId]);

  useEffect(() => {
    if (!authResolved || !supabase || !userId) {
      if (!userId) setLoading(false);
      return;
    }
    let active = true;
    const subjectIds = Array.from(new Set(schedule.map((entry) => entry.subjectId)));
    if (subjectIds.length === 0) return () => { active = false; };
    void supabase.from("notes").select("subject_id").in("subject_id", subjectIds).then(({ data, error: queryError }) => {
      if (!active) return;
      if (queryError) { setError("No se pudieron cargar las notas compartidas."); setRemoteCounts({}); }
      else { setError(""); const next: Record<string, number> = {}; for (const note of data ?? []) next[note.subject_id] = (next[note.subject_id] ?? 0) + 1; setRemoteCounts(next); }
      setLoading(false);
    });
    return () => { active = false; };
  }, [authResolved, countsVersion, schedule, userId]);

  useEffect(() => {
    const refresh = () => setCountsVersion((version) => version + 1);
    window.addEventListener(notesChangedEvent, refresh);
    return () => window.removeEventListener(notesChangedEvent, refresh);
  }, []);

  useEffect(() => {
    if (!focus?.subjectId) return;
    const entry = schedule.find((item) => item.subjectId === focus.subjectId);
    if (entry && entry.code !== selectedCode) setSelectedCode(entry.code);
  }, [focus, schedule, selectedCode]);

  const fetchLiveForSubjects = useCallback(async (subjectIds: string[]) => {
    if (!LIVE_NOTES_ENABLED || subjectIds.length === 0) return;
    const entries = await Promise.all(
      subjectIds.map(async (sid) => {
        try {
          const res = await fetch(`/api/drive/live-note?subjectId=${encodeURIComponent(sid)}`, { cache: "no-store" });
          if (res.status === 404) return [sid, null] as const;
          if (!res.ok) return [sid, null] as const;
          const raw = (await res.json().catch(() => null)) as { live?: LiveNoteCard | null } | null;
          const data = (raw?.live ?? null) as LiveNoteCard | null;
          if (data && data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return [sid, null] as const;
          if (!data || !data.id || !data.drive_web_view_link) return [sid, null] as const;
          // Map url field variations: API may return url or drive_web_view_link
          const normalized: LiveNoteCard = {
            id: data.id,
            subject_id: (data as unknown as { subject_id?: string }).subject_id ?? sid,
            title: data.title ?? "Apuntes en vivo",
            drive_web_view_link: data.drive_web_view_link ?? (data as unknown as { url?: string }).url ?? "",
            drive_file_id: data.drive_file_id ?? "",
            expires_at: data.expires_at ?? null,
            created_at: data.created_at ?? new Date().toISOString(),
            is_active: (data as unknown as { is_active?: boolean }).is_active ?? true,
          };
          if (!normalized.drive_web_view_link) return [sid, null] as const;
          if (normalized.expires_at && new Date(normalized.expires_at).getTime() <= Date.now()) return [sid, null] as const;
          return [sid, normalized] as const;
        } catch {
          return [sid, null] as const;
        }
      }),
    );
    setLiveMap((prev) => {
      const next = { ...prev };
      for (const [sid, card] of entries) next[sid] = card;
      return next;
    });
  }, [LIVE_NOTES_ENABLED]);

  useEffect(() => {
    const ids = Array.from(new Set(schedule.map((e) => e.subjectId)));
    void fetchLiveForSubjects(ids);
  }, [fetchLiveForSubjects, schedule]);

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { subjectId?: string } | undefined;
      if (detail?.subjectId) void fetchLiveForSubjects([detail.subjectId]);
      else {
        const ids = Array.from(new Set(schedule.map((e) => e.subjectId)));
        void fetchLiveForSubjects(ids);
      }
    };
    window.addEventListener("horarium:live-notes-changed", handler as EventListener);
    window.addEventListener("notifications-updated", handler as EventListener);
    return () => {
      window.removeEventListener("horarium:live-notes-changed", handler as EventListener);
      window.removeEventListener("notifications-updated", handler as EventListener);
    };
  }, [fetchLiveForSubjects, schedule]);

  const handleCopyLiveLink = useCallback(async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setLiveCopiedId(id);
      window.setTimeout(() => setLiveCopiedId((prev) => (prev === id ? null : prev)), 2000);
    } catch {
      // fallback: open prompt
      window.prompt("Copiá el enlace:", url);
    }
  }, []);

  const subjects = subjectGroups.map(({ subject, entries }) => ({
    subject,
    sections: Array.from(new Set(entries.map((entry) => entry.section))),
    count: supabase && userId ? remoteCounts[subject.subjectId] ?? 0 : readLocalNotes(subject.code, entries.map((entry) => entry.id)).length,
  }));
  const filteredSubjects = subjects.filter(({ subject, sections }) => `${subject.subject} ${subject.code} ${sections.join(" ")}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const selectedSubject = subjectGroups.find(({ subject }) => subject.code === selectedCode)?.subject ?? subjectGroups[0]?.subject;
  const selectedSessions = selectedSubject ? schedule.filter((entry) => entry.subjectId === selectedSubject.subjectId) : [];

  return <section aria-label="Notas" className="mx-auto w-full max-w-[1440px] min-w-0 max-w-full overflow-x-hidden">
    <div className="mb-7 flex w-full max-w-full min-w-0 flex-col gap-4 overflow-x-hidden lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 max-w-full"><p className="text-xs font-bold tracking-[0.14em] text-[var(--accent)] uppercase">Espacio de estudio</p><h1 className="mt-1 break-words text-[28px] font-bold tracking-[-0.04em] text-[var(--ink)]">Notas elaboradas</h1><p className="mt-1 max-w-2xl break-words text-sm leading-6 text-[var(--muted)]">Organizá documentos con bloques, fechas, etiquetas y adjuntos. Las notas rápidas siguen disponibles desde Horario.</p></div>
      <motion.label whileFocus={{ scale: 1.01 }} transition={{ duration: 0.15 }} className="block w-full min-w-0 max-w-full shrink-0 overflow-hidden lg:ml-auto lg:w-[360px] lg:max-w-[360px]"><span className="sr-only">Buscar materias</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por materia, código o sección..." aria-label="Buscar materias" className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15" /></motion.label>
    </div>
    {error ? <p role="alert" className="mb-5 max-w-full break-words rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-600">{error}</p> : null}
    {filteredSubjects.length === 0 ? <div className="max-w-full overflow-hidden rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-12 text-center"><h2 className="break-words text-lg font-semibold text-[var(--ink)]">{subjects.length === 0 ? "No hay materias disponibles" : "No encontramos materias"}</h2><p className="mt-2 break-words text-sm text-[var(--muted)]">{subjects.length === 0 ? "El calendario todavía no tiene materias para seleccionar." : "Probá con otro término de búsqueda."}</p></div> : <div className="grid w-full max-w-full min-w-0 gap-6 overflow-x-hidden xl:grid-cols-[260px_minmax(0,1fr)]">
      <div className="min-w-0 max-w-full overflow-x-hidden">
        <p className="px-1 text-xs font-bold tracking-[0.14em] text-[var(--muted)] uppercase">Materias</p>
        <motion.nav
          aria-label="Materias con notas"
          className="mt-2 flex gap-2 overflow-x-auto overflow-y-hidden pb-2 xl:mt-0 xl:block xl:space-y-2 xl:overflow-visible xl:pb-0 w-full max-w-full min-w-0"
          variants={reduced ? undefined : staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {filteredSubjects.map(({ subject, sections, count }) => (
            <motion.button
              key={subject.code}
              type="button"
              onClick={() => setSelectedCode(subject.code)}
              variants={reduced ? undefined : staggerItem}
              whileHover={reduced ? undefined : cardHover}
              whileTap={reduced ? undefined : { scale: 0.99 }}
              transition={hoverTransition}
              className={`notes-subject-card flex w-[260px] max-w-[72vw] shrink-0 items-center justify-between rounded-xl border p-4 text-left xl:w-full xl:max-w-none xl:shrink ${selectedCode === subject.code ? "border-[var(--accent)] bg-[var(--sidebar-accent)]" : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--accent)]"}`}
            >
              <span className="min-w-0 flex-1"><span className="block text-[10px] font-bold tracking-[0.12em] text-[var(--accent)] uppercase">{subject.code}</span><strong className="mt-1 block truncate text-sm font-bold text-[var(--ink)]">{subject.subject}</strong><span className="mt-1 block truncate text-xs text-[var(--muted)]">{sections.join(" · ")}</span></span><span className="ml-3 shrink-0 text-xs font-semibold text-[var(--accent)]">{count}</span>
            </motion.button>
          ))}
        </motion.nav>
      </div>
      <div className="min-w-0 max-w-full overflow-x-hidden">
        {selectedSubject && LIVE_NOTES_ENABLED && liveMap[selectedSubject.subjectId] ? (
          <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
                  <span className="text-[10px] font-bold tracking-[0.14em] text-red-600 uppercase">EN VIVO</span>
                  <span className="text-xs text-amber-700">{(() => {
                    const c = liveMap[selectedSubject.subjectId]!;
                    const d = c.created_at ? new Date(c.created_at) : new Date();
                    const fecha = d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
                    const materia = selectedSubject.subject;
                    return `${materia} — ${fecha}`;
                  })()}</span>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-[var(--ink)]">
                  <FileText size={14} className="shrink-0 text-amber-600" aria-hidden="true" /> {liveMap[selectedSubject.subjectId]!.title}
                </p>
                <p className="mt-1 text-xs text-amber-700">Documento colaborativo en Drive · se archiva tras 4 h (link persiste como editor anyone-with-link)</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <a
                  href={liveMap[selectedSubject.subjectId]!.drive_web_view_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                >
                  <ExternalLink size={12} aria-hidden="true" /> Abrir en Drive
                </a>
                <button
                  type="button"
                  onClick={() => void handleCopyLiveLink(liveMap[selectedSubject.subjectId]!.drive_web_view_link, liveMap[selectedSubject.subjectId]!.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                >
                  <Copy size={12} aria-hidden="true" /> {liveCopiedId === liveMap[selectedSubject.subjectId]!.id ? "¡Copiado!" : "Copiar link"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {selectedSubject ? <SubjectModal workspace subject={selectedSubject} sessions={selectedSessions} legacyEntryIds={[...selectedSessions.map((entry) => entry.id)]} highlightNoteId={focus?.subjectId === selectedSubject.subjectId ? focus.noteId : null} highlightCommentId={focus?.subjectId === selectedSubject.subjectId ? focus.commentId : null} onClose={() => undefined} /> : null}
      </div>
    </div>}
  </section>;
}
