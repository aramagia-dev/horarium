import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const envPath = resolve(process.cwd(), ".env.local");
const raw = readFileSync(envPath, "utf8");
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  const k = t.slice(0, eq).trim();
  const v = t.slice(eq + 1).trim();
  process.env[k] = v;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

// Never log secrets — only prefix/len
console.log("=== Supabase anon verification ===");
console.log("url:", url);
console.log("key prefix:", key.slice(0, 22) + "... len=" + key.length);

const results = [];

async function section(label, fn) {
  const out = await fn();
  // out is { data, error } shape from supabase, or custom
  console.log("\n--- " + label + " ---");
  if (out.error) console.log("error:", out.error.message, "code:", out.error.code ?? "-", "status:", out.status ?? "-");
  else console.log("ok, count:", Array.isArray(out.data) ? out.data.length : out.data ? 1 : 0);
  if (out.data && Array.isArray(out.data) && out.data.length > 0) {
    // cap output
    const preview = out.data.slice(0, 20);
    console.log(JSON.stringify(preview, null, 2));
    if (out.data.length > 20) console.log("... (" + (out.data.length - 20) + " more)");
  } else if (out.data && !Array.isArray(out.data)) {
    console.log(JSON.stringify(out.data, null, 2));
  }
  if (out.data && Array.isArray(out.data) && out.data.length === 0) {
    console.log("(empty)");
  }
  results.push({ label, ok: !out.error, count: Array.isArray(out.data) ? out.data.length : 0, error: out.error?.message ?? null });
  return out;
}

const subjects = await section("subjects public read (expect 6)", () =>
  supabase.from("subjects").select("id,code,name,accent").order("code")
);
const professors = await section("professors public read", () =>
  supabase.from("professors").select("normalized_name,display_name").order("normalized_name").limit(20)
);
const rooms = await section("rooms public read", () =>
  supabase.from("rooms").select("name").order("name")
);
const schedules = await section("schedules public read (may be empty — expected)", () =>
  supabase.from("schedules").select("id,subject_id,day,start_time,end_time,section").order("day")
);
await section("notes public read", () =>
  supabase.from("notes").select("id,subject_id,content").limit(5)
);

// RLS write rejection
console.log("\n--- unauth insert into subjects (should be rejected by RLS) ---");
const probe = await supabase.from("subjects").insert({ id: "subject-probe", code: "PROBE", name: "Probe Subject", accent: "violet" });
if (probe.error) {
  console.log("RLS correctly rejected unauth insert:", probe.error.message, "code:", probe.error.code, "status:", probe.status);
  results.push({ label: "unauth insert subjects rejected", ok: true, error: null });
} else {
  console.log("UNEXPECTED: unauth insert succeeded — RLS not enforcing. Cleaning up probe row...");
  await supabase.from("subjects").delete().eq("id", "subject-probe");
  results.push({ label: "unauth insert subjects rejected", ok: false, error: "insert unexpectedly succeeded" });
}

// anon profiles should be denied (policy is authenticated only)
console.log("\n--- profiles anon read (expect RLS deny or empty) ---");
const profiles = await supabase.from("profiles").select("id,role").limit(5);
if (profiles.error) console.log("profiles anon read denied (expected):", profiles.error.message, "code:", profiles.error.code);
else console.log("profiles anon read returned", profiles.data?.length ?? 0, "rows (may be empty due to RLS)");

// Summary
console.log("\n=== SUMMARY ===");
for (const r of results) console.log((r.ok ? "PASS" : "FAIL") + " " + r.label + (r.count !== undefined ? " count=" + r.count : "") + (r.error ? " error=" + r.error : ""));
const allPass =
  (subjects.data?.length === 6) &&
  !subjects.error &&
  !professors.error &&
  !rooms.error &&
  !schedules.error &&
  probe.error;
if (!allPass) {
  console.log("\nOVERALL: FAIL — check failures above");
  process.exit(1);
} else {
  console.log("\nOVERALL: PASS — live Supabase connection verified");
  if ((schedules.data?.length ?? 0) === 0) console.log("Note: schedules empty is expected until an admin creates sessions.");
}
