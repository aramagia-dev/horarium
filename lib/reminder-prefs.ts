// Per-user per-type reminder lead times (days before the event).
// Pure helpers — safe to import from client components and server routes.
// Storage: public.reminder_prefs { user_id, lead_days: { [type]: number[] } }.
// Absent row/key = DEFAULT_LEADS. Stored empty array = explicitly disabled.

export const REMINDER_TYPES = [
  { value: "parcial", label: "Parcial" },
  { value: "entrega", label: "Entrega" },
  { value: "tarea", label: "Tarea" },
  { value: "recuperatorio", label: "Recuperatorio" },
  { value: "exposición", label: "Exposición" },
  { value: "feriado", label: "Sin clases" },
  { value: "otro", label: "Otro" },
] as const;

/** Defaults: días antes de cada tipo en que se avisa. */
export const DEFAULT_LEADS: Record<string, number[]> = {
  parcial: [1, 7],
  exposición: [1, 7],
  recuperatorio: [1, 7],
  entrega: [1, 3],
  tarea: [1, 2],
  feriado: [1],
  otro: [1],
};

/** Day chips offered in the UI. */
export const LEAD_OPTIONS = [1, 2, 3, 7, 14];

/** Hard cap: leads beyond this are ignored, and the cron never looks further ahead. */
export const MAX_LEAD_WINDOW = 30;

/** Limpia una lista: enteros 1..MAX, únicos, ordenados. Vacía = desactivado. */
export function sanitizeLeads(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.filter(
        (n): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_LEAD_WINDOW,
      ),
    ),
  ].sort((a, b) => a - b);
}

/** Anticipaciones efectivas para un tipo: lo guardado, o el default si no hay fila/clave. */
export function leadsFor(
  type: string | null | undefined,
  prefs: Record<string, unknown> | null | undefined,
): number[] {
  const key = type ?? "otro";
  if (prefs && Array.isArray(prefs[key])) return sanitizeLeads(prefs[key]);
  return DEFAULT_LEADS[key] ?? [1];
}
