"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, BookOpenCheck, CalendarDays, ClipboardCheck, Presentation, RotateCcw } from "lucide-react";
import { addLocalDays, dayForDate, formatDateInput, formatDay, formatWeekHeading, formatWeekRange, getDisplayWeekStart, getInitialDay, getWeekStart, isSameLocalDay, parseDateInput, startOfLocalDay } from "@/lib/calendar-utils";
import type { AcademicEvent, AcademicEventType } from "@/lib/academic-events";
import { days, minutesFromStart, timeSlots, timelineDisplayEnd, type Day, type ScheduleEntry } from "@/lib/schedule-data";
import { hoverTransition, pageVariants, scheduleCardHover, staggerContainer, staggerItem, useReducedMotion, withReducedMotion } from "@/lib/motion";
import { useDialogA11y } from "@/lib/use-dialog-a11y";

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
  const [weekStart, setWeekStart] = useState(() => getDisplayWeekStart(today));
  const [activeDay, setActiveDay] = useState<Day>(() => getInitialDay(today));
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [popoverVariant, setPopoverVariant] = useState<"desktop" | "mobile" | null>(null);
  const weekDates = days.map((_, index) => addLocalDays(weekStart, index));
  const reduced = useReducedMotion();
  const isPopoverOpen = !!openDay;
  const popoverRef = useDialogA11y(isPopoverOpen && popoverVariant === "desktop", () => {
    setOpenDay(null);
    setPopoverVariant(null);
  });
  const mobilePopoverRef = useDialogA11y(isPopoverOpen && popoverVariant === "mobile", () => {
    setOpenDay(null);
    setPopoverVariant(null);
  });

  function closePopover() {
    setOpenDay(null);
    setPopoverVariant(null);
  }

  useEffect(() => {
    if (!openDay) return;
    function handleOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("[data-popover-trigger]")) return;
      const insideDesktop = popoverRef.current?.contains(target);
      const insideMobile = mobilePopoverRef.current?.contains(target);
      if (!insideDesktop && !insideMobile) closePopover();
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [openDay, popoverRef, mobilePopoverRef]);

  function moveWeek(amount: number) {
    closePopover();
    setWeekStart((current) => addLocalDays(current, amount * 7));
  }
  function goToday() {
    closePopover();
    const current = startOfLocalDay(new Date());
    setWeekStart(getDisplayWeekStart(current));
    setActiveDay(getInitialDay(current));
  }
  function selectDate(value: string) {
    const date = parseDateInput(value);
    if (!date) return;
    closePopover();
    setWeekStart(getWeekStart(date));
    setActiveDay(dayForDate(date));
  }

  const [swipeDir, setSwipeDir] = useState(0);
  function goNextDay() {
    closePopover();
    setSwipeDir(1);
    const idx = days.indexOf(activeDay);
    if (idx < days.length - 1) setActiveDay(days[idx + 1]);
    else {
      setWeekStart((cur) => addLocalDays(cur, 7));
      setActiveDay(days[0]);
    }
  }
  function goPrevDay() {
    closePopover();
    setSwipeDir(-1);
    const idx = days.indexOf(activeDay);
    if (idx > 0) setActiveDay(days[idx - 1]);
    else {
      setWeekStart((cur) => addLocalDays(cur, -7));
      setActiveDay(days[days.length - 1]);
    }
  }
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    touchRef.current = { x: t.clientX, y: t.clientY };
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx < 0) goNextDay();
    else goPrevDay();
  }

  const mobileSwipeVariants = reduced
    ? { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        hidden: (dir: number) => ({ opacity: 0, x: dir === 0 ? 0 : dir > 0 ? 28 : -28 }),
        visible: { opacity: 1, x: 0, transition: { duration: 0.22, ease: "easeOut" as const } },
        exit: (dir: number) => ({ opacity: 0, x: dir === 0 ? 0 : dir > 0 ? -28 : 28, transition: { duration: 0.18, ease: "easeIn" as const } }),
      };

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
      <div className="lg:hidden relative" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <motion.div
          variants={withReducedMotion(staggerContainer, reduced)}
          initial="hidden"
          animate="visible"
          className="mb-5 grid w-full max-w-full min-w-0 grid-cols-5 gap-2 overflow-visible py-1"
        >
        {days.map((day, index) => {
          const dateKey = formatDateInput(weekDates[index]);
          const eventCount = events.filter((event) => event.date === dateKey && event.status !== "cancelled").length;
          const isActive = activeDay === day;
          return (
            <motion.div
              key={day}
              variants={withReducedMotion(staggerItem, reduced)}
              whileHover={reduced ? undefined : { y: -1, scale: 1.01 }}
              whileTap={reduced ? undefined : { scale: 0.98 }}
              role="button"
              tabIndex={0}
              aria-label={`${formatDay(day)} ${weekDates[index].getDate()}${eventCount ? `, ${eventCount} ${eventCount === 1 ? "evento académico" : "eventos académicos"}` : ""}`}
              onClick={() => {
                const curIdx = days.indexOf(activeDay);
                const nextIdx = days.indexOf(day);
                if (nextIdx !== curIdx) setSwipeDir(nextIdx > curIdx ? 1 : -1);
                setActiveDay(day);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  const curIdx = days.indexOf(activeDay);
                  const nextIdx = days.indexOf(day);
                  if (nextIdx !== curIdx) setSwipeDir(nextIdx > curIdx ? 1 : -1);
                  setActiveDay(day);
                }
              }}
              className={`flex w-full min-w-0 cursor-pointer flex-col items-center rounded-[18px] border px-2 py-2.5 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${isActive ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-transparent bg-[var(--secondary)] text-[var(--muted)]"}`}
            >
              <span className="block text-[11px] font-semibold">{formatDay(day)}</span>
              <span className={`mt-0.5 block text-lg font-bold ${isActive ? "text-white" : "text-[var(--ink)]"}`}>{weekDates[index].getDate()}</span>
              {eventCount ? (
                <button
                  type="button"
                  data-popover-trigger={dateKey}
                  aria-haspopup="dialog"
                  aria-expanded={openDay === dateKey && popoverVariant === "mobile"}
                  aria-label={`Ver ${eventCount} ${eventCount === 1 ? "evento" : "eventos"} del ${formatDay(day)} ${weekDates[index].getDate()}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (openDay === dateKey && popoverVariant === "mobile") closePopover();
                    else {
                      setOpenDay(dateKey);
                      setPopoverVariant("mobile");
                    }
                  }}
                  className={`mt-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${isActive ? "bg-white/20 text-white hover:bg-white hover:text-[var(--accent)]" : "border border-[var(--line)] bg-[var(--surface)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white"}`}
                >
                  • {eventCount} {eventCount === 1 ? "evento" : "eventos"}
                </button>
              ) : null}
            </motion.div>
          );
        })}
      </motion.div>
        {openDay && popoverVariant === "mobile" ? (
          <DayEventsPopover
            dateKey={openDay}
            events={events}
            onSelectEvent={(event) => {
              onSelectEvent(event);
              closePopover();
            }}
            onClose={closePopover}
            popoverRef={mobilePopoverRef}
            reduced={reduced}
            variant="mobile"
          />
        ) : null}
      </div>
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
              const dateKey = formatDateInput(weekDates[index]);
              const eventCount = events.filter((event) => event.date === dateKey && event.status !== "cancelled").length;
              return (
                <div
                  key={day}
                  aria-label={`${formatDay(day)} ${weekDates[index].getDate()}${eventCount ? `, ${eventCount} eventos académicos` : ""}`}
                  className="relative flex items-center justify-center gap-2 border-l border-[var(--line)] px-2 py-4"
                >
                  <p className="text-xs font-semibold text-[var(--muted)]">{formatDay(day)}</p>
                  <p className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${isSameLocalDay(weekDates[index], today) ? "bg-[var(--accent)] text-white" : "text-[var(--ink)]"}`}>{weekDates[index].getDate()}</p>
                  {eventCount ? (
                    <button
                      type="button"
                      data-popover-trigger={dateKey}
                      aria-haspopup="dialog"
                      aria-expanded={openDay === dateKey && popoverVariant === "desktop"}
                      aria-label={`Ver ${eventCount} ${eventCount === 1 ? "evento" : "eventos"} del ${formatDay(day)} ${weekDates[index].getDate()}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (openDay === dateKey && popoverVariant === "desktop") closePopover();
                        else {
                          setOpenDay(dateKey);
                          setPopoverVariant("desktop");
                        }
                      }}
                      className="rounded-full bg-[var(--soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                    >
                      • {eventCount}
                    </button>
                  ) : null}
                  {openDay === dateKey && popoverVariant === "desktop" ? (
                    <DayEventsPopover
                      dateKey={dateKey}
                      events={events}
                      onSelectEvent={(event) => {
                        onSelectEvent(event);
                        closePopover();
                      }}
                      onClose={closePopover}
                      popoverRef={popoverRef}
                      reduced={reduced}
                      variant="desktop"
                    />
                  ) : null}
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
        <div
          className="w-full max-w-full min-w-0 overflow-x-hidden lg:hidden touch-pan-y"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <AnimatePresence mode="wait" custom={swipeDir}>
            <motion.div
              key={activeDay + formatDateInput(weekStart)}
              custom={swipeDir}
              variants={mobileSwipeVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              drag={reduced ? false : "x"}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.18}
              dragMomentum={false}
              onDragEnd={(_, info) => {
                const { offset, velocity } = info;
                if (Math.abs(offset.x) < 60) return;
                if (Math.abs(velocity.y) > Math.abs(velocity.x) * 1.2) return;
                if (offset.x < 0) goNextDay();
                else goPrevDay();
              }}
              className="w-full max-w-full min-w-0 space-y-4 overflow-x-hidden p-4"
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
  // Short sessions get less vertical room than their content needs: shed lines
  // instead of clipping them, and leave 1px breathing room so neighbors don't touch.
  const compact = height < 120;
  const tiny = height < 84;
  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(entry, date)}
      onKeyDown={(event) => cardKeyDown(event, () => onSelect(entry, date))}
      whileHover={reduced ? undefined : scheduleCardHover}
      whileTap={reduced ? undefined : { scale: 0.99 }}
      transition={hoverTransition}
      className={`schedule-card accent-${entry.accent} absolute left-1.5 right-1.5 z-10 overflow-hidden rounded-[10px] border px-3 text-left sm:left-2 sm:right-2 ${compact ? "py-1.5" : "py-2.5"}`}
      style={{ top: top + 1, height: Math.max(height - 2, 48) }}
    >
      <span className="block truncate text-[10px] font-bold tracking-[0.12em] opacity-80 uppercase">{entry.section}</span>
      {!tiny && sessionEvents.length ? <EventPreview events={sessionEvents} onSelect={onSelectEvent} compact /> : null}
      <strong className={`mt-1 block font-bold ${tiny ? "line-clamp-1 text-[13px] leading-4" : "line-clamp-2 text-sm leading-4"}`}>{entry.subject}</strong>
      {tiny ? null : <span className="mt-1.5 block truncate text-[11px] font-medium opacity-75">{entry.professor}</span>}
      {compact ? null : <span className="mt-0.5 block truncate text-[11px] font-medium opacity-75">{entry.room}</span>}
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

function DayEventsPopover({
  dateKey,
  events,
  onSelectEvent,
  onClose,
  popoverRef,
  reduced,
  variant,
}: {
  dateKey: string;
  events: AcademicEvent[];
  onSelectEvent: (event: AcademicEvent) => void;
  onClose: () => void;
  popoverRef: React.RefObject<HTMLDivElement | null>;
  reduced: boolean | null;
  variant: "desktop" | "mobile";
}) {
  const dayEvents = events.filter((event) => event.date === dateKey && event.status !== "cancelled");
  const dateObj = parseDateInput(dateKey);
  const heading = dateObj ? `${formatDay(dayForDate(dateObj))} ${dateObj.getDate()}` : dateKey;
  const panelClass =
    variant === "mobile"
      ? "absolute left-0 right-0 top-[calc(100%+8px)] z-30 mx-1 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_18px_40px_rgba(30,27,75,0.16)]"
      : "absolute left-1/2 top-[calc(100%+8px)] z-30 w-[300px] -translate-x-1/2 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_18px_40px_rgba(30,27,75,0.16)] max-[1024px]:left-auto max-[1024px]:right-0 max-[1024px]:translate-x-0";

  const inner = (
    <>
      <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--soft)]/50 px-3 py-2">
        <p className="text-xs font-bold text-[var(--ink)]">
          {heading} · {dayEvents.length} {dayEvents.length === 1 ? "evento" : "eventos"}
        </p>
        <button
          type="button"
          aria-label="Cerrar popover"
          onClick={onClose}
          className="rounded-md p-1 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          ✕
        </button>
      </div>
      <div className="max-h-[260px] overflow-auto p-2">
        {dayEvents.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-[var(--muted)]">No hay eventos para este día.</p>
        ) : (
          <ul className="space-y-1">
            {dayEvents.map((event) => {
              const visual = eventVisuals[event.type];
              const Icon = visual.icon;
              const timeLabel = event.time ? event.time.slice(0, 5) : null;
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => onSelectEvent(event)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-[var(--soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                  >
                    <Icon aria-hidden="true" size={16} className={`shrink-0 ${visual.color}`} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--ink)]">{event.title}</span>
                    {event.subject_code ? (
                      <span className="shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--muted)]">{event.subject_code}</span>
                    ) : null}
                    {timeLabel ? <span className="shrink-0 text-xs font-medium text-[var(--muted)]">{timeLabel}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );

  if (reduced) {
    return (
      <div ref={popoverRef} role="dialog" aria-modal="false" aria-label={`Eventos del ${heading}`} className={panelClass}>
        {inner}
      </div>
    );
  }

  return (
    <motion.div
      ref={popoverRef}
      role="dialog"
      aria-modal="false"
      aria-label={`Eventos del ${heading}`}
      initial={{ opacity: 0, scale: 0.97, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: -4 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className={panelClass}
    >
      {inner}
    </motion.div>
  );
}

const eventVisuals: Record<AcademicEventType, { label: string; icon: typeof CalendarDays; color: string }> = { parcial: { label: "Parcial", icon: ClipboardCheck, color: "text-rose-500" }, entrega: { label: "Entrega", icon: BookOpenCheck, color: "text-sky-500" }, tarea: { label: "Tarea", icon: BookOpenCheck, color: "text-emerald-500" }, recuperatorio: { label: "Recuperatorio", icon: RotateCcw, color: "text-amber-500" }, exposición: { label: "Exposición", icon: Presentation, color: "text-violet-500" }, feriado: { label: "Sin clases", icon: Ban, color: "text-amber-600" }, otro: { label: "Otro", icon: CalendarDays, color: "text-[var(--accent)]" } };
function EventPreview({ events, onSelect, compact = false }: { events: AcademicEvent[]; onSelect: (event: AcademicEvent) => void; compact?: boolean }) {
  return (
    <div className={compact ? "mt-1 space-y-1" : "mt-3 space-y-1.5"}>
      {events.map((event) => {
        const visual = eventVisuals[event.type];
        const Icon = visual.icon;
        const isFeriado = event.type === "feriado";
        const hideTitle = isFeriado && event.title.trim().toLowerCase() === visual.label.toLowerCase();
        const timeLabel = event.time ? event.time.slice(0, 5) : null;
        return (
          <button
            key={event.id}
            type="button"
            title={event.title}
            aria-label={`Evento académico: ${visual.label}: ${event.title}${timeLabel ? `, ${timeLabel}` : ""}`}
            onClick={(click) => {
              click.stopPropagation();
              onSelect(event);
            }}
            onKeyDown={(key) => key.stopPropagation()}
            className="flex min-w-0 w-full max-w-full items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--surface)]/90 px-1.5 py-1 text-left text-[10px] font-semibold shadow-sm transition hover:border-[var(--accent)] focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <Icon aria-hidden="true" size={13} className={`shrink-0 ${visual.color}`} />
            <span className="shrink-0 text-[9px] uppercase tracking-wide text-[var(--muted)]">{visual.label}</span>
            {!hideTitle ? <span className="min-w-0 flex-1 truncate text-[var(--ink)]">{event.title}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
