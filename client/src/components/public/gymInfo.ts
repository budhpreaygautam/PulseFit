import { ClassCategory } from '../../types/index.js';
import { GYM_TIMEZONE } from '../../lib/format.js';

// Facts about the gym that every public page repeats. Keep them here so the copy cannot drift.

export const GYM_NAME = 'PulseFit Athletics';
export const GYM_ADDRESS = 'Plot 42, Sector 29, near Cyber Hub, Gurugram, Haryana 122002';
export const GYM_PHONE_DISPLAY = '+91 98110 78573';
export const GYM_PHONE_TEL = '+919811078573';
export const GYM_EMAIL = 'contact@pulsefit.in';

export const OPEN_HOUR = 6;
export const CLOSE_HOUR = 22;
export const HOURS_DAYS = 'Mon – Sat';
export const HOURS_TIME = '6:00 am – 10:00 pm';
export const HOURS_SUMMARY = `${HOURS_DAYS}, ${HOURS_TIME} · Sunday closed`;

export const CATEGORIES: ClassCategory[] = ['Workout & Strength', 'Zumba & Cardio'];

/** Whether the gym is open right now, at gym time (IST), whatever the device's timezone. */
export function isGymOpenNow(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: GYM_TIMEZONE, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday')?.value;
  const hour = Number(parts.find(p => p.type === 'hour')?.value);
  return weekday !== 'Sun' && hour >= OPEN_HOUR && hour < CLOSE_HOUR;
}

/** 0 = Sunday … 6 = Saturday for a YYYY-MM-DD calendar date. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The Monday on or before a YYYY-MM-DD date. */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
