export type NoteStatus = "active" | "archived";
export type NoteBlockType = "paragraph" | "heading" | "bullet" | "checklist";
export type NoteBlock = {
  id: string;
  type: NoteBlockType;
  text: string;
  checked?: boolean;
};
export type NoteAttachment = {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  url: string;
  path?: string;
  created_at: string;
};
export type LocalNote = {
  id: string;
  author_id?: string | null;
  title: string;
  content: string;
  blocks: NoteBlock[];
  attachments: NoteAttachment[];
  note_date: string | null;
  tags: string[];
  status: NoteStatus;
  created_at: string;
  updated_at: string;
  session_id?: string | null;
};

export const notesChangedEvent = "horarium:notes-changed";
export const MAX_NOTE_CONTENT_LENGTH = 2000;
export const LOCAL_ATTACHMENT_LIMIT = 2 * 1024 * 1024;
export const REMOTE_ATTACHMENT_LIMIT = 10 * 1024 * 1024;
export const ATTACHMENT_BUCKET = "note-attachments";
export const allowedAttachmentTypes = [
  "image/", "application/pdf", "text/plain", "text/csv",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

function canonicalNotesKey(subjectCode: string) { return `horarium:notes:subject:${subjectCode}`; }
function legacyNotesKey(entryId: string) { return `horarium:notes:${entryId}`; }

export function blocksFromContent(content: string): NoteBlock[] {
  return [{ id: crypto.randomUUID(), type: "paragraph", text: content }];
}

export function plainTextFromBlocks(blocks: NoteBlock[]) {
  return blocks.map((block) => block.text.trim()).filter(Boolean).join("\n");
}

export function contentFromBlocks(blocks: NoteBlock[]) {
  return plainTextFromBlocks(blocks).slice(0, MAX_NOTE_CONTENT_LENGTH);
}

export function normalizeBlocks(value: unknown, content = ""): NoteBlock[] {
  if (!Array.isArray(value)) return blocksFromContent(content);
  const blocks = value.flatMap((item): NoteBlock[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<NoteBlock>;
    const type: NoteBlockType = candidate.type === "heading" || candidate.type === "bullet" || candidate.type === "checklist" ? candidate.type : "paragraph";
    return [{ id: typeof candidate.id === "string" ? candidate.id : crypto.randomUUID(), type, text: typeof candidate.text === "string" ? candidate.text : "", checked: type === "checklist" ? Boolean(candidate.checked) : undefined }];
  });
  return blocks.length > 0 ? blocks : blocksFromContent(content);
}

export function normalizeTags(tags: unknown[]): string[] {
  return Array.from(new Set(tags.map((tag) => String(tag).trim()).filter(Boolean)));
}

export function isAllowedAttachment(file: { type: string; name: string; size: number }, limit: number) {
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const allowedExtension = ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf", "txt", "csv"].includes(extension);
  return file.size <= limit && (allowedAttachmentTypes.some((type) => type.endsWith("/") ? file.type.startsWith(type) : file.type === type) || allowedExtension);
}

export function readLocalNotes(subjectCode: string, legacyEntryIds: string[] = []): LocalNote[] {
  try {
    if (typeof window === "undefined") return [];
    const storage = window.localStorage;
    const canonicalKey = canonicalNotesKey(subjectCode);
    const stored = storage.getItem(canonicalKey);
    if (stored !== null) {
      const parsed: unknown = JSON.parse(stored);
      const notes = Array.isArray(parsed) ? parsed.map(normalizeNote).filter(isLocalNote) : [];
      storage.setItem(canonicalKey, JSON.stringify(notes));
      return notes;
    }
    const migrated = Array.from(new Map(legacyEntryIds.flatMap((entryId) => {
      const legacy = storage.getItem(legacyNotesKey(entryId));
      if (!legacy) return [];
      const parsed: unknown = JSON.parse(legacy);
      return Array.isArray(parsed) ? parsed.map(normalizeNote).filter(isLocalNote) : [];
    }).map((note) => [note.id, note])).values());
    if (migrated.length > 0) storage.setItem(canonicalKey, JSON.stringify(migrated));
    for (const entryId of legacyEntryIds) storage.removeItem(legacyNotesKey(entryId));
    return migrated;
  } catch { return []; }
}

export function writeLocalNotes(subjectCode: string, notes: LocalNote[]) {
  try {
    if (typeof window === "undefined") return false;
    window.localStorage.setItem(canonicalNotesKey(subjectCode), JSON.stringify(notes));
    window.dispatchEvent(new CustomEvent(notesChangedEvent));
    return true;
  } catch { return false; }
}

function isLocalNote(note: unknown): note is LocalNote {
  return Boolean(note) && typeof note === "object" && typeof (note as LocalNote).id === "string" && typeof (note as LocalNote).title === "string" && typeof (note as LocalNote).content === "string" && Array.isArray((note as LocalNote).blocks) && Array.isArray((note as LocalNote).attachments) && typeof (note as LocalNote).created_at === "string" && typeof (note as LocalNote).updated_at === "string" && Array.isArray((note as LocalNote).tags) && ((note as LocalNote).status === "active" || (note as LocalNote).status === "archived");
}

function normalizeNote(note: unknown): unknown {
  if (!note || typeof note !== "object") return note;
  const legacy = note as Partial<LocalNote>;
  const createdAt = typeof legacy.created_at === "string" ? legacy.created_at : new Date().toISOString();
  const blocks = normalizeBlocks(legacy.blocks, typeof legacy.content === "string" ? legacy.content : "");
  return {
    ...legacy,
    title: typeof legacy.title === "string" && legacy.title.trim() ? legacy.title.trim() : "Sin título",
    content: contentFromBlocks(blocks), blocks,
    attachments: Array.isArray(legacy.attachments) ? legacy.attachments : [],
    note_date: typeof legacy.note_date === "string" && legacy.note_date ? legacy.note_date : null,
    tags: Array.isArray(legacy.tags) ? normalizeTags(legacy.tags) : [],
    status: legacy.status === "archived" ? "archived" : "active",
    created_at: createdAt, updated_at: typeof legacy.updated_at === "string" ? legacy.updated_at : createdAt,
  };
}
