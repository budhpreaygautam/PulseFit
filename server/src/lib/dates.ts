import config from '../config.js';

// Calendar helpers in the gym's timezone (Asia/Kolkata by default).
// Dates are passed around as 'YYYY-MM-DD' strings meaning a gym-local calendar day;
// instants are ISO timestamps / Date objects. Never use toISOString().split('T')[0] for
// "today": between 00:00 and 05:30 IST that returns yesterday.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

// Building an Intl.DateTimeFormat is expensive; dashboards convert thousands of rows per request.
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
    formatters.set(timeZone, fmt);
  }
  return fmt;
}

function parts(instant: Date, timeZone = config.gymTimezone) {
  const fmt = formatterFor(timeZone);
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(instant)) out[p.type] = p.value;
  return {
    date: `${out.year}-${out.month}-${out.day}`,
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second)
  };
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

/** Gym-local calendar date of an instant. */
export function toGymDate(instant: Date | string | number): string {
  return parts(new Date(instant)).date;
}

/** Today's date at the gym. */
export function gymToday(now: Date = new Date()): string {
  return toGymDate(now);
}

/** Hour of day (0-23) of an instant, at the gym. */
export function gymHour(instant: Date | string | number): number {
  return parts(new Date(instant)).hour;
}

/** Day of week (0 = Sunday) of a 'YYYY-MM-DD' calendar date. */
export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Calendar-month arithmetic; the 31st plus one month lands on the last day of a shorter month. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const targetMonthIndex = m - 1 + months;
  const year = y + Math.floor(targetMonthIndex / 12);
  const month = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Offset of the gym timezone from UTC, in minutes, at a given instant (IST = +330). */
function offsetMinutes(instant: Date): number {
  const p = parts(instant);
  const asUtc = Date.UTC(
    Number(p.date.slice(0, 4)),
    Number(p.date.slice(5, 7)) - 1,
    Number(p.date.slice(8, 10)),
    p.hour,
    p.minute,
    p.second
  );
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** The instant a gym-local date + 'HH:MM' happens. */
export function gymDateTime(date: string, time: string): Date {
  const naiveUtc = new Date(`${date}T${time}:00Z`);
  const offset = offsetMinutes(naiveUtc);
  return new Date(naiveUtc.getTime() - offset * 60000);
}

/**
 * Date of the next occurrence of a weekly class that has not started yet.
 * A class later today counts as today; one that already started rolls to next week.
 */
export function nextOccurrence(day_of_week: number, start_time: string, now: Date = new Date()): string {
  const today = gymToday(now);
  const delta = (day_of_week - dayOfWeek(today) + 7) % 7;
  let candidate = addDays(today, delta);
  if (gymDateTime(candidate, start_time).getTime() <= now.getTime()) {
    candidate = addDays(candidate, 7);
  }
  return candidate;
}

/** Monday (gym-local) of the week containing a date. */
export function startOfWeek(date: string): string {
  const dow = dayOfWeek(date);
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

const displayFormatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** A 'YYYY-MM-DD' date as people read it in messages: '31 Oct 2026'. */
export function displayDate(date: string): string {
  return displayFormatter.format(new Date(`${date}T00:00:00Z`));
}
