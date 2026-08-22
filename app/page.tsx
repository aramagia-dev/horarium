"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppOverview } from "@/components/app-overview";
import { AdminBoard } from "@/components/admin-board";
import { AuthPanel, type AuthState } from "@/components/auth-panel";
import { CatalogBoard } from "@/components/catalog-board";
import { NotesBoard } from "@/components/notes-board";
import { ScheduleBoard } from "@/components/schedule-board";
import { EventsBoard } from "@/components/events-board";
import { SettingsBoard } from "@/components/settings-board";
import { SubjectModal } from "@/components/subject-modal";
import { scheduleSessions, type ScheduleEntry } from "@/lib/schedule-data";
import { loadPublicSchedule, type PublicScheduleState } from "@/lib/public-schedule";

type View = "home" | "schedule" | "events" | "notes" | "subjects" | "professors" | "rooms" | "settings" | "admin";
type NavItem = { view: View; icon: string; label: string };
const themeKey = "horarium:theme";
const baseNavItems: NavItem[] = [
  { view: "home", icon: "⌂", label: "Inicio" }, { view: "schedule", icon: "▦", label: "Horario" },
  { view: "notes", icon: "♧", label: "Notas" }, { view: "events", icon: "◈", label: "Eventos" }, { view: "subjects", icon: "▱", label: "Materias" },
  { view: "professors", icon: "♙", label: "Profesores" }, { view: "rooms", icon: "⌖", label: "Aulas" },
  { view: "settings", icon: "⚙", label: "Configuración" },
];

export default function Home() {
  const [view, setView] = useState<View>("schedule");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<ScheduleEntry | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dark, setDark] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [publicData, setPublicData] = useState<PublicScheduleState | null>(null);
  const publicDataRequest = useRef(0);
  const mounted = useRef(true);

  const refreshPublicData = useCallback(() => {
    const requestId = ++publicDataRequest.current;
    void loadPublicSchedule().then((data) => {
      if (mounted.current && requestId === publicDataRequest.current) setPublicData(data);
    });
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const isDark = window.localStorage.getItem(themeKey) === "dark";
      setDark(isDark);
      document.documentElement.classList.toggle("dark", isDark);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    mounted.current = true;
    refreshPublicData();
    return () => { mounted.current = false; };
  }, [refreshPublicData]);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem(themeKey, next ? "dark" : "light");
  }

  function navigate(nextView: View) { setView(nextView); setDrawerOpen(false); }
  const handleAuthChange = useCallback(({ userId: nextUserId, isAdmin: nextIsAdmin }: AuthState) => {
    setUserId(nextUserId);
    setIsAdmin(nextIsAdmin);
    if (!nextIsAdmin) setView((current) => current === "admin" ? "schedule" : current);
  }, []);
  function selectSubject(subject: ScheduleEntry, date?: Date) { setSelectedSubject(subject); setSelectedDate(date ?? null); }
  const navItems = isAdmin ? [...baseNavItems, { view: "admin" as const, icon: "⚒", label: "Administración" }] : baseNavItems;
  const schedule = publicData?.schedule ?? [];

  return <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
    <header className="flex h-[72px] items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-4 sm:px-8">
      <div className="flex items-center gap-3"><button type="button" onClick={() => setDrawerOpen(true)} aria-label="Abrir navegación" aria-expanded={drawerOpen} className="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-[var(--ink)] transition hover:bg-[var(--soft)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] lg:hidden">☰</button><button type="button" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? "Mostrar navegación" : "Ocultar navegación"} aria-expanded={!sidebarCollapsed} className="hidden h-9 w-9 items-center justify-center rounded-lg text-xl text-[var(--ink)] transition hover:bg-[var(--soft)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] lg:flex">{sidebarCollapsed ? "☰" : "‹"}</button><div className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-[var(--accent)] text-lg text-white">◷</div><div><p className="text-[18px] font-bold tracking-tight text-[var(--ink)]">Horarium</p><p className="text-[10px] text-[var(--muted)]">Horario universitario</p></div></div>
        <div className="flex items-center gap-3"><ThemeToggle dark={dark} onToggle={toggleTheme} /><AuthPanel onAuthChange={handleAuthChange} /></div>
    </header>
    <div className="flex min-h-[calc(100vh-72px)]">{!sidebarCollapsed ? <Sidebar items={navItems} view={view} onNavigate={navigate} /> : null}<MobileDrawer items={navItems} open={drawerOpen} view={view} onNavigate={navigate} onClose={() => setDrawerOpen(false)} /><div className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        {!publicData ? <LoadingState /> : view === "home" ? <AppOverview schedule={schedule} events={publicData.events} onNavigate={navigate} /> : view === "schedule" ? <><div aria-label="Próximos eventos del calendario" className="mx-auto mb-5 flex max-w-5xl items-center gap-2 overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3"><span className="shrink-0 text-xs font-bold text-[var(--accent)]">Eventos:</span>{publicData.events.filter((event) => event.status !== "cancelled").slice(0, 4).map((event) => <button type="button" key={event.id} onClick={() => navigate("events")} className="shrink-0 rounded-full bg-[var(--soft)] px-3 py-1 text-xs font-semibold text-[var(--ink)]">{event.date.slice(8, 10)}/{event.date.slice(5, 7)} · {event.title}</button>)}{publicData.events.length === 0 ? <span className="text-xs text-[var(--muted)]">No hay eventos cargados</span> : null}</div><ScheduleBoard schedule={schedule} events={publicData.events} onSelectSubject={(subject, date) => selectSubject(subject, date)} /></> : view === "events" ? <EventsBoard events={publicData.events} subjects={publicData.subjects} isAdmin={isAdmin} userId={userId} sourceError={publicData.eventsError} onDataChanged={refreshPublicData} /> : view === "notes" ? <NotesBoard schedule={schedule} /> : view === "settings" ? <SettingsBoard dark={dark} onToggleTheme={toggleTheme} /> : view === "admin" ? <AdminBoard onDataChanged={refreshPublicData} /> : <CatalogBoard schedule={schedule} subjects={publicData.subjects} professors={publicData.professors} rooms={publicData.rooms} kind={view === "subjects" ? "subjects" : view === "professors" ? "professors" : "rooms"} onSelectSubject={(subject) => selectSubject(subject)} />}
    </div></div>
     {selectedSubject ? <SubjectModal subject={selectedSubject} sessions={schedule.filter((entry) => entry.subjectId === selectedSubject.subjectId)} date={selectedDate ?? undefined} legacyEntryIds={[...schedule.filter((entry) => entry.subjectId === selectedSubject.subjectId).map((entry) => entry.id), ...scheduleSessions.filter((entry) => entry.subjectId === selectedSubject.subjectId).map((entry) => entry.id)]} onClose={() => { setSelectedSubject(null); setSelectedDate(null); }} onOpenNotes={() => { setSelectedSubject(null); setSelectedDate(null); setView("notes"); }} /> : null}
  </main>;
}

function LoadingState() { return <section aria-live="polite" className="mx-auto max-w-5xl rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-sm text-[var(--muted)]">Cargando horario…</section>; }

function Sidebar({ items, view, onNavigate }: { items: NavItem[]; view: View; onNavigate: (view: View) => void }) { return <aside className="hidden w-[220px] shrink-0 border-r border-[var(--line)] bg-[var(--sidebar)] p-4 lg:block"><div className="mb-4"><p className="px-1 text-[10px] font-bold tracking-[0.14em] text-[var(--muted)] uppercase">Navegación</p></div><nav className="space-y-1" aria-label="Navegación principal">{items.map((item) => <NavItem key={item.view} {...item} active={view === item.view} onClick={() => onNavigate(item.view)} />)}</nav></aside>; }
function MobileDrawer({ items, open, view, onNavigate, onClose }: { items: NavItem[]; open: boolean; view: View; onNavigate: (view: View) => void; onClose: () => void }) { if (!open) return null; return <div className="fixed inset-0 z-40 lg:hidden"><button type="button" onClick={onClose} aria-label="Cerrar navegación" className="absolute inset-0 bg-slate-950/40" /><aside className="relative h-full w-[min(84vw,320px)] bg-[var(--sidebar)] p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><p className="text-xs font-bold tracking-[0.14em] text-[var(--muted)] uppercase">Navegación</p><button type="button" onClick={onClose} aria-label="Cerrar menú" className="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-[var(--muted)] hover:bg-[var(--soft)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">×</button></div><nav className="space-y-1" aria-label="Navegación principal">{items.map((item) => <NavItem key={item.view} {...item} active={view === item.view} onClick={() => onNavigate(item.view)} />)}</nav></aside></div>; }
function NavItem({ icon, label, active, collapsed = false, onClick }: { icon: string; label: string; active: boolean; collapsed?: boolean; onClick: () => void }) { return <button type="button" onClick={onClick} aria-label={label} aria-current={active ? "page" : undefined} title={collapsed ? label : undefined} className={`flex w-full items-center gap-3 rounded-[9px] px-3 py-2.5 text-left text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${collapsed ? "justify-center" : ""} ${active ? "bg-[var(--sidebar-accent)] font-semibold text-[var(--accent)]" : "text-[var(--muted)] hover:bg-[var(--soft)]"}`}><span aria-hidden="true" className="w-4 text-center text-lg leading-none">{icon}</span><span className={collapsed ? "sr-only" : ""}>{label}</span></button>; }
function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) { return <button type="button" onClick={onToggle} aria-label={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"} aria-pressed={dark} className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-[var(--secondary)] text-base text-[var(--ink)] transition hover:bg-[var(--soft)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><span aria-hidden="true">{dark ? "☼" : "☾"}</span></button>; }
