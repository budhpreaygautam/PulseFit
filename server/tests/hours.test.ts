import { describe, expect, it } from 'vitest';
import {
  addOpenDays,
  closedForTheDay,
  isOpenAt,
  isOpenDay,
  nextOpenDay,
  openDaysBetween,
  previousOpenDay,
  withinOpeningHours
} from '../src/lib/hours.js';

// 2026-10-10 is a Saturday, 2026-10-11 a Sunday, 2026-10-12 a Monday. IST = UTC+05:30.
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);

describe('opening hours', () => {
  it('knows the gym is closed on Sundays', () => {
    expect(isOpenDay('2026-10-10')).toBe(true);
    expect(isOpenDay('2026-10-11')).toBe(false);
    expect(isOpenDay('2026-10-12')).toBe(true);
  });

  it('is open from 06:00 up to, not including, 22:00 gym time', () => {
    expect(isOpenAt(ist('2026-10-12', '05:59'))).toBe(false);
    expect(isOpenAt(ist('2026-10-12', '06:00'))).toBe(true);
    expect(isOpenAt(ist('2026-10-12', '21:59'))).toBe(true);
    expect(isOpenAt(ist('2026-10-12', '22:00'))).toBe(false);
    expect(isOpenAt(ist('2026-10-11', '10:00'))).toBe(false);
  });

  it('is closed for the day after closing time and all of Sunday, but not before opening', () => {
    expect(closedForTheDay(ist('2026-10-12', '05:00'))).toBe(false);
    expect(closedForTheDay(ist('2026-10-12', '21:59'))).toBe(false);
    expect(closedForTheDay(ist('2026-10-12', '22:00'))).toBe(true);
    expect(closedForTheDay(ist('2026-10-11', '07:00'))).toBe(true);
  });

  it('accepts weekly slots only on open days inside opening hours', () => {
    expect(withinOpeningHours(1, '06:00', '07:00')).toBe(true);
    expect(withinOpeningHours(6, '21:00', '22:00')).toBe(true);
    expect(withinOpeningHours(0, '10:00', '11:00')).toBe(false);
    expect(withinOpeningHours(1, '05:30', '06:30')).toBe(false);
    expect(withinOpeningHours(1, '21:30', '22:30')).toBe(false);
    expect(withinOpeningHours(1, '10:00', '09:00')).toBe(false);
  });

  it('steps over Sundays', () => {
    expect(previousOpenDay('2026-10-12')).toBe('2026-10-10');
    expect(previousOpenDay('2026-10-10')).toBe('2026-10-09');
    expect(nextOpenDay('2026-10-10')).toBe('2026-10-12');
    expect(addOpenDays('2026-10-09', 2)).toBe('2026-10-12');
    expect(addOpenDays('2026-10-11', 1)).toBe('2026-10-12');
    expect(addOpenDays('2026-10-09', 0)).toBe('2026-10-09');
  });

  it('counts open days strictly between two dates', () => {
    expect(openDaysBetween('2026-10-12', '2026-10-13')).toBe(0);
    expect(openDaysBetween('2026-10-12', '2026-10-14')).toBe(1);
    // Saturday to Monday: only the Sunday lies between, and it is closed.
    expect(openDaysBetween('2026-10-10', '2026-10-12')).toBe(0);
    // Monday to the next Monday: Tuesday-Saturday.
    expect(openDaysBetween('2026-10-12', '2026-10-19')).toBe(5);
    expect(openDaysBetween('2026-10-14', '2026-10-12')).toBe(0);
  });
});
