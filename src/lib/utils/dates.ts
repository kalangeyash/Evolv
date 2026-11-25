import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { ISODate } from "@/lib/db/types";

/** Weeks start on Monday throughout EVOLV (ISO-8601, common in India). */
export const WEEK_OPTIONS = { weekStartsOn: 1 as const };

export function toISODate(d: Date): ISODate {
  return format(d, "yyyy-MM-dd");
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

/** Parse "yyyy-MM-dd" as a *local* date (never UTC-shifted). */
export function fromISODate(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISO(s);
  return isValid(d) && toISODate(d) === s;
}

export function shiftDate(s: ISODate, days: number): ISODate {
  return toISODate(addDays(fromISODate(s), days));
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return differenceInCalendarDays(fromISODate(b), fromISODate(a));
}

export function dateRange(start: ISODate, end: ISODate): ISODate[] {
  if (start > end) return [];
  return eachDayOfInterval({
    start: fromISODate(start),
    end: fromISODate(end),
  }).map(toISODate);
}

export function weekBounds(s: ISODate): { start: ISODate; end: ISODate } {
  const d = fromISODate(s);
  return {
    start: toISODate(startOfWeek(d, WEEK_OPTIONS)),
    end: toISODate(endOfWeek(d, WEEK_OPTIONS)),
  };
}

export function monthBounds(s: ISODate): { start: ISODate; end: ISODate } {
  const d = fromISODate(s);
  return {
    start: toISODate(startOfMonth(d)),
    end: toISODate(endOfMonth(d)),
  };
}

export function weekKey(s: ISODate): ISODate {
  return weekBounds(s).start;
}

export function monthKey(s: ISODate): string {
  return s.slice(0, 7);
}

export function formatDay(s: ISODate, pattern = "EEE, d MMM yyyy"): string {
  return format(fromISODate(s), pattern);
}

export function formatTime12(t: string | null): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Whole years between dob and `on`. */
export function ageOn(dob: ISODate, on: ISODate): number {
  const b = fromISODate(dob);
  const o = fromISODate(on);
  let age = o.getFullYear() - b.getFullYear();
  const m = o.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && o.getDate() < b.getDate())) age--;
  return age;
}
