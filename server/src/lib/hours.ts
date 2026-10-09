import config from '../config.js';
import { addDays, dayOfWeek, gymDateTime, gymToday } from './dates.js';
import { ApiError, forbidden } from './http.js';

// The gym's opening hours, in gym time: Monday to Saturday 06:00-22:00, closed on Sundays.
// Calendar rules (no classes or trials on a closed day, streaks step over closed days) always
// apply. Clock rules (no check-in, floor clock-in or same-day trial while the gym is shut) apply
// only when config.enforceOpeningHours is on, so automated tests can run at any hour.

export const OPENS_AT = '06:00';
export const CLOSES_AT = '22:00';
/** Days of the week (0 = Sunday) the gym is closed. */
export const CLOSED_WEEKDAYS: readonly number[] = [0];

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export function isOpenWeekday(day_of_week: number): boolean {
  return !CLOSED_WEEKDAYS.includes(day_of_week);
}

/** Whether the gym opens at all on a 'YYYY-MM-DD' date. */
export function isOpenDay(date: string): boolean {
  return isOpenWeekday(dayOfWeek(date));
}

/** Whether the gym is open at an instant. */
export function isOpenAt(now: Date = new Date()): boolean {
  const today = gymToday(now);
  if (!isOpenDay(today)) return false;
  const t = now.getTime();
  return t >= gymDateTime(today, OPENS_AT).getTime() && t < gymDateTime(today, CLOSES_AT).getTime();
}

/**
 * Members (and free-trial visitors) cannot come in or start a floor session while the gym is shut.
 * A clock rule, so it applies only when config.enforceOpeningHours is on; staff are never refused.
 */
export function gymClosedNow(now: Date = new Date()): boolean {
  return config.enforceOpeningHours && !isOpenAt(now);
}

export function gymClosedError(data?: unknown): ApiError {
  return forbidden(
    `The gym is closed right now. Opening hours are Monday to Saturday, ${OPENS_AT} to ${CLOSES_AT}.`,
    'GYM_CLOSED',
    data
  );
}

/** Whether the gym has already closed for the day at an instant (also true all day on a closed day). */
export function closedForTheDay(now: Date = new Date()): boolean {
  const today = gymToday(now);
  return !isOpenDay(today) || now.getTime() >= gymDateTime(today, CLOSES_AT).getTime();
}

/** Whether a weekly slot ('HH:MM' to 'HH:MM') falls on an open day and inside opening hours. */
export function withinOpeningHours(day_of_week: number, start_time: string, end_time: string): boolean {
  if (!isOpenWeekday(day_of_week)) return false;
  const start = toMinutes(start_time);
  const end = toMinutes(end_time);
  return start >= toMinutes(OPENS_AT) && end <= toMinutes(CLOSES_AT) && start < end;
}

/** The last open day before a date (Monday's is Saturday). */
export function previousOpenDay(date: string): string {
  let d = addDays(date, -1);
  while (!isOpenDay(d)) d = addDays(d, -1);
  return d;
}

/** The first open day after a date (Saturday's is Monday). */
export function nextOpenDay(date: string): string {
  let d = addDays(date, 1);
  while (!isOpenDay(d)) d = addDays(d, 1);
  return d;
}

/** Open days strictly between two dates (neither end counts). */
export function openDaysBetween(from: string, to: string): number {
  let count = 0;
  for (let d = addDays(from, 1); d < to; d = addDays(d, 1)) if (isOpenDay(d)) count++;
  return count;
}

/** A date moved forward by a number of open days, stepping over closed days. */
export function addOpenDays(date: string, days: number): string {
  let d = date;
  for (let i = 0; i < days; i++) d = nextOpenDay(d);
  return d;
}

/** Opening hours as published in GET /api/config. */
export function publicOpeningHours() {
  return {
    opensAt: OPENS_AT,
    closesAt: CLOSES_AT,
    closedWeekdays: [...CLOSED_WEEKDAYS],
    enforced: config.enforceOpeningHours
  };
}
