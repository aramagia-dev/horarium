#!/usr/bin/env node
/**
 * verify-drive-folders.mjs
 * Verifies subject_drive_folders mapping vs Google Drive.
 * - Reads SA credentials from GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON (base64 JSON)
 * - Reads Supabase subject_drive_folders via service_role
 * - For each row, calls Drive files.get to ensure folder exists and is accessible
 * - Outputs missing / mismatch, exit 1 on fail
 *
 * Usage: node scripts/verify-drive-folders.mjs
 * Used by admin-board or manual `npm run verify:drive` (add script if needed).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  // Try .env.local then .env
  for (const name of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(resolve(process.cwd(), name), "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const eq = t.indexOf("=");
        if (eq === -1) continue;
        const k = t.slice(0, eq).trim();
        const v = t.slice(eq + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    } catch {
      // ignore missing
    }
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const saB64 = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON;

if (!saB64) {
  console.error("[verify-drive-folders] GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON not configured (server-only, base64 JSON). Set it in .env.local");
  console.error("Tip: cat sa.json | base64 -w0  (never commit sa.json, never use NEXT_PUBLIC_*)");
  process.exit(1);
}
if (!url || !serviceKey) {
  console.error("[verify-drive-folders] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
  process.exit(1);
}

let saJson;
try {
  saJson = JSON.parse(Buffer.from(saB64, "base64").toString("utf8"));
} catch (e) {
  console.error("[verify-drive-folders] Failed to decode SA JSON:", e?.message ?? e);
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

// Import googleapis + JWT
let drive;
try {
  const { google } = await import("googleapis");
  const { JWT } = await import("google-auth-library");
  const jwt = new JWT({
    email: saJson.client_email,
    key: saJson.private_key,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  drive = google.drive({ version: "v3", auth: jwt });
} catch (e) {
  console.error("[verify-drive-folders] Failed to init Drive JWT:", e?.message ?? e);
  process.exit(1);
}

console.log("=== verify-drive-folders ===");
console.log(`Supabase: ${url}`);
console.log(`SA: ${saJson.client_email}`);

const { data: mappings, error } = await supabase.from("subject_drive_folders").select("subject_id, folder_id, folder_name").order("subject_id");
if (error) {
  console.error("[verify-drive-folders] Supabase query failed:", error.message);
  process.exit(1);
}
if (!mappings || mappings.length === 0) {
  console.error("[verify-drive-folders] No rows in subject_drive_folders — run manual inserts for 6 subjects (see supabase/live-notes.sql)");
  console.error("Example: insert into subject_drive_folders (subject_id, folder_id, folder_name) values ('subject-red', '<drive-folder-id>', 'Horarium/Redes de Datos');");
  process.exit(1);
}

console.log(`\nFound ${mappings.length} mapped subject(s):`);
for (const m of mappings) console.log(`  - ${m.subject_id} -> ${m.folder_id} (${m.folder_name})`);

let missing = [];
let mismatch = [];
let ok = [];

for (const m of mappings) {
  try {
    const res = await drive.files.get({
      fileId: m.folder_id,
      fields: "id, name, mimeType, trashed, parents",
      supportsAllDrives: true,
    });
    const file = res.data;
    if (!file || file.trashed) {
      missing.push({ ...m, reason: file?.trashed ? "trashed" : "not found" });
      console.log(`[FAIL] ${m.subject_id}: folder ${m.folder_id} not found or trashed`);
      continue;
    }
    const name = file.name ?? "";
    // Optional mismatch check: folder_name should match Drive name (case-insensitive)
    if (m.folder_name && name && m.folder_name.split("/").pop()?.trim().toLowerCase() !== name.toLowerCase()) {
      // Warn but not fail hard unless exact mismatch is considered error
      console.log(`[WARN] ${m.subject_id}: folder_name DB "${m.folder_name}" vs Drive name "${name}" (check path)`);
      mismatch.push({ subject_id: m.subject_id, folder_id: m.folder_id, db_name: m.folder_name, drive_name: name });
    }
    if (file.mimeType !== "application/vnd.google-apps.folder") {
      console.log(`[WARN] ${m.subject_id}: id ${m.folder_id} mimeType is ${file.mimeType} (expected folder)`);
    }
    ok.push(m.subject_id);
    console.log(`[OK] ${m.subject_id}: "${name}" (${m.folder_id})`);
  } catch (e) {
    const msg = e?.message ?? String(e);
    const code = e?.code ?? e?.status ?? e?.response?.status ?? "";
    // 404 means missing
    if (String(code) === "404" || msg.includes("404") || msg.toLowerCase().includes("not found")) {
      missing.push({ ...m, reason: msg });
      console.log(`[FAIL] ${m.subject_id}: folder ${m.folder_id} not found (404) — ${msg.slice(0,120)}`);
    } else {
      // 403 etc -> permission issue -> treat as missing/misconfigured
      missing.push({ ...m, reason: msg });
      console.log(`[FAIL] ${m.subject_id}: Drive error for ${m.folder_id} — ${code || ""} ${msg.slice(0,160)}`);
    }
  }
}

console.log("\n=== SUMMARY ===");
console.log(`OK: ${ok.length} | MISSING/ERROR: ${missing.length} | NAME_MISMATCH: ${mismatch.length}`);
if (mismatch.length > 0) {
  console.log("\nMismatched names (check folder_name vs Drive):");
  for (const mm of mismatch) console.log(`  ${mm.subject_id}: DB "${mm.db_name}" vs Drive "${mm.drive_name}"`);
}
if (missing.length > 0) {
  console.log("\nMissing / inaccessible folders:");
  for (const mm of missing) console.log(`  ${mm.subject_id} -> ${mm.folder_id} (${mm.reason?.slice(0,80) ?? ""})`);
  console.log("\nFix: create folder Horarium/{Materia} in Drive, share with SA email as Editor, then upsert subject_drive_folders.");
  process.exit(1);
}
console.log("\nAll mapped folders verified.");
