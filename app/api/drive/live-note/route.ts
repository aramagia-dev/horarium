import "server-only";

import { NextResponse } from "next/server";

import { getAuthUser, getServiceClient } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  createLiveDoc,
  deleteFile,
  getLiveDocName,
  getLiveNoteExpiry,
  resolveFolderId,
  setAnyoneWriter,
} from "@/lib/google-drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(data: unknown, init?: number | ResponseInit) {
  const status = typeof init === "number" ? init : (init as ResponseInit)?.status;
  const headers = typeof init === "number" ? undefined : (init as ResponseInit)?.headers;
  return NextResponse.json(data, { status, headers } as ResponseInit);
}

function isDriveRateLimitedError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? "");
  const code = (err as { code?: number | string })?.code;
  const status = (err as { status?: number })?.status ?? (err as { response?: { status?: number } })?.response?.status;
  if (code === 429 || status === 429) return true;
  if (msg.includes("429") || msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("quotaexceeded"))
    return true;
  return false;
}

function isDriveRetryableError(err: unknown): boolean {
  const status = (err as { status?: number })?.status ?? (err as { response?: { status?: number } })?.response?.status;
  const code = (err as { code?: number | string })?.code;
  const s = typeof status === "number" ? status : typeof code === "number" ? code : null;
  if (s === 403 || s === 429 || (s !== null && s >= 500)) return true;
  const msg = String((err as { message?: string })?.message ?? "").toLowerCase();
  if (msg.includes("403") || msg.includes("429") || msg.includes("500") || msg.includes("503")) return true;
  return false;
}

function isQuotaExceededError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? "").toLowerCase();
  const causeMsg = String((err as { cause?: { message?: string } })?.cause?.message ?? "").toLowerCase();
  const combined = msg + " " + causeMsg;
  return combined.includes("storage quota") || combined.includes("quota has been exceeded");
}

function mapDriveErrorStatus(err: unknown): number {
  if (isQuotaExceededError(err)) return 507;
  if (isDriveRateLimitedError(err)) return 429;
  if (isDriveRetryableError(err)) return 502;
  return 500;
}

// ---------------------------------------------------------------------------
// GET /api/drive/live-note?subjectId=
// Lazy expiry: only rows with status='live' AND expires_at > now() are live.
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  const { user } = await getAuthUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  const subjectId = url.searchParams.get("subjectId")?.trim() ?? "";
  if (!subjectId) return json({ error: "subjectId required", code: "MISSING_SUBJECT" }, 422);

  try {
    const supabase = getServiceClient();
    const nowIso = new Date().toISOString();

    // Lazy filter: live only if not expired
    const { data: live, error: liveErr } = await supabase
      .from("live_notes")
      .select("id, subject_id, created_by, title, drive_file_id, drive_web_view_link, folder_id, status, created_at, expires_at, archived_at")
      .eq("subject_id", subjectId)
      .eq("status", "live")
      .gt("expires_at", nowIso)
      .maybeSingle();

    if (liveErr) throw liveErr;

    // History: archived or expired not needed for PR2 minimal; return empty or recent archived
    // Keep contract {live, history} as per tasks 2.2; fetch last 20 archived for convenience
    const { data: history } = await supabase
      .from("live_notes")
      .select("id, subject_id, title, drive_file_id, drive_web_view_link, folder_id, status, created_at, expires_at, archived_at")
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: false })
      .limit(20);

    // Filter history to archived only (exclude live row if present)
    const historyFiltered = (history ?? []).filter((r: { status: string; id: string }) => r.status === "archived" || (live && r.id !== (live as { id: string }).id && r.status !== "live"));

    return json({ live: live ?? null, history: historyFiltered });
  } catch (e) {
    console.error("[GET live-note] error", e);
    return json({ error: "Internal error" }, 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/drive/live-note  {subjectId}
// 201 {id,url,expires_at} | 409 {existing:true,id,url} | 422 FOLDER_NOT_CONFIGURED | 429 | 401 | 502 retryable
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  let body: { subjectId?: string } = {};
  try {
    body = (await req.json()) as { subjectId?: string };
  } catch {
    return json({ error: "Invalid JSON" }, 422);
  }
  const subjectId = typeof body.subjectId === "string" ? body.subjectId.trim() : "";
  if (!subjectId) return json({ error: "subjectId required", code: "MISSING_SUBJECT" }, 422);

  const { user } = await getAuthUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  // Rate-limit: 5/min global + 1/60s per subject
  const rl = checkRateLimit(user.id, subjectId);
  if (!rl.allowed) {
    const retryAfter = rl.retryAfter ?? 60;
    return json({ error: "Rate limited", retryable: true, retryAfter }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  const supabase = getServiceClient();

  // Early 409 check: live exists and not expired (avoid Drive call when already live)
  try {
    const nowIso = new Date().toISOString();
    const { data: existing, error: existErr } = await supabase
      .from("live_notes")
      .select("id, drive_web_view_link, expires_at, status")
      .eq("subject_id", subjectId)
      .eq("status", "live")
      .gt("expires_at", nowIso)
      .maybeSingle();
    if (existErr) throw existErr;
    if (existing) {
      return json(
        { existing: true, id: (existing as { id: string }).id, url: (existing as { drive_web_view_link: string }).drive_web_view_link },
        409,
      );
    }
  } catch (e) {
    console.error("[POST live-note] existing check failed", e);
    return json({ error: "Internal error" }, 500);
  }

  // Resolve folderId — 422 if not configured (no auto-create)
  let folderId: string | null;
  try {
    folderId = await resolveFolderId(subjectId);
  } catch (e) {
    console.error("[POST live-note] resolveFolderId error", e);
    return json({ error: "Internal error" }, 500);
  }
  if (!folderId) {
    return json({ error: "Folder not configured for subject", code: "FOLDER_NOT_CONFIGURED" }, 422);
  }

  // Resolve subject name for doc title
  let subjectName = subjectId;
  try {
    const { data: subj } = await supabase.from("subjects").select("name").eq("id", subjectId).maybeSingle();
    if (subj && typeof (subj as { name?: string }).name === "string" && (subj as { name: string }).name.trim()) {
      subjectName = (subj as { name: string }).name.trim();
    }
  } catch {
    // fallback to subjectId
  }
  const docName = getLiveDocName(subjectName, new Date());
  const expiry = getLiveNoteExpiry(new Date());

  // Drive create + permission (with orphan handling)
  let fileId: string | null = null;
  let webViewLink: string | null = null;
  try {
    const created = await createLiveDoc(docName, folderId);
    fileId = created.fileId;
    webViewLink = created.webViewLink;
  } catch (e) {
    console.error("[POST live-note] Drive files.create failed", e);
    if (isQuotaExceededError(e)) {
      return json({ error: "Cuota de Drive del Service Account excedida. Usá un Shared Drive o liberá espacio.", retryable: false, code: "QUOTA_EXCEEDED" }, 507);
    }
    const status = mapDriveErrorStatus(e);
    const retryable = isDriveRetryableError(e) || isDriveRateLimitedError(e);
    return json({ error: "Drive error", retryable, code: "DRIVE_ERROR" }, status);
  }

  // Set anyone writer permission — if this fails, delete orphan file
  try {
    await setAnyoneWriter(fileId!);
  } catch (e) {
    console.error("[POST live-note] permissions.create failed, deleting orphan", e);
    try {
      await deleteFile(fileId!);
    } catch (delErr) {
      console.error("[POST live-note] orphan delete after permission fail also failed", delErr);
    }
    if (isQuotaExceededError(e)) {
      return json({ error: "Cuota de Drive del Service Account excedida. Usá un Shared Drive o liberá espacio.", retryable: false, code: "QUOTA_EXCEEDED" }, 507);
    }
    const status = mapDriveErrorStatus(e);
    const retryable = isDriveRetryableError(e) || isDriveRateLimitedError(e);
    return json({ error: "Drive permission error", retryable, code: "DRIVE_ERROR" }, status);
  }

  // DB insert (with race/orphan handling)
  let insertedId: string | null = null;
  try {
    const { data, error } = await supabase
      .from("live_notes")
      .insert({
        subject_id: subjectId,
        created_by: user.id,
        title: docName,
        drive_file_id: fileId!,
        drive_web_view_link: webViewLink!,
        folder_id: folderId,
        status: "live",
        expires_at: expiry.toISOString(),
      })
      .select("id")
      .single();

    if (error) throw error;
    insertedId = (data as { id: string }).id;
  } catch (e: unknown) {
    const pgCode = (e as { code?: string })?.code;
    const msg = String((e as { message?: string })?.message ?? "");
    const is23505 = pgCode === "23505" || msg.includes("23505") || msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("live_one_per_subject");
    // Orphan cleanup: Drive file already created, DB failed
    try {
      await deleteFile(fileId!);
    } catch (delErr) {
      console.error("[POST live-note] orphan delete failed", delErr);
    }
    if (is23505) {
      // Race: fetch existing live to return 409 with link
      try {
        const nowIso = new Date().toISOString();
        const { data: existing } = await supabase
          .from("live_notes")
          .select("id, drive_web_view_link")
          .eq("subject_id", subjectId)
          .eq("status", "live")
          .gt("expires_at", nowIso)
          .maybeSingle();
        if (existing) {
          return json(
            { existing: true, id: (existing as { id: string }).id, url: (existing as { drive_web_view_link: string }).drive_web_view_link },
            409,
          );
        }
      } catch {
        // fall through
      }
      return json({ existing: true, error: "Live note already exists" }, 409);
    }
    console.error("[POST live-note] DB insert failed (orphan deleted)", e);
    return json({ error: "Failed to create live note" }, 500);
  }

  // Server fan-out notifications (only on 201 success, not on 409)
  try {
    await fanOutLiveNoteNotifications(supabase, subjectId, subjectName, webViewLink!, user.id);
  } catch (e) {
    // Non-fatal: live note already created, log and still return 201
    console.error("[POST live-note] fan-out failed (non-fatal)", e);
  }

  return json({ id: insertedId, url: webViewLink, expires_at: expiry.toISOString() }, 201);
}

// ---------------------------------------------------------------------------
// Fan-out: notify all authenticated users except creator, batched 100
// ---------------------------------------------------------------------------
async function fanOutLiveNoteNotifications(
  supabase: ReturnType<typeof getServiceClient>,
  subjectId: string,
  subjectName: string,
  url: string,
  creatorId: string,
) {
  // MVP: broadcast to all profiles except creator (future: enrollment table)
  const { data: profiles, error } = await supabase.from("profiles").select("id").neq("id", creatorId).limit(1000);
  if (error) throw error;
  const userIds = (profiles ?? []).map((p: { id: string }) => p.id).filter(Boolean);
  if (userIds.length === 0) return;

  const title = `Apuntes en vivo: ${subjectName}`;
  const body = url;
  const rows = userIds.map((uid: string) => ({
    user_id: uid,
    actor_id: creatorId,
    type: "live_note",
    title,
    body,
    note_id: null,
    event_id: null,
    comment_id: null,
  }));

  // Batch 100
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error: insErr } = await supabase.from("notifications").insert(batch);
    if (insErr) throw insErr;
  }
}
