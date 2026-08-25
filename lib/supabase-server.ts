import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server helpers for Supabase.
 * - anon client for auth verification (getUser)
 * - service_role client for privileged DB ops (bypasses RLS)
 */

export function getAnonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

export function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase service_role not configured");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function extractTokenFromCookies(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  // Supabase SSR stores auth as sb-<ref>-auth-token (base64 JSON) or sb-access-token
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const c of cookies) {
    const eq = c.indexOf("=");
    if (eq === -1) continue;
    const name = c.slice(0, eq).trim();
    let value = c.slice(eq + 1).trim();
    // URL-decode
    try {
      value = decodeURIComponent(value);
    } catch {
      // keep raw
    }
    // Strip base64- prefix used by @supabase/ssr
    if (value.startsWith("base64-")) value = value.slice(7);
    if (!name.startsWith("sb-")) continue;
    // Try parse as JSON containing access_token
    // value may be base64-encoded JSON
    let candidate: string | null = null;
    // Direct JWT?
    if (value.split(".").length === 3 && value.length > 20) {
      candidate = value;
    } else {
      // Try base64 JSON
      try {
        const decoded = Buffer.from(value, "base64").toString("utf8");
        const parsed = JSON.parse(decoded) as { access_token?: string; accessToken?: string };
        if (parsed.access_token) candidate = parsed.access_token;
        else if (parsed.accessToken) candidate = parsed.accessToken;
      } catch {
        // Try plain JSON
        try {
          const parsed = JSON.parse(value) as { access_token?: string };
          if (parsed.access_token) candidate = parsed.access_token;
        } catch {
          // ignore
        }
      }
    }
    if (candidate) return candidate;
  }
  return null;
}

/**
 * Validate Supabase session from request.
 * Tries Authorization Bearer first, then Supabase cookies.
 * Returns user or null (caller should map to 401).
 */
export async function getAuthUser(req: Request): Promise<{ user: { id: string; email?: string } | null }> {
  const anon = getAnonClient();
  if (!anon) return { user: null };
  const token = extractBearerToken(req) ?? extractTokenFromCookies(req);
  if (!token) return { user: null };
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data?.user) return { user: null };
  return { user: { id: data.user.id, email: data.user.email ?? undefined } };
}
