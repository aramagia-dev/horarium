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

/** For tests: reset singletons */
export function resetDriveClientForTests() {
  cachedJwt = null;
  cachedOAuth = null;
  cachedDrive = null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getLiveDocName(subjectName: string, date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${subjectName} - ${y}-${m}-${d} - Apuntes en vivo`;
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
}

export async function setAnyoneWriter(fileId: string): Promise<void> {
  const drive = getDriveClient();
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
}

export async function deleteFile(fileId: string): Promise<void> {
  const drive = getDriveClient();
  await drive.files.delete({ fileId, supportsAllDrives: true } as never);
}
