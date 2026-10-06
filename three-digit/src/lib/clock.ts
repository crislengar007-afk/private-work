import type { Db } from '../db/index.js';

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Deterministic clock for tests and seeding. */
export class FixedClock implements Clock {
  private t: number;
  constructor(t: Date | string | number) {
    this.t = new Date(t).getTime();
  }
  now(): Date {
    return new Date(this.t);
  }
  set(t: Date | string | number): void {
    this.t = new Date(t).getTime();
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

export const DEMO_CLOCK_KEY = 'demo_clock_offset_ms';

/** Server-authoritative clock: real time plus a forward-only demo offset that
 *  only an administrator can increase (local demo mode). Browser time is never used. */
export class DemoClock implements Clock {
  constructor(private db: Db) {}
  offsetMs(): number {
    const row = this.db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', DEMO_CLOCK_KEY);
    const n = row ? Number(row.value) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  now(): Date {
    return new Date(Date.now() + this.offsetMs());
  }
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
