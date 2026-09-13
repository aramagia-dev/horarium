import "server-only";

import { createClient } from "@supabase/supabase-js";
import { google, drive_v3 } from "googleapis";
import { JWT, OAuth2Client } from "google-auth-library";

/**
 * Google Drive singleton — supports two auth modes:
 *  1. OAuth (personal Gmail, recommended for non-Workspace): CLIENT_ID/SECRET/REFRESH_TOKEN
 *  2. Service Account JWT (Workspace + Shared Drive): GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON (base64)
 * OAuth takes precedence when configured.
 */

let cachedJwt: JWT | null = null;
let cachedOAuth: OAuth2Client | null = null;
let cachedDrive: drive_v3.Drive | null = null;

export type ServiceAccountJson = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export function isOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
}

export function isServiceAccountConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON);
}

export function isGoogleDriveConfigured(): boolean {
  return isOAuthConfigured() || isServiceAccountConfigured();
}

export function getDriveAuthMode(): "oauth" | "service_account" | "none" {
  if (isOAuthConfigured()) return "oauth";
  if (isServiceAccountConfigured()) return "service_account";
  return "none";
}

export function getOAuthRedirectUri(): string {
  return (
    process.env.GOOGLE_OAUTH_REDIRECT_URI ??
    "https://horarium-indol.vercel.app/api/auth/google/callback"
  );
}

function decodeServiceAccount(): ServiceAccountJson {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON;
  if (!b64) throw new Error("GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON not configured");
  let jsonStr: string;
  try {
    jsonStr = Buffer.from(b64, "base64").toString("utf8");
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON is not valid base64");
  }
  let parsed: ServiceAccountJson;
  try {
    parsed = JSON.parse(jsonStr) as ServiceAccountJson;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON JSON parse failed");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON missing client_email/private_key");
  }
  return parsed;
}

export function getJwtClient(): JWT {
  if (cachedJwt) return cachedJwt;
  const sa = decodeServiceAccount();
  cachedJwt = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return cachedJwt;
}

export function getOAuth2Client(): OAuth2Client {
  if (cachedOAuth) return cachedOAuth;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("GOOGLE_OAUTH not fully configured (CLIENT_ID/SECRET/REFRESH_TOKEN)");
  }
  const oAuth2Client = new OAuth2Client(clientId, clientSecret, getOAuthRedirectUri());
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  cachedOAuth = oAuth2Client;
  return oAuth2Client;
}

/** Returns the active auth client (OAuth preferred, else JWT) */
function getAuthClient(): OAuth2Client | JWT {
  if (isOAuthConfigured()) return getOAuth2Client();
  return getJwtClient();
}

export function getDriveClient(): drive_v3.Drive {
  if (cachedDrive) return cachedDrive;
  const auth = getAuthClient();
  cachedDrive = google.drive({ version: "v3", auth: auth as unknown as never });
  return cachedDrive;
}

/** Clear only OAuth cache so next getDriveClient re-creates with fresh token */
export function clearOAuthCache() {
  cachedOAuth = null;
  cachedDrive = null;
}

/** For tests: reset singletons */
export function resetDriveClientForTests() {
  cachedJwt = null;
  cachedOAuth = null;
  cachedDrive = null;
}

// ---------------------------------------------------------------------------
// Drive error helpers — sanitized, no secret leakage
// ---------------------------------------------------------------------------

export function getDriveHttpStatus(err: unknown): number | null {
  if (err == null) return null;
  const anyErr = err as Record<string, unknown>;
  // direct status/code
  if (typeof anyErr.status === "number" && Number.isFinite(anyErr.status)) return anyErr.status as number;
  if (typeof anyErr.code === "number" && Number.isFinite(anyErr.code)) return anyErr.code as number;
  if (typeof anyErr.code === "string" && /^\d{3}$/.test(anyErr.code as string)) return parseInt(anyErr.code as string, 10);
  if (typeof anyErr.statusCode === "number") return anyErr.statusCode as number;

  const response = anyErr.response as Record<string, unknown> | undefined;
  if (response) {
    if (typeof response.status === "number") return response.status as number;
    if (typeof (response as Record<string, unknown>).statusCode === "number")
      return (response as Record<string, unknown>).statusCode as number;
    const data = response.data as Record<string, unknown> | undefined;
    if (data) {
      const errObj = (data.error as Record<string, unknown> | undefined) ?? (data as Record<string, unknown>);
      if (errObj) {
        if (typeof errObj.code === "number") return errObj.code as number;
        if (typeof errObj.code === "string" && /^\d{3}$/.test(errObj.code as string))
          return parseInt(errObj.code as string, 10);
        if (typeof errObj.status === "number") return errObj.status as number;
      }
      if (typeof data.code === "number") return data.code as number;
      if (typeof (data as Record<string, unknown>).status === "number")
        return (data as Record<string, unknown>).status as number;
    }
  }

  // GaxiosError may have response.data.error.code nested differently
  const gaxiosData = (anyErr as Record<string, unknown>).response as Record<string, unknown> | undefined;
  if (gaxiosData) {
    const d = gaxiosData.data as Record<string, unknown> | undefined;
    if (d?.error) {
      const e = d.error as Record<string, unknown>;
      if (typeof e.code === "number") return e.code as number;
    }
  }

  // fallback: parse from combined message strings like "403 permission denied"
  try {
    const msg = String((anyErr.message ?? "") as string) + " " + String(((anyErr.cause as Record<string, unknown> | undefined)?.message ?? "") as string);
    const m = msg.match(/\b(4\d{2}|5\d{2})\b/);
    if (m) return parseInt(m[1], 10);
  } catch {
    // ignore
  }
  return null;
}

export function getDriveReason(err: unknown): string | null {
  if (err == null) return null;
  const anyErr = err as Record<string, unknown>;
  // direct reason field
  if (typeof anyErr.reason === "string" && anyErr.reason) return (anyErr.reason as string).toLowerCase();

  const response = anyErr.response as Record<string, unknown> | undefined;
  if (response) {
    const data = response.data as Record<string, unknown> | undefined;
    if (data) {
      const errObj = (data.error as Record<string, unknown> | undefined) ?? data;
      if (errObj) {
        if (typeof errObj.reason === "string" && errObj.reason) return (errObj.reason as string).toLowerCase();
        const errors = errObj.errors as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(errors) && errors[0] && typeof errors[0].reason === "string") {
          return (errors[0].reason as string).toLowerCase();
        }
        // also check error.details reason
        const details = errObj.details as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(details) && details[0] && typeof details[0].reason === "string") {
          return (details[0].reason as string).toLowerCase();
        }
      }
      // some responses put errors at data.errors
      const errors2 = (data.errors as Array<Record<string, unknown>> | undefined);
      if (Array.isArray(errors2) && errors2[0] && typeof errors2[0].reason === "string") {
        return (errors2[0].reason as string).toLowerCase();
      }
    }
  }

  const cause = anyErr.cause as Record<string, unknown> | undefined;
  if (cause && typeof cause.reason === "string" && cause.reason) return (cause.reason as string).toLowerCase();

  return null;
}

function collectDriveMessages(err: unknown): string {
  const parts: string[] = [];
  if (err == null) return "";
  const anyErr = err as Record<string, unknown>;
  if (typeof anyErr.message === "string") parts.push(anyErr.message as string);
  const cause = anyErr.cause as Record<string, unknown> | undefined;
  if (cause && typeof cause.message === "string") parts.push(cause.message as string);
  const response = anyErr.response as Record<string, unknown> | undefined;
  if (response) {
    const data = response.data as unknown;
    if (data) {
      try {
        if (typeof data === "string") parts.push(data as string);
        else parts.push(JSON.stringify(data));
      } catch {
        parts.push(String(data));
      }
    }
    if (typeof response.status === "number") parts.push(String(response.status));
  }
  // also check error_description / error fields typical for OAuth
  try {
    const data = (response?.data as Record<string, unknown> | undefined);
    if (data) {
      if (typeof data.error_description === "string") parts.push(data.error_description as string);
      if (typeof data.error === "string") parts.push(data.error as string);
      const errObj = data.error as Record<string, unknown> | undefined;
      if (errObj && typeof errObj.message === "string") parts.push(errObj.message as string);
      if (errObj && typeof errObj.error_description === "string") parts.push(errObj.error_description as string);
    }
  } catch {
    // ignore
  }
  return parts.join(" ").toLowerCase();
}

export function isOAuthExpiredError(err: unknown): boolean {
  const combined = collectDriveMessages(err);
  const hit =
    combined.includes("invalid_grant") ||
    combined.includes("invalid_request") ||
    combined.includes("unauthorized_client") ||
    combined.includes("token has been expired or revoked") ||
    combined.includes("token expired") ||
    combined.includes("revoked");
  // Only treat revoked/expired generic if it also looks like OAuth token error (avoid false on Drive file expired?)
  // But spec says detect those strings; we already do invalid_grant etc.
  // For safety, require one of the three OAuth error codes for generic revoked checks unless message also contains oauth/token hint
  if (hit) {
    // clear cache for retry as spec requires
    clearOAuthCache();
    return true;
  }
  return false;
}

export function isFolderNotFoundError(err: unknown): boolean {
  const status = getDriveHttpStatus(err);
  const reason = getDriveReason(err);
  const msg = collectDriveMessages(err);
  if (status === 404) {
    if (reason === "notfound" || reason === "not_found" || msg.includes("notfound") || msg.includes("file not found") || msg.includes("not found")) return true;
    // Drive 404 is always folder/file not found — treat all 404 as folder not found for live-note create
    return true;
  }
  if (reason === "notfound" || reason === "not_found") return true;
  if (msg.includes("file not found") && msg.includes("404")) return true;
  return false;
}

export function isDriveRateLimitedError(err: unknown): boolean {
  const status = getDriveHttpStatus(err);
  const reason = getDriveReason(err);
  const msg = collectDriveMessages(err);
  if (status === 429) return true;
  if (reason === "ratelimitexceeded" || reason === "rate_limit_exceeded" || reason === "userratelimitexceeded" || reason === "user_rate_limit_exceeded") return true;
  if (msg.includes("rate limit") || msg.includes("rate_limit_exceeded") || msg.includes("userratelimitexceeded")) return true;
  if (msg.includes("429")) return true;
  return false;
}

export function isQuotaExceededError(err: unknown): boolean {
  const reason = getDriveReason(err);
  const msg = collectDriveMessages(err);
  if (reason === "quotaexceeded" || reason === "quota_exceeded" || reason === "storagequotaexceeded" || reason === "storage_quota_exceeded") return true;
  if (msg.includes("storage quota") || msg.includes("quota has been exceeded") || msg.includes("quotaexceeded") || msg.includes("storagequotaexceeded")) return true;
  return false;
}

function sanitizeAndTruncate(raw: string): string {
  let out = raw;
  // Never leak secrets — redact known env patterns without exposing values
  out = out.replace(/refresh_token/gi, "[REDACTED]");
  out = out.replace(/client_secret/gi, "[REDACTED]");
  out = out.replace(/client_id/gi, "[REDACTED]");
  out = out.replace(/private_key/gi, "[REDACTED]");
  out = out.replace(/GOOGLE_OAUTH_REFRESH_TOKEN/gi, "[REDACTED]");
  out = out.replace(/GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON/gi, "[REDACTED]");
  // Truncate to 500 chars as spec
  if (out.length > 500) out = out.slice(0, 500);
  return out;
}

export function getSanitizedDriveDetails(err: unknown): string {
  if (err == null) return "";
  let raw = "";
  const anyErr = err as Record<string, unknown>;
  if (typeof anyErr.message === "string") raw += anyErr.message as string;
  else raw += String(err);
  const cause = anyErr.cause as Record<string, unknown> | undefined;
  if (cause && typeof cause.message === "string") raw += " " + (cause.message as string);
  const response = anyErr.response as Record<string, unknown> | undefined;
  if (response?.data) {
    try {
      const dataStr = typeof response.data === "string" ? (response.data as string) : JSON.stringify(response.data);
      raw += " " + dataStr;
    } catch {
      raw += " " + String(response.data);
    }
  }
  const status = getDriveHttpStatus(err);
  const reason = getDriveReason(err);
  if (status) raw += ` status:${status}`;
  if (reason) raw += ` reason:${reason}`;
  return sanitizeAndTruncate(raw);
}

export function getSanitizedDriveMessage(err: unknown): string {
  // Alias — truncated message without raw data dump, but still sanitized
  if (err == null) return "";
  const anyErr = err as Record<string, unknown>;
  let raw = "";
  if (typeof anyErr.message === "string") raw = anyErr.message as string;
  else raw = String(err);
  const cause = anyErr.cause as Record<string, unknown> | undefined;
  if (cause && typeof cause.message === "string" && cause.message !== raw) raw += " " + (cause.message as string);
  return sanitizeAndTruncate(raw);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getLiveDocName(subjectCode: string, date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const code = (subjectCode ?? "").trim() || "HOR";
  return `${code} ${d}/${m}/${y}`;
}

export function getLiveNoteExpiry(from: Date = new Date(), durationHours: number = getLiveNoteDurationHours()): Date {
  return new Date(from.getTime() + durationHours * 60 * 60 * 1000);
}

export function getLiveNoteDurationHours(): number {
  const raw = process.env.LIVE_NOTE_DURATION_HOURS;
  const n = raw ? Number(raw) : 4;
  return Number.isFinite(n) && n > 0 ? n : 4;
}

// ---------------------------------------------------------------------------
// Supabase service_role helper for folder resolution
// ---------------------------------------------------------------------------

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase service_role not configured");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function resolveFolderId(subjectId: string): Promise<string | null> {
  if (!subjectId) return null;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("subject_drive_folders")
    .select("folder_id")
    .eq("subject_id", subjectId)
    .maybeSingle();
  if (error) throw error;
  return (data?.folder_id as string | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Drive operations
// ---------------------------------------------------------------------------

export async function createLiveDoc(name: string, folderId: string): Promise<{ fileId: string; webViewLink: string }> {
  const drive = getDriveClient();
  try {
    const res = await drive.files.create({
      requestBody: {
        name,
        mimeType: "application/vnd.google-apps.document",
        parents: [folderId],
      },
      fields: "id, webViewLink",
      supportsAllDrives: true,
    } as never);
    const fileId = res.data.id;
    const webViewLink = res.data.webViewLink;
    if (!fileId || !webViewLink) throw new Error("Drive files.create returned no id/webViewLink");
    return { fileId, webViewLink };
  } catch (err) {
    if (isOAuthExpiredError(err)) {
      // cache already cleared inside isOAuthExpiredError; re-throw
    }
    throw err;
  }
}

export async function setAnyoneWriter(fileId: string): Promise<void> {
  const drive = getDriveClient();
  try {
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: "writer",
        type: "anyone",
        allowFileDiscovery: false,
      },
      supportsAllDrives: true,
      sendNotificationEmail: false,
    } as never);
  } catch (err) {
    if (isOAuthExpiredError(err)) {
      // cache cleared
    }
    throw err;
  }
}

export async function deleteFile(fileId: string): Promise<void> {
  const drive = getDriveClient();
  try {
    await drive.files.delete({ fileId, supportsAllDrives: true } as never);
  } catch (err) {
    if (isOAuthExpiredError(err)) {
      // cache cleared
    }
    throw err;
  }
}
