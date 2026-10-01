// Calendar-date helpers for the admin. Dates are Moncton wall dates (YYYY-MM-DD);
// instants are converted with @/lib/time so every boundary is America/Moncton.
import { formatInTimeZone } from 'date-fns-tz';
import { TZ, monctonToUtc } from '@/lib/time';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isIsoMonth(s: unknown): s is string {
  return typeof s === 'string' && ISO_MONTH.test(s) && isIsoDate(`${s}-01`);
}

/** Pure calendar arithmetic on a YYYY-MM-DD date (no time zone involved). */
export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** Sunday on or before the date. */
export function startOfWeekIso(date: string): string {
  return addDaysIso(date, -dayOfWeek(date));
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1, 12));
  return d.toISOString().slice(0, 7);
}

/** Full weeks (Sunday → Saturday) covering the month. */
export function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const start = startOfWeekIso(first);
  const nextFirst = `${addMonths(month, 1)}-01`;
  const lastDay = addDaysIso(nextFirst, -1);
  const end = addDaysIso(startOfWeekIso(lastDay), 6);
  const out: string[] = [];
  for (let d = start; d <= end; d = addDaysIso(d, 1)) out.push(d);
  return out;
}

/** Start of a Moncton day as a UTC instant. */
export function dayStartUtc(date: string): Date {
  return monctonToUtc(date, '00:00');
}

/** [start, end) of a Moncton month as UTC instants. */
export function monthRangeUtc(month: string): { start: Date; end: Date } {
  return { start: dayStartUtc(`${month}-01`), end: dayStartUtc(`${addMonths(month, 1)}-01`) };
}

export function monthLabel(month: string): string {
  return formatInTimeZone(monctonToUtc(`${month}-01`, '12:00'), TZ, 'MMMM yyyy');
}

/** "Sat, Nov 21" */
export function dayLabel(date: string): string {
  return formatInTimeZone(monctonToUtc(date, '12:00'), TZ, 'EEE, MMM d');
}

export function dayNumber(date: string): number {
  return Number(date.slice(8, 10));
}

function parseTs(raw: string): Date | null {
  let s = raw.trim().replace(/^"|"$/g, '');
  if (!s || s === 'infinity' || s === '-infinity') return null;
  s = s.replace(' ', 'T');
  // Postgres prints offsets as +00 / -03; ISO needs +00:00.
  s = s.replace(/([+-]\d{2})$/, '$1:00');
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parses a Postgres tstzrange literal like ["2026-11-21 18:00:00+00","2026-11-22 02:00:00+00"). */
export function parseTstzRange(range: string | null | undefined): { start: Date; end: Date } | null {
  if (!range) return null;
  const m = range.trim().match(/^[[(](.*),(.*)[\])]$/);
  if (!m) return null;
  const start = parseTs(m[1]);
  const end = parseTs(m[2]);
  if (!start || !end) return null;
  return { start, end };
}

/** Postgres range literal for [start, end). */
export function tstzRangeLiteral(start: Date, end: Date): string {
  return `[${start.toISOString()},${end.toISOString()})`;
}

/** Request time in ms. Server components render once per request, so reading the clock here is intended. */
export function nowMs(): number {
  return Date.now();
}
