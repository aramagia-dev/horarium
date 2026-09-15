/**
 * Pure helpers for the community professor/room assignment flow.
 * Any logged-in user may attach a professor and a room to a session and
 * add missing catalogue entries; duplicates are discouraged app-side with
 * a "did you mean ...?" warning built on these helpers.
 */

/** Canonical form for catalogue comparison: lowercase, no accents, single spaces. */
export function normalizeCatalogName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Returns existing catalogue names that look like the typed value, so the UI
 * can suggest reusing them instead of creating a near-duplicate.
 * Match rule (accent/case-insensitive): either side contains the other.
 * The exact normalized match is excluded — the caller reuses it silently.
 */
export function findSimilarCatalogNames(existing: string[], value: string): string[] {
  const needle = normalizeCatalogName(value);
  if (!needle) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of existing) {
    const hay = normalizeCatalogName(name);
    if (!hay || hay === needle || seen.has(hay)) continue;
    seen.add(hay);
    if (hay.includes(needle) || needle.includes(hay)) out.push(name);
  }
  return out;
}

/** True for DB-backed schedule rows (uuid ids). Legacy demo ids are slugs. */
export function isDbSessionId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
