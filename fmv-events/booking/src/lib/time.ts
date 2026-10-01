// All business logic runs in America/Moncton (Atlantic Time); storage is UTC timestamptz.

import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { addDays } from 'date-fns';

export const TZ = 'America/Moncton';

/** Today's date in Moncton as YYYY-MM-DD. */
export function monctonToday(now: Date = new Date()): string {
  return formatInTimeZone(now, TZ, 'yyyy-MM-dd');
}

/** Converts a Moncton wall-clock date + time ("2026-11-21", "14:30") to a UTC Date. */
export function monctonToUtc(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time.length === 5 ? `${time}:00` : time}`, TZ);
}

/** Event start/end in UTC. An end at or before the start runs past midnight (same rule as the DB). */
export function eventPeriodUtc(date: string, start: string, end: string): { start: Date; end: Date } {
  const s = monctonToUtc(date, start);
  let e = monctonToUtc(date, end);
  if (e <= s) {
    const next = formatInTimeZone(addDays(toZonedTime(s, TZ), 1), TZ, 'yyyy-MM-dd');
    e = monctonToUtc(next, end);
  }
  return { start: s, end: e };
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? monctonToUtc(date, '12:00') : new Date(date);
  return formatInTimeZone(d, TZ, 'EEEE, MMMM d, yyyy');
}

export function formatShortDate(date: string | Date): string {
  const d = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? monctonToUtc(date, '12:00') : new Date(date);
  return formatInTimeZone(d, TZ, 'MMM d, yyyy');
}

export function formatDateTime(ts: string | Date): string {
  return formatInTimeZone(new Date(ts), TZ, "EEE, MMM d, yyyy 'at' h:mm a");
}

export function formatTime(ts: string | Date): string {
  return formatInTimeZone(new Date(ts), TZ, 'h:mm a');
}

/** "14:30" or "14:30:00" -> "2:30 PM" */
export function formatWallTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Moncton date (YYYY-MM-DD) of a timestamp. */
export function monctonDateOf(ts: string | Date): string {
  return formatInTimeZone(new Date(ts), TZ, 'yyyy-MM-dd');
}

/** Hours between two wall times on the same event (handles past-midnight). */
export function durationHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

/**
 * Generates mini-session slot start/end times (UTC) for the given Moncton dates,
 * between windowStart and windowEnd, every intervalMin, each lasting durationMin.
 * A slot must finish by windowEnd.
 */
export function generateSlots(opts: {
  dates: string[];
  windowStart: string;
  windowEnd: string;
  intervalMin: number;
  durationMin: number;
}): { starts_at: string; ends_at: string }[] {
  const out: { starts_at: string; ends_at: string }[] = [];
  if (opts.intervalMin <= 0 || opts.durationMin <= 0) return out;
  const [ws_h, ws_m] = opts.windowStart.split(':').map(Number);
  const [we_h, we_m] = opts.windowEnd.split(':').map(Number);
  const startMin = ws_h * 60 + ws_m;
  const endMin = we_h * 60 + we_m;
  for (const date of [...new Set(opts.dates)].sort()) {
    for (let t = startMin; t + opts.durationMin <= endMin; t += opts.intervalMin) {
      const hh = String(Math.floor(t / 60)).padStart(2, '0');
      const mm = String(t % 60).padStart(2, '0');
      const s = monctonToUtc(date, `${hh}:${mm}`);
      const e = new Date(s.getTime() + opts.durationMin * 60_000);
      out.push({ starts_at: s.toISOString(), ends_at: e.toISOString() });
    }
  }
  return out;
}
