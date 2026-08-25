import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { getOAuthRedirectUri } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

// GET /api/auth/google/callback?code=... — exchanges code for tokens and shows refresh_token
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return new NextResponse(
      `<h1>Autorización cancelada</h1><p>${error}</p><p><a href="/api/auth/google">Reintentar</a></p>`,
      { status: 400, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }

  if (!code) {
    return new NextResponse("<h1>Falta ?code</h1><p><a href='/api/auth/google'>Iniciar OAuth</a></p>", {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "GOOGLE_OAUTH_CLIENT_ID/SECRET no configurados" }, { status: 500 });
  }

  const redirectUri = getOAuthRedirectUri();
  const oAuth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    const refreshToken = tokens.refresh_token;
    const accessToken = tokens.access_token;

    if (!refreshToken) {
      return new NextResponse(
        `<h1>No se recibió refresh_token</h1>
         <p>Google solo envía refresh_token la primera vez con <code>prompt=consent</code>.</p>
         <p>Solución: Andá a <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a> → quitá el acceso a "Horarium" → volvé a <a href="/api/auth/google">/api/auth/google</a> y autorizá de nuevo.</p>
         <pre>${JSON.stringify(tokens, null, 2)}</pre>`,
        { status: 400, headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }

    // Success — show refresh_token to copy into Vercel env
    const html = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Horarium — OAuth listo</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.5}code,pre{background:#f4f4f5;padding:12px;border-radius:8px;display:block;overflow:auto;word-break:break-all}pre{white-space:pre-wrap}.ok{color:#16a34a;font-weight:600}.warn{background:#fef9c3;border:1px solid #facc15;padding:12px;border-radius:8px}</style>
</head>
<body>
  <h1 class="ok">✓ Autorización exitosa</h1>
  <p>Copiá este <strong>refresh_token</strong> y guardalo en Vercel:</p>
  <pre>${refreshToken}</pre>
  <div class="warn">
    <strong>Pasos:</strong>
    <ol>
      <li>Vercel → tu proyecto Horarium → <strong>Settings → Environment Variables</strong></li>
      <li>Agregá <code>GOOGLE_OAUTH_REFRESH_TOKEN</code> = el token de arriba (Production)</li>
      <li>Verificá que también estén <code>GOOGLE_OAUTH_CLIENT_ID</code> y <code>GOOGLE_OAUTH_CLIENT_SECRET</code> (los del Client ID que creaste)</li>
      <li><strong>Redeploy</strong> (Vercel → Deployments → … → Redeploy)</li>
      <li>Probá crear un apunte en vivo en PAD/ASI — ya no debería dar 507</li>
    </ol>
  </div>
  <p><small>Este token es secreto, no lo compartas. Access token (temporal) también recibido, pero solo necesitás guardar el refresh_token.</small></p>
  <p><small>Debug: <code>access_token</code> recibido: ${accessToken ? "sí" : "no"} · scope: ${tokens.scope ?? "—"} · expiry: ${tokens.expiry_date ?? "—"}</small></p>
  <p><a href="/">Volver a Horarium</a></p>
</body>
</html>`;
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (e) {
    const msg = (e as { message?: string })?.message ?? String(e);
    return new NextResponse(`<h1>Error al intercambiar code</h1><pre>${msg}</pre><p><a href="/api/auth/google">Reintentar</a></p>`, {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
}
