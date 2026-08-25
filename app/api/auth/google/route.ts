import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { getOAuthRedirectUri } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

// GET /api/auth/google — redirects to Google OAuth consent (single-bot, personal Gmail)
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error: "GOOGLE_OAUTH_CLIENT_ID / CLIENT_SECRET no configurados en Vercel",
        hint: "Agregá ambos en Vercel → Settings → Environment Variables (Production) y redeployá.",
      },
      { status: 500 }
    );
  }

  const redirectUri = getOAuthRedirectUri();
  const oAuth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive"],
    include_granted_scopes: true,
  });

  return NextResponse.redirect(authUrl);
}
