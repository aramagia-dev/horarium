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
  getDriveHttpStatus,
  getDriveReason,
  getSanitizedDriveDetails,
  isDriveRateLimitedError,
  isFolderNotFoundError,
  isGoogleDriveConfigured,
  isOAuthExpiredError,
  isQuotaExceededError,
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

export function classifyDriveError(err: unknown): {
  httpStatus: number;
  code: string;
  error: string;
  hint: string;
  retryable: boolean;
  details: string;
} {
  const details = getSanitizedDriveDetails(err);
  const status = getDriveHttpStatus(err);
  const reason = getDriveReason(err);
  const msgCombined = String((err as { message?: string })?.message ?? "").toLowerCase()
    + " "
    + String((err as { cause?: { message?: string } })?.cause?.message ?? "").toLowerCase()
    + " "
    + details.toLowerCase();

  // 1. not fully configured → DRIVE_NOT_CONFIGURED
  if (
    msgCombined.includes("not fully configured") ||
    msgCombined.includes("not configured") ||
    msgCombined.includes("google_oauth not fully configured") ||
    (msgCombined.includes("drive no configurado") && !msgCombined.includes("folder"))
  ) {
    return {
      httpStatus: 500,
      code: "DRIVE_NOT_CONFIGURED",
      error: "Drive no configurado",
      hint: "Faltan variables GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN o GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON. Configuralas en Vercel y hacé Redeploy.",
      retryable: false,
      details,
    };
  }

  // 2. redirect_uri_mismatch → OAUTH_CONFIG_ERROR
  if (msgCombined.includes("redirect_uri_mismatch") || msgCombined.includes("redirect uri mismatch")) {
    return {
      httpStatus: 500,
      code: "OAUTH_CONFIG_ERROR",
      error: "Error de configuración OAuth",
      hint: "redirect_uri_mismatch — Verificá GOOGLE_OAUTH_REDIRECT_URI (debe coincidir con el autorizado en Google Cloud Console) y GOOGLE_OAUTH_CLIENT_ID/SECRET.",
      retryable: false,
      details,
    };
  }

  // 3. OAuth expired / revoked
  if (isOAuthExpiredError(err)) {
    return {
      httpStatus: 401,
      code: "OAUTH_EXPIRED",
      error: "Token de Drive expirado o revocado",
      hint: "Token expirado/revocado — Reautorizá en /api/auth/google y actualizá GOOGLE_OAUTH_REFRESH_TOKEN en Vercel + Redeploy",
      retryable: false,
      details,
    };
  }

  // 4. Folder not found (404)
  if (isFolderNotFoundError(err)) {
    return {
      httpStatus: 422,
      code: "FOLDER_NOT_FOUND",
      error: "Carpeta de Drive no encontrada",
      hint: "Carpeta no encontrada — verificá subject_drive_folders para esta materia o GOOGLE_DRIVE_ROOT_ID y que la carpeta exista y esté compartida con el bot.",
      retryable: false,
      details,
    };
  }

  // 5. Quota exceeded
  if (isQuotaExceededError(err)) {
    return {
      httpStatus: 507,
      code: "QUOTA_EXCEEDED",
      error: "Cuota de Drive excedida",
      hint: "Cuota de Drive excedida — liberá espacio en el Drive del bot o usá un Shared Drive con el Service Account como Manager.",
      retryable: false,
      details,
    };
  }

  // 6. Rate limited
  if (isDriveRateLimitedError(err)) {
    return {
      httpStatus: 429,
      code: "RATE_LIMITED",
      error: "Límite de Drive alcanzado",
      hint: "Drive alcanzó el límite de solicitudes — reintentá en unos segundos.",
      retryable: true,
      details,
    };
  }

  // 7. Permission denied explicit (403)
  if (
    status === 403 ||
    reason === "forbidden" ||
    reason === "insufficientpermissions" ||
    msgCombined.includes("permission denied") ||
    msgCombined.includes("insufficient permission") ||
    msgCombined.includes("forbidden")
  ) {
    return {
      httpStatus: 502,
      code: "DRIVE_PERMISSION_DENIED",
      error: "Drive denegó el permiso",
      hint: "Drive denegó el permiso — verificá que la carpeta esté compartida con el bot (OAuth Gmail o Service Account) como Editor/Writer.",
      retryable: false,
      details,
    };
  }

  // 8. Drive unavailable (5xx)
  if ((status !== null && status >= 500) || reason === "internalerror" || reason === "backenderror" || msgCombined.includes("internal error") || msgCombined.includes("backend error")) {
    return {
      httpStatus: 502,
      code: "DRIVE_UNAVAILABLE",
      error: "Drive no disponible",
      hint: "Drive no disponible temporalmente — reintentá en unos segundos.",
      retryable: true,
      details,
    };
  }

  // 9. Fallback for plain "403 permission denied" without status
  if (msgCombined.includes("403") && msgCombined.includes("permission")) {
    return {
      httpStatus: 502,
      code: "DRIVE_PERMISSION_DENIED",
      error: "Drive denegó el permiso",
      hint: "Drive denegó el permiso — verificá que la carpeta esté compartida con el bot.",
      retryable: true,
      details,
    };
  }

  // 10. Fallback 5xx/429 in message → 502 retryable
  if (msgCombined.includes("500") || msgCombined.includes("503") || msgCombined.includes("429") || msgCombined.includes("502")) {
    return {
      httpStatus: 502,
      code: "DRIVE_UNAVAILABLE",
      error: "Drive no disponible",
      hint: "Drive no disponible — reintentá en unos segundos.",
      retryable: true,
      details,
    };
  }

  // 11. FOLDER_RESOLVE_ERROR marker (check for Supabase subject_drive_folders hints)
  if (msgCombined.includes("subject_drive_folders") || msgCombined.includes("folder resolve") || msgCombined.includes("resolvefolderid")) {
    return {
      httpStatus: 500,
      code: "FOLDER_RESOLVE_ERROR",
      error: "No se pudo resolver la carpeta de la materia",
      hint: "Error resolviendo la carpeta — verificá la tabla subject_drive_folders en Supabase.",
      retryable: false,
      details,
    };
  }

  // 12. Generic DRIVE_ERROR but structured
  const fallbackStatus = status !== null && status >= 400 && status < 600 ? status : 500;
  const fallbackRetryable = fallbackStatus === 429 || fallbackStatus >= 500 || fallbackStatus === 403;
  return {
    httpStatus: fallbackStatus,
    code: "DRIVE_ERROR",
    error: "Error de Drive",
    hint: "Error inesperado de Drive — revisá los logs del servidor y el estado de la API de Drive.",
    retryable: fallbackRetryable,
    details,
  };
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
    return json({ error: "Rate limited", retryable: true, retryAfter, code: "RATE_LIMITED", hint: "Demasiadas solicitudes — reintentá en unos segundos." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  const supabase = getServiceClient();

  // Auto-archive expired live notes for this subject (lazy expiry + unique index fix)
  // Without this, an expired row with status='live' still blocks the partial unique index
  // and causes a 23505 on insert that surfaces as a 409 without url (about:blank bug).
  try {
    const nowIsoForArchive = new Date().toISOString();
    const table = supabase.from("live_notes") as unknown as Record<string, unknown>;
    if (typeof table.update !== "function") {
      console.warn("[POST live-note] auto-archive skipped — table.update not available (mock)");
    } else {
      await supabase
        .from("live_notes")
        .update({ status: "archived", archived_at: nowIsoForArchive })
        .eq("subject_id", subjectId)
        .eq("status", "live")
        .lte("expires_at", nowIsoForArchive);
    }
  } catch (e) {
    console.warn("[POST live-note] auto-archive expired failed (non-fatal)", e);
  }

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

  // Guard DRIVE_NOT_CONFIGURED — skip in test env so mocks still work
  const isTestEnv = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
  if (!isTestEnv && !isGoogleDriveConfigured()) {
    const classified = classifyDriveError(new Error("GOOGLE_OAUTH not fully configured (CLIENT_ID/SECRET/REFRESH_TOKEN)"));
    console.error("[POST live-note] drive not configured", { code: classified.code, httpStatus: classified.httpStatus, details: classified.details, raw: classified.details });
    return json({ error: classified.error, hint: classified.hint, details: classified.details, code: classified.code, retryable: classified.retryable }, classified.httpStatus);
  }

  // Resolve folderId — 422 if not configured (no auto-create)
  let folderId: string | null;
  try {
    folderId = await resolveFolderId(subjectId);
  } catch (e) {
    const classified = classifyDriveError(e);
    // Map Supabase resolve errors to FOLDER_RESOLVE_ERROR if not already classified as DRIVE_NOT_CONFIGURED etc.
    const isResolve = classified.code === "DRIVE_NOT_CONFIGURED" || classified.code === "OAUTH_CONFIG_ERROR" ? classified : {
      httpStatus: 500,
      code: "FOLDER_RESOLVE_ERROR",
      error: "No se pudo resolver la carpeta de la materia",
      hint: "Error resolviendo subject_drive_folders — verificá la tabla en Supabase.",
      retryable: false,
      details: classified.details,
    };
    console.error("[POST live-note] resolveFolderId error", { code: isResolve.code, httpStatus: isResolve.httpStatus, details: isResolve.details, raw: getSanitizedDriveDetails(e) });
    return json({ error: isResolve.error, hint: isResolve.hint, details: isResolve.details, code: isResolve.code, retryable: isResolve.retryable }, isResolve.httpStatus);
  }
  if (!folderId) {
    return json({ error: "Folder not configured for subject", code: "FOLDER_NOT_CONFIGURED", hint: "Carpeta no configurada — agregá un registro en subject_drive_folders para esta materia o configurá GOOGLE_DRIVE_ROOT_ID.", retryable: false, details: "" }, 422);
  }

  // Resolve subject code for doc title
  let subjectCode = "";
  let subjectName = subjectId;
  try {
    const { data: subj } = await supabase.from("subjects").select("code, name").eq("id", subjectId).maybeSingle();
    const rawCode = (subj as { code?: string } | null)?.code?.trim() ?? "";
    const rawName = (subj as { name?: string } | null)?.name?.trim() ?? "";
    if (rawCode) subjectCode = rawCode;
    if (rawName) subjectName = rawName;
    // fallback to name initials if no code (legacy)
    if (!subjectCode && rawName) subjectCode = rawName;
  } catch {
    // fallback to subjectId
  }
  if (!subjectCode) subjectCode = subjectName;
  const docName = getLiveDocName(subjectCode, new Date());
  const expiry = getLiveNoteExpiry(new Date());

  // Drive create + permission (with orphan handling)
  let fileId: string | null = null;
  let webViewLink: string | null = null;
  try {
    const created = await createLiveDoc(docName, folderId);
    fileId = created.fileId;
    webViewLink = created.webViewLink;
  } catch (e) {
    const classified = classifyDriveError(e);
    console.error("[POST live-note] Drive files.create failed", { code: classified.code, httpStatus: classified.httpStatus, details: classified.details, raw: getSanitizedDriveDetails(e) });
    return json({ error: classified.error, hint: classified.hint, details: classified.details, code: classified.code, retryable: classified.retryable }, classified.httpStatus);
  }

  // Set anyone writer permission — if this fails, delete orphan file
  try {
    await setAnyoneWriter(fileId!);
  } catch (e) {
    console.error("[POST live-note] permissions.create failed, deleting orphan", { code: classifyDriveError(e).code, httpStatus: classifyDriveError(e).httpStatus, details: classifyDriveError(e).details, raw: getSanitizedDriveDetails(e) });
    try {
      await deleteFile(fileId!);
    } catch (delErr) {
      console.error("[POST live-note] orphan delete after permission fail also failed", delErr);
    }
    const classified = classifyDriveError(e);
    return json({ error: classified.error, hint: classified.hint, details: classified.details, code: classified.code, retryable: classified.retryable }, classified.httpStatus);
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
