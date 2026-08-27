import type { ScheduleEntry } from "@/lib/schedule-data";
import { formatEventDate, isEventOverdue, type AcademicEvent, type EnrichedEvent } from "@/lib/academic-events";

export function AppOverview({ schedule, events, onNavigate }: { schedule: ScheduleEntry[]; events: AcademicEvent[]; onNavigate: (view: "schedule" | "notes" | "events") => void }) {
  const subjects = new Set(schedule.map((entry) => entry.code));
  const professors = new Set(schedule.map((entry) => entry.professor));
  const stats = [
    ["Materias", subjects.size, "materias únicas"],
    ["Clases semanales", schedule.length, "clases programadas"],
    ["Profesores", professors.size, "docentes asignados"],
  ];

  // Agenda compartida: solo pendientes más cercanos, sin vencidos ni completados
  const upcoming = [...events]
    .filter((e) => e.status !== "cancelled")
    .filter((e) => {
      const enriched = e as EnrichedEvent;
      const completedByMe = Boolean(enriched.isCompletedByMe);
      if (completedByMe) return false;
      if (isEventOverdue(e, completedByMe)) return false;
      return true;
    })
    .sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return (a.time ?? "").localeCompare(b.time ?? "");
    })
    .slice(0, 3);

  const hasAnyEvents = events.filter((e) => e.status !== "cancelled").length > 0;

  return (
    <section aria-label="Inicio" className="mx-auto max-w-5xl">
      <div className="mb-8">
        <p className="text-xs font-bold tracking-[0.14em] text-[var(--accent)] uppercase">Tu semana, de un vistazo</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-[var(--ink)]">Bienvenido a Horarium</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Consultá tus clases, organizá tus materias y mantené tus notas cerca, todo desde este navegador.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map(([label, value, detail]) => (
          <div key={label} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
            <p className="text-xs font-semibold text-[var(--muted)]">{label}</p>
            <p className="mt-3 text-3xl font-bold text-[var(--ink)]">{value}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{detail}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Agenda compartida</p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--ink)]">Próximos eventos</h2>
          </div>
          <button type="button" onClick={() => onNavigate("events")} className="text-xs font-semibold text-[var(--accent)] hover:underline">
            Ver todos
          </button>
        </div>
        {!hasAnyEvents ? (
          <p className="mt-4 text-sm text-[var(--muted)]">Todavía no hay fechas académicas cargadas.</p>
        ) : upcoming.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">¡Estás al día! No tenés pendientes próximos.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {upcoming.map((event) => (
              <button
                type="button"
                key={event.id}
                onClick={() => onNavigate("events")}
                className="flex w-full items-center justify-between gap-3 rounded-xl bg-[var(--background)] px-4 py-3 text-left"
              >
                <span className="min-w-0">
                  <strong className="block truncate text-sm text-[var(--ink)]">{event.title}</strong>
                  <span className="text-xs text-[var(--muted)]">
                    {formatEventDate(event.date)}
                    {event.subject_code ? ` · ${event.subject_code}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] font-bold capitalize text-[var(--accent)]">{event.type}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Accesos rápidos</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onNavigate("schedule")}
            className="rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Ver horario
          </button>
          <button
            type="button"
            onClick={() => onNavigate("notes")}
            className="rounded-xl bg-[var(--soft)] px-4 py-3 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--line)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Abrir notas
          </button>
        </div>
      </div>
    </section>
  );
}
