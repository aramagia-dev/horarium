import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// GET /api/drive/root → { rootId, url } | 404/500
// Returns the Horarium Drive root folder link for the "Ver Drive" shortcut in Notas.
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const rootId = process.env.GOOGLE_DRIVE_ROOT_ID?.trim() ?? "";
  if (!rootId) {
    return NextResponse.json({ error: "GOOGLE_DRIVE_ROOT_ID no configurado", code: "NOT_CONFIGURED" }, { status: 404 });
  }

  const url = `https://drive.google.com/drive/folders/${rootId}`;
  return NextResponse.json({ rootId, url });
}
