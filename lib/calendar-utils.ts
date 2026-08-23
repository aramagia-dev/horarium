import { days, formatDay as canonicalFormatDay, type Day } from "@/lib/schedule-data";

export function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addLocalDays(date: Date, amount: number) {
  const result = startOfLocalDay(date);
  result.setDate(result.getDate() + amount);
  return result;
}

export function getWeekStart(date: Date) {
  const day = startOfLocalDay(date).getDay();
  return addLocalDays(date, day === 0 ? -6 : 1 - day);
}

export function getInitialDay(date: Date): Day {
  const weekday = startOfLocalDay(date).getDay();
  return weekday >= 1 && weekday <= 5 ? days[weekday - 1] : "Monday";
}

export function dayForDate(date: Date): Day {
  const weekday = startOfLocalDay(date).getDay();
  return weekday >= 1 && weekday <= 5 ? days[weekday - 1] : "Monday";
}

export function isSameLocalDay(first: Date, second: Date) {
  return first.toDateString() === second.toDateString();
}

export function formatDay(day: Day) {
  return canonicalFormatDay(day);
}

export function formatDateInput(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? date : null;
}

export function formatWeekHeading(weekStart: Date) {
  const month = weekStart.toLocaleDateString("es-AR", { month: "long" });
  const thursday = addLocalDays(weekStart, 3);
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  const week = 1 + Math.round((thursday.getTime() - getWeekStart(firstThursday).getTime()) / (86400000 * 7));
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} · Semana ${week}`;
}

export function formatWeekRange(weekStart: Date) {
  const weekEnd = addLocalDays(weekStart, 4);
  const start = weekStart.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  const end = weekEnd.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  return `${start}–${end}`;
}

export function formatClassDate(date: Date) {
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "long", weekday: "long", year: "numeric" });
}
