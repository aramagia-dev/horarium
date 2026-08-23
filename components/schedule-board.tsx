"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpenCheck, CalendarDays, ClipboardCheck, Presentation, RotateCcw } from "lucide-react";
import { addLocalDays, dayForDate, formatDateInput, formatDay, formatWeekHeading, formatWeekRange, getInitialDay, getWeekStart, isSameLocalDay, parseDateInput, startOfLocalDay } from "@/lib/calendar-utils";
import type { AcademicEvent, AcademicEventType } from "@/lib/academic-events";
import { days, minutesFromStart, timeSlots, timelineDisplayEnd, type Day, type ScheduleEntry } from "@/lib/schedule-data";
import { hoverTransition, pageVariants, scheduleCardHover, staggerContainer, staggerItem, useReducedMotion, withReducedMotion } from "@/lib/motion";

const timelineHeight = 720;
const timelineInset = 20;
const timelineContentHeight = timelineHeight - timelineInset * 2;
const totalMinutes = minutesFromStart(timelineDisplayEnd);
const timelinePosition = (time: string) => `${timelineInset + (minutesFromStart(time) / totalMinutes) * timelineContentHeight}px`;

export function getSessionEvents(entry: ScheduleEntry, date: Date, events: AcademicEvent[], subjectSessions: ScheduleEntry[] = [entry]) {
  const matchingEvents = events.filter((event) => event.status !== "cancelled" && event.date === formatDateInput(date) && event.subject_id === entry.subjectId);
  const untimedEvents = matchingEvents.filter((event) => !event.time);
  const timedEvents = matchingEvents.filter((event) => event.time);
  const selectedTimedEvents = timedEvents.filter((event) => {
    const eventTime = minutesFromStart(event.time!);
    const containing = subjectSessions.filter((session) => eventTime >= minutesFromStart(session.start) && eventTime <= minutesFromStart(session.end));
    const closest = containing[0] ?? [...subjectSessions].sort((left, right) => Math.abs(eventTime - minutesFromStart(left.start)) - Math.abs(eventTime - minutesFromStart(right.start)))[0];
    return closest?.id === entry.id;
  });
  return [...untimedEvents, ...selectedTimedEvents];
}

export function ScheduleBoard({ schedule, events, onSelectSubject, onSelectEvent }: { schedule: ScheduleEntry[]; events: AcademicEvent[]; onSelectSubject: (subject: ScheduleEntry, date: Date) => void; onSelectEvent: (event: AcademicEvent) => void }) {
  const today = startOfLocalDay(new Date());
  const [weekStart, setWeekStart] = useState(() => getWeekStart(today));
  const [activeDay, setActiveDay] = useState<Day>(() => getInitialDay(today));
  const weekDates = days.map((_, index) => addLocalDays(weekStart, index));
  const reduced = useReducedMotion();
  function moveWeek(amount: number) { setWeekStart((current) => addLocalDays(current, amount * 7)); }
  function goToday() { const current = startOfLocalDay(new Date()); setWeekStart(getWeekStart(current)); setActiveDay(getInitialDay(current)); }
  function selectDate(value: string) { const date = parseDateInput(value); if (!date) return; setWeekStart(getWeekStart(date)); setActiveDay(dayForDate(date)); }

  return (
    <section aria-label="Horario semanal" className="w-full max-w-none min-w-0 overflow-visible">
      <motion.div variants={withReducedMotion(pageVariants, reduced)} initial="initial" animate="animate" className="mb-6 flex w-full max-w-full min-w-0 flex-col justify-between gap-4 overflow-visible xl:flex-row xl:items-center">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.03em] text-[var(--ink)]">{formatWeekHeading(weekStart)}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Horario semanal de clases</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] p-1">
            <button type="button" onClick={() => moveWeek(-1)} aria-label="Semana anterior" className="flex h-8 w-8 items-center justify-center rounded-[7px] text-lg text-[var(--muted)] hover:bg-[var(--soft)]">
              ‹
            </button>
            <span className="px-2 text-xs font-semibold text-[var(--ink)]">{formatWeekRange(weekStart)}</span>
            <button type="button" onClick={() => moveWeek(1)} aria-label="Semana siguiente" className="flex h-8 w-8 items-center justify-center rounded-[7px] text-lg text-[var(--muted)] hover:bg-[var(--soft)]">
              ›
            </button>
          </div>
          <button type="button" onClick={goToday} className="rounded-[10px] bg-[var(--soft)] px-3.5 py-2 text-xs font-semibold text-[var(--accent)]">
            Hoy
          </button>
          <label className="flex items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--ink)]">
            <span className="sr-only">Ir a una fecha</span>
            <input type="date" value={formatDateInput(weekDates[days.indexOf(activeDay)])} onChange={(event) => selectDate(event.target.value)} aria-label="Seleccionar fecha" className="bg-transparent text-xs text-[var(--ink)] outline-none" />
          </label>
        </div>
      </motion.div>
      <motion.div
        variants={withReducedMotion(staggerContainer, reduced)}
        initial="hidden"
        animate="visible"
        className="mb-5 grid w-full max-w-full min-w-0 grid-cols-5 gap-2 overflow-visible py-1 lg:hidden"
      >
        {days.map((day, index) => {
          const eventCount = events.filter((event) => event.date === formatDateInput(weekDates[index]) && event.status !== "cancelled").length;
          return (
            <motion.button
              key={day}
              type="button"
              variants={withReducedMotion(staggerItem, reduced)}
              whileHover={reduced ? undefined : { y: -1, scale: 1.01 }}
              whileTap={reduced ? undefined : { scale: 0.98 }}
              onClick={() => setActiveDay(day)}
              aria-label={`${formatDay(day)} ${weekDates[index].getDate()}${eventCount ? `, ${eventCount} ${eventCount === 1 ? "evento académico" : "eventos académicos"}` : ""}`}
              className={`w-full min-w-0 rounded-[18px] border px-2 py-2.5 text-center transition ${activeDay === day ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-transparent bg-[var(--secondary)] text-[var(--muted)]"}`}
            >
              <span className="block text-[11px] font-semibold">{formatDay(day)}</span>
              <span className={`mt-0.5 block text-lg font-bold ${activeDay === day ? "text-white" : "text-[var(--ink)]"}`}>{weekDates[index].getDate()}</span>
              {eventCount ? <span className={`mt-1 block text-[10px] font-semibold ${activeDay === day ? "text-white" : "text-[var(--accent)]"}`}>• {eventCount} {eventCount === 1 ? "evento" : "eventos"}</span> : null}
            </motion.button>
          );
        })}
      </motion.div>
      <motion.div
        variants={withReducedMotion(pageVariants, reduced)}
        initial="initial"
        animate="animate"
        className="w-full max-w-full min-w-0 overflow-hidden rounded-[14px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(30,27,75,0.06)]"
      >
        <div className="hidden min-w-0 w-full lg:block">
          <div className="grid grid-cols-[74px_repeat(5,minmax(0,1fr))] border-b border-[var(--line)]">
            <div />
            {days.map((day, index) => {
              const eventCount = events.filter((event) => event.date === formatDateInput(weekDates[index]) && event.status !== "cancelled").length;
              return (
                <div
                  key={day}
                  aria-label={`${formatDay(day)} ${weekDates[index].getDate()}${eventCount ? `, ${eventCount} eventos académicos` : ""}`}
                  className="flex items-center justify-center gap-2 border-l border-[var(--line)] px-2 py-4"
                >
                  <p className="text-xs font-semibold text-[var(--muted)]">{formatDay(day)}</p>
                  <p className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${isSameLocalDay(weekDates[index], today) ? "bg-[var(--accent)] text-white" : "text-[var(--ink)]"}`}>{weekDates[index].getDate()}</p>
                  {eventCount ? <span className="rounded-full bg-[var(--soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent)]">• {eventCount}</span> : null}
                </div>
              );
            })}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={formatDateInput(weekStart)}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="grid grid-cols-[74px_repeat(5,minmax(0,1fr))]"
            >
              <div className="relative" style={{ height: timelineHeight }}>
                {timeSlots.map((time, index) => (
                  <span key={time} className={`absolute right-3 text-[10px] font-medium text-[var(--muted)] ${index === timeSlots.length - 1 ? "-translate-y-full" : "-translate-y-1/2"}`} style={{ top: timelinePosition(time) }}>
                    {time}
                  </span>
                ))}
              </div>
              {days.map((day, index) => (
                <DayColumn key={day} entries={schedule.filter((item) => item.day === day)} date={weekDates[index]} events={events} onSelectSubject={onSelectSubject} onSelectEvent={onSelectEvent} reduced={reduced} />
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="w-full max-w-full min-w-0 overflow-x-hidden lg:hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeDay + formatDateInput(weekStart)}
              variants={withReducedMotion(staggerContainer, reduced)}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="w-full max-w-full min-w-0 space-y-3 overflow-x-hidden p-4"
            >
              {schedule
                .filter((item) => item.day === activeDay)
                .map((entry) => (
                  <motion.div key={entry.id} variants={withReducedMotion(staggerItem, reduced)}>
                    <MobileScheduleCard
                      entry={entry}
                      date={weekDates[days.indexOf(activeDay)]}
                      events={events}
                      subjectSessions={schedule.filter((session) => session.day === activeDay && session.subjectId === entry.subjectId)}
                      onSelect={onSelectSubject}
                      onSelectEvent={onSelectEvent}
                      reduced={reduced}
                    />
                  </motion.div>
                ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </section>
  );
}

function DayColumn({ entries, date, events, onSelectSubject, onSelectEvent, reduced }: { entries: ScheduleEntry[]; date: Date; events: AcademicEvent[]; onSelectSubject: (subject: ScheduleEntry, date: Date) => void; onSelectEvent: (event: AcademicEvent) => void; reduced: boolean | null }) {
  return (
    <div className="relative border-l border-[var(--line)]" style={{ height: timelineHeight }}>
      {timeSlots.map((time) => (
        <div key={time} className="absolute left-0 right-0 border-t border-dashed border-[var(--line)]" style={{ top: timelinePosition(time) }} />
      ))}
      {entries.map((entry) => (
        <ScheduleCard key={entry.id} entry={entry} date={date} events={events} subjectSessions={entries.filter((session) => session.subjectId === entry.subjectId)} onSelect={onSelectSubject} onSelectEvent={onSelectEvent} reduced={reduced} />
      ))}
    </div>
  );
}

function cardKeyDown(event: React.KeyboardEvent, onSelect: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect();
  }
}
function ScheduleCard({ entry, date, events, subjectSessions, onSelect, onSelectEvent, reduced }: { entry: ScheduleEntry; date: Date; events: AcademicEvent[]; subjectSessions: ScheduleEntry[]; onSelect: (subject: ScheduleEntry, date: Date) => void; onSelectEvent: (event: AcademicEvent) => void; reduced: boolean | null }) {
  const top = timelineInset + (minutesFromStart(entry.start) / totalMinutes) * timelineContentHeight;
  const height = ((minutesFromStart(entry.end) - minutesFromStart(entry.start)) / totalMinutes) * timelineContentHeight;
  const sessionEvents = getSessionEvents(entry, date, events, subjectSessions);
  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(entry, date)}
      onKeyDown={(event) => cardKeyDown(event, () => onSelect(entry, date))}
      whileHover={reduced ? undefined : scheduleCardHover}
      whileTap={reduced ? undefined : { scale: 0.99 }}
      transition={hoverTransition}
      className={`schedule-card accent-${entry.accent} absolute left-1.5 right-1.5 z-10 overflow-hidden rounded-[10px] border px-3 py-2.5 text-left sm:left-2 sm:right-2`}
      style={{ top, height, minHeight: 108 }}
    >
      <span className="block truncate text-[10px] font-bold tracking-[0.12em] opacity-80 uppercase">{entry.section}</span>
      {sessionEvents.length ? <EventPreview events={sessionEvents} onSelect={onSelectEvent} compact /> : null}
      <strong className="mt-1 block line-clamp-2 text-sm font-bold leading-4">{entry.subject}</strong>
      <span className="mt-1.5 block truncate text-[11px] font-medium opacity-75">{entry.professor}</span>
      <span className="mt-0.5 block truncate text-[11px] font-medium opacity-75">{entry.room}</span>
    </motion.div>
  );
}

function MobileScheduleCard({ entry, date, events, subjectSessions = [entry], onSelect, onSelectEvent, reduced }: { entry: ScheduleEntry; date: Date; events: AcademicEvent[]; subjectSessions?: ScheduleEntry[]; onSelect: (subject: ScheduleEntry, date: Date) => void; onSelectEvent: (event: AcademicEvent) => void; reduced: boolean | null }) {
  const sessionEvents = getSessionEvents(entry, date, events, subjectSessions);
  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(entry, date)}
      onKeyDown={(event) => cardKeyDown(event, () => onSelect(entry, date))}
      whileHover={reduced ? undefined : scheduleCardHover}
      whileTap={reduced ? undefined : { scale: 0.99 }}
      transition={hoverTransition}
      className={`schedule-card accent-${entry.accent} relative flex min-h-[132px] w-full max-w-full min-w-0 items-start gap-4 overflow-hidden rounded-[20px] border px-4 py-5 text-left shadow-[0_8px_24px_rgba(30,27,75,0.04)]`}
    >
      <div className="w-[54px] shrink-0 border-r border-[var(--line)] pr-3 font-mono text-sm font-bold leading-6">
        <span className="block">{entry.start}</span>
        <span className="block font-normal opacity-60">{entry.end}</span>
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <strong className="block break-words text-base font-bold leading-5">{entry.subject}</strong>
        <span className="mt-1 block break-words text-sm opacity-75">{entry.professor}</span>
        <span className="mt-2 block break-words text-sm opacity-75">⌖ {entry.room}</span>
        {sessionEvents.length ? <EventPreview events={sessionEvents} onSelect={onSelectEvent} /> : null}
      </div>
      <span className="shrink-0 rounded-full border border-black/5 bg-white px-2.5 py-1 text-[10px] font-bold tracking-wide text-slate-700 shadow-sm dark:border-white/10 dark:bg-white dark:text-slate-800">{entry.section.replace("Section ", "Sec ")}</span>
    </motion.div>
  );
}

const eventVisuals: Record<AcademicEventType, { label: string; icon: typeof CalendarDays; color: string }> = { parcial: { label: "Parcial", icon: ClipboardCheck, color: "text-rose-500" }, entrega: { label: "Entrega", icon: BookOpenCheck, color: "text-sky-500" }, recuperatorio: { label: "Recuperatorio", icon: RotateCcw, color: "text-amber-500" }, exposición: { label: "Exposición", icon: Presentation, color: "text-violet-500" }, otro: { label: "Otro", icon: CalendarDays, color: "text-[var(--accent)]" } };
function EventPreview({ events, onSelect, compact = false }: { events: AcademicEvent[]; onSelect: (event: AcademicEvent) => void; compact?: boolean }) {
  return (
    <div className={compact ? "mt-1 space-y-1" : "mt-3 space-y-1.5"}>
      {events.map((event) => {
        const visual = eventVisuals[event.type];
        const Icon = visual.icon;
        return (
          <button
            key={event.id}
            type="button"
            title={event.title}
            aria-label={`Evento académico: ${visual.label}: ${event.title}${event.time ? `, ${event.time}` : ""}`}
            onClick={(click) => {
              click.stopPropagation();
              onSelect(event);
            }}
            onKeyDown={(key) => key.stopPropagation()}
            className="flex min-w-0 w-full max-w-full items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--surface)]/90 px-1.5 py-1 text-left text-[10px] font-semibold shadow-sm transition hover:border-[var(--accent)] focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <Icon aria-hidden="true" size={13} className={`shrink-0 ${visual.color}`} />
            <span className="shrink-0 text-[9px] uppercase tracking-wide text-[var(--muted)]">{visual.label}</span>
            <span className="min-w-0 flex-1 truncate text-[var(--ink)]">{event.title}</span>
            {event.time ? <span className="shrink-0 text-[9px] text-[var(--muted)]">{event.time}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
