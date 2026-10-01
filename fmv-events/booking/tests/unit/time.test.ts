import { describe, expect, it } from 'vitest';
import { durationHours, eventPeriodUtc, formatWallTime, generateSlots, monctonToday, monctonToUtc } from '@/lib/time';
import { formatPhone, normalizePhone } from '@/lib/phone';

describe('America/Moncton time', () => {
  it('converts wall time to UTC across DST', () => {
    // Summer: ADT = UTC-3
    expect(monctonToUtc('2026-07-01', '14:00').toISOString()).toBe('2026-07-01T17:00:00.000Z');
    // Winter: AST = UTC-4
    expect(monctonToUtc('2026-12-12', '14:00').toISOString()).toBe('2026-12-12T18:00:00.000Z');
  });

  it('handles events that run past midnight', () => {
    const p = eventPeriodUtc('2026-08-15', '20:00', '01:00');
    expect(p.start.toISOString()).toBe('2026-08-15T23:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-08-16T04:00:00.000Z');
    expect(durationHours('20:00', '01:00')).toBe(5);
  });

  it("knows today's date in Moncton, not UTC", () => {
    // 02:30 UTC on Oct 2 is still Oct 1 (23:30 ADT) in Moncton.
    expect(monctonToday(new Date('2026-10-02T02:30:00Z'))).toBe('2026-10-01');
  });

  it('formats wall times', () => {
    expect(formatWallTime('14:30')).toBe('2:30 PM');
    expect(formatWallTime('00:05:00')).toBe('12:05 AM');
  });

  it('generates mini-session slots that fit the window', () => {
    const slots = generateSlots({ dates: ['2026-11-21', '2026-11-21', '2026-11-22'], windowStart: '10:00', windowEnd: '11:00', intervalMin: 20, durationMin: 15 });
    expect(slots).toHaveLength(6); // 10:00, 10:20, 10:40 on two dates (dupes removed)
    expect(slots[0]).toEqual({ starts_at: '2026-11-21T14:00:00.000Z', ends_at: '2026-11-21T14:15:00.000Z' });
    const tight = generateSlots({ dates: ['2026-11-21'], windowStart: '10:00', windowEnd: '10:30', intervalMin: 20, durationMin: 20 });
    expect(tight).toHaveLength(1);
  });
});

describe('phone numbers (E.164, region CA)', () => {
  it('normalizes local formats', () => {
    expect(normalizePhone('506-471-4367')).toBe('+15064714367');
    expect(normalizePhone('(506) 471 6367')).toBe('+15064716367');
    expect(normalizePhone('+1 506 471 4367')).toBe('+15064714367');
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });
  it('formats for display', () => {
    expect(formatPhone('+15064714367')).toBe('506-471-4367');
  });
});
