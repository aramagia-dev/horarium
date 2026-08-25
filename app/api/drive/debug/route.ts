import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase-server";
import { getDriveClient, isGoogleDriveConfigured } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

// GET /api/drive/debug?folderId=1abc
// Returns folder metadata (driveId, name, shared) and SA quota — helps diagnose 507
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const folderId = req.nextUrl.searchParams.get("folderId") ?? process.env.GOOGLE_DRIVE_ROOT_ID ?? "";
  if (!folderId) return NextResponse.json({ error: "folderId requerido" }, { status: 400 });
  if (!isGoogleDriveConfigured()) return NextResponse.json({ error: "Drive no configurado" }, { status: 500 });

  try {
    const drive = getDriveClient();
    const [meta, about] = await Promise.all([
      drive.files.get({
        fileId: folderId,
        fields: "id,name,mimeType,driveId,owners,shared,parents,capabilities",
        supportsAllDrives: true,
      }),
      drive.about.get({ fields: "storageQuota,user" }),
    ]);

    // List perms for folder
    let perms: unknown = null;
    try {
      const p = await drive.permissions.list({ fileId: folderId, fields: "permissions(emailAddress,role,type,displayName)", supportsAllDrives: true });
      perms = p.data.permissions;
    } catch (e) {
      perms = String((e as { message?: string })?.message ?? e);
    }

    // Try a cheap create+delete dry-run in Shared Drive? No, just report meta.
    return NextResponse.json({
      folder: {
        id: meta.data.id,
        name: meta.data.name,
        driveId: meta.data.driveId ?? null, // null = My Drive, string = Shared Drive
        owners: meta.data.owners,
        shared: meta.data.shared,
        parents: meta.data.parents,
        capabilities: meta.data.capabilities,
        isSharedDrive: Boolean(meta.data.driveId),
      },
      perms,
      quota: about.data.storageQuota,
      saUser: about.data.user,
      hint: !meta.data.driveId
        ? "CARPETA EN 'Mi unidad' — va a dar 507. Movela a Unidades compartidas > Horarium."
        : "Carpeta en Shared Drive OK — si sigue 507, verificá que el SA sea Gestor del Shared Drive, no solo Editor de la carpeta.",
    });
  } catch (e) {
    const msg = (e as { message?: string })?.message ?? String(e);
    const status = (e as { status?: number })?.status ?? (e as { code?: number })?.code ?? 500;
    return NextResponse.json({ error: msg, status }, { status: typeof status === "number" && status >= 400 && status < 600 ? status : 500 });
  }
}
