import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getServiceClient } from "@/lib/supabase-server";
import {
  getDriveAuthMode,
  getDriveClient,
  getDriveHttpStatus,
  getDriveReason,
  getOAuth2Client,
  getSanitizedDriveDetails,
  isGoogleDriveConfigured,
  isOAuthConfigured,
  isOAuthExpiredError,
} from "@/lib/google-drive";

export const dynamic = "force-dynamic";

// GET /api/drive/debug?folderId=1abc
// Returns diagnostics: env booleans, oauthHealth via getAccessToken(), folder/quota split checks, perms, db
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const mode = getDriveAuthMode();
  const isConfigured = isGoogleDriveConfigured();

  const env = {
    GOOGLE_OAUTH_CLIENT_ID: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID),
    GOOGLE_OAUTH_CLIENT_SECRET: Boolean(process.env.GOOGLE_OAUTH_CLIENT_SECRET),
    GOOGLE_OAUTH_REFRESH_TOKEN: Boolean(process.env.GOOGLE_OAUTH_REFRESH_TOKEN),
    GOOGLE_OAUTH_REDIRECT_URI: Boolean(process.env.GOOGLE_OAUTH_REDIRECT_URI),
    GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON),
    GOOGLE_DRIVE_ROOT_ID: Boolean(process.env.GOOGLE_DRIVE_ROOT_ID),
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  // oauthHealth — hit oauth.getAccessToken() to classify invalid_grant
  const oauthHealth: {
    canRefresh: boolean;
    isExpiredOrRevoked: boolean;
    error: string | null;
    details: string | null;
    status: number | null;
    hint: string | null;
  } = {
    canRefresh: false,
    isExpiredOrRevoked: false,
    error: null,
    details: null,
    status: null,
    hint: null,
  };

  if (isOAuthConfigured()) {
    try {
      const oauth = getOAuth2Client();
      // getAccessToken triggers refresh_token exchange
      const token = await oauth.getAccessToken();
      if (token && (token as { token?: string }).token) {
        oauthHealth.canRefresh = true;
      } else {
        oauthHealth.canRefresh = true;
      }
    } catch (e) {
      const details = getSanitizedDriveDetails(e);
      const status = getDriveHttpStatus(e);
      const isExpired = isOAuthExpiredError(e);
      // isOAuthExpiredError already cleared cache; capture health
      oauthHealth.canRefresh = false;
      oauthHealth.isExpiredOrRevoked = isExpired;
      oauthHealth.error = isExpired ? "invalid_grant — token expirado/revocado" : (e as { message?: string })?.message ?? String(e);
      oauthHealth.details = details;
      oauthHealth.status = status;
      const msgLow = String((e as { message?: string })?.message ?? "").toLowerCase() + " " + details.toLowerCase();
      if (msgLow.includes("redirect_uri_mismatch")) {
        oauthHealth.hint = "redirect_uri_mismatch — Verificá GOOGLE_OAUTH_REDIRECT_URI en Google Cloud Console y Vercel.";
      } else if (isExpired) {
        oauthHealth.hint = "Token expirado/revocado — Reautorizá en /api/auth/google y actualizá GOOGLE_OAUTH_REFRESH_TOKEN en Vercel + Redeploy";
      } else {
        oauthHealth.hint = "No se pudo refrescar el token OAuth — revisá CLIENT_ID/SECRET/REFRESH_TOKEN y logs.";
      }
    }
  } else {
    oauthHealth.hint = "OAuth no configurado — faltan GOOGLE_OAUTH_*";
  }

  const folderId = req.nextUrl.searchParams.get("folderId") ?? process.env.GOOGLE_DRIVE_ROOT_ID ?? "";

  // DB check — service_role
  let db: { ok: boolean; error?: string; details?: string } = { ok: false };
  try {
    const supabase = getServiceClient();
    // lightweight check: count subject_drive_folders
    const { error } = await supabase.from("subject_drive_folders").select("folder_id").limit(1);
    if (error) throw error;
    db = { ok: true };
  } catch (e) {
    db = { ok: false, error: (e as { message?: string })?.message ?? String(e), details: getSanitizedDriveDetails(e) };
  }

  if (!folderId) {
    // Still return diagnostics even without folderId
    return NextResponse.json({
      mode,
      isConfigured,
      env,
      oauthHealth,
      folder: null,
      folderError: { status: 400, reason: null, hint: "folderId requerido — pasa ?folderId= o configurá GOOGLE_DRIVE_ROOT_ID" },
      perms: null,
      quota: null,
      quotaError: null,
      driveUser: null,
      saUser: null,
      db,
      hint:
        mode === "oauth"
          ? "Modo OAuth (tu Gmail) — 'Mi unidad' está OK, usa tu cuota de 15GB. Si da 507, es que tu Gmail está lleno."
          : "Sin folderId — no se pudo verificar carpeta. Configurá subject_drive_folders o GOOGLE_DRIVE_ROOT_ID.",
    });
  }

  if (!isConfigured) {
    return NextResponse.json(
      {
        mode,
        isConfigured,
        env,
        oauthHealth,
        folder: null,
        folderError: { status: 500, reason: null, hint: "Drive no configurado — faltan credenciales OAuth o Service Account" },
        perms: null,
        quota: null,
        quotaError: null,
        driveUser: null,
        saUser: null,
        db,
        hint: "Drive no configurado — configurá GOOGLE_OAUTH_* o GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON",
      },
      { status: 500 },
    );
  }

  let drive: ReturnType<typeof getDriveClient>;
  try {
    drive = getDriveClient();
  } catch (e) {
    return NextResponse.json(
      {
        mode,
        isConfigured,
        env,
        oauthHealth,
        folder: null,
        folderError: { status: 500, reason: null, hint: "No se pudo inicializar Drive client" },
        perms: null,
        quota: null,
        quotaError: { status: 500, reason: null, details: getSanitizedDriveDetails(e) },
        driveUser: null,
        saUser: null,
        db,
        hint: (e as { message?: string })?.message ?? String(e),
      },
      { status: 500 },
    );
  }

  // Separate checks: folder, perms, quota/user
  let folder: unknown = null;
  let folderError: { status: number | null; reason: string | null; hint: string | null; details?: string } | null = null;
  let perms: unknown = null;
  let quota: unknown = null;
  let quotaError: { status: number | null; reason: string | null; details: string; hint?: string } | null = null;
  let driveUser: unknown = null;
  let saUser: unknown = null;

  // Folder metadata
  try {
    const meta = await drive.files.get({
      fileId: folderId,
      fields: "id,name,mimeType,driveId,owners,shared,parents,capabilities",
      supportsAllDrives: true,
    });
    folder = {
      id: meta.data.id,
      name: meta.data.name,
      driveId: meta.data.driveId ?? null,
      owners: meta.data.owners,
      shared: meta.data.shared,
      parents: meta.data.parents,
      capabilities: meta.data.capabilities,
      isSharedDrive: Boolean(meta.data.driveId),
    };
  } catch (e) {
    const status = getDriveHttpStatus(e);
    const reason = getDriveReason(e);
    const details = getSanitizedDriveDetails(e);
    let hint: string | null = null;
    if (status === 404 || reason === "notfound") {
      hint = "Carpeta no encontrada — verificá subject_drive_folders o GOOGLE_DRIVE_ROOT_ID y que la carpeta exista y esté compartida.";
    } else if (status === 403 || reason === "forbidden") {
      hint = "Drive denegó el permiso sobre la carpeta — compartila con el bot como Editor.";
    } else if (status === 401 || isOAuthExpiredError(e)) {
      hint = "Token expirado/revocado — Reautorizá en /api/auth/google y actualizá GOOGLE_OAUTH_REFRESH_TOKEN en Vercel + Redeploy";
    } else {
      hint = details.slice(0, 200);
    }
    folderError = { status, reason, hint, details };
  }

  // Permissions
  if (folder) {
    try {
      const p = await drive.permissions.list({
        fileId: folderId,
        fields: "permissions(emailAddress,role,type,displayName)",
        supportsAllDrives: true,
      });
      perms = p.data.permissions;
    } catch (e) {
      perms = { error: (e as { message?: string })?.message ?? String(e), details: getSanitizedDriveDetails(e) };
    }
  }

  // Quota + user — separate from folder
  try {
    const about = await drive.about.get({ fields: "storageQuota,user" });
    quota = about.data.storageQuota;
    driveUser = about.data.user;
    saUser = about.data.user;
  } catch (e) {
    const status = getDriveHttpStatus(e);
    const reason = getDriveReason(e);
    const details = getSanitizedDriveDetails(e);
    let hint: string | null = null;
    if (status === 401 || isOAuthExpiredError(e)) {
      hint = "Token expirado/revocado — Reautorizá en /api/auth/google y actualizá GOOGLE_OAUTH_REFRESH_TOKEN en Vercel + Redeploy";
    } else if (status === 403) {
      hint = "Cuota/permiso denegado — verificá cuota del Drive del bot.";
    } else {
      hint = details.slice(0, 200);
    }
    quotaError = { status, reason, details, hint };
  }

  const hint =
    mode === "oauth"
      ? "Modo OAuth (tu Gmail) — 'Mi unidad' está OK, usa tu cuota de 15GB. Si da 507, es que tu Gmail está lleno."
      : !folder
        ? "No se pudo leer la carpeta — revisá folderError."
        : !(folder as { driveId?: string | null })?.driveId
          ? "CARPETA EN 'Mi unidad' con Service Account — va a dar 507. Usá Shared Drive o pasate a OAuth."
          : "Carpeta en Shared Drive OK (SA) — si sigue 507, verificá que el SA sea Gestor del Shared Drive, no solo Editor de la carpeta.";

  return NextResponse.json({
    mode,
    isConfigured,
    env,
    oauthHealth,
    folder,
    folderError,
    perms,
    quota,
    quotaError,
    driveUser,
    saUser,
    db,
    hint,
  });
}
