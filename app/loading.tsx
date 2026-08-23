export default function Loading() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="h-[72px] border-b border-[var(--line)] bg-[var(--surface)]" />
      <div className="flex min-h-[calc(100vh-72px)]">
        <div className="hidden w-[220px] shrink-0 border-r border-[var(--line)] bg-[var(--sidebar)] p-4 lg:block">
          <div className="h-4 w-24 animate-pulse rounded bg-[var(--line)]" />
        </div>
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="mx-auto max-w-5xl w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-sm text-[var(--muted)]" aria-live="polite">Cargando horario…</div>
        </div>
      </div>
    </main>
  );
}
