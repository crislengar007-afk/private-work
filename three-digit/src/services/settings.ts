import type { Db } from '../db/index.js';
import { DEMO_CLOCK_KEY, DAY, MINUTE } from '../lib/clock.js';
import { DomainError } from '../lib/errors.js';
import { audit } from './audit.js';
import { type Ctx, requireAny } from './context.js';

/** Draft-only demo configuration. None of these change frozen rules or open
 *  draws; they are notes for owner review. */
export const DRAFT_SETTINGS = [
  { key: 'draft_reservation_minutes', label: 'Proposed reservation window (minutes) for a future rule version', type: 'number', min: 1, max: 60 },
  { key: 'draft_reserve_threshold_php', label: 'Proposed prize reserve threshold (PHP) — unconfirmed', type: 'number', min: 0, max: 100000000 },
  { key: 'draft_operator_notes', label: 'Operator notes for owner review', type: 'text', min: 0, max: 2000 },
] as const;

export const LAUNCH_REQUIREMENTS = [
  'Exact external lottery product, official result source and draw timetable',
  'Cutoff policy approval (separate submission and verification cutoffs)',
  'Additional stake tiers, if any, and their payout rules',
  'Repeat-entry policy (one active entry per player per combination is a demo default)',
  'Per-draw scope of the ₱500 combination cap (assumed per draw)',
  'Reservation window length (5 minutes is a proposed default)',
  'Funding / prize reserve limits and exposure review (payout is 310× the stake)',
  'Refund policy and processing time',
  'Eligibility and age rules',
  'Operator authorization / licensing',
  'Payment-provider authorization and integration',
  'Privacy and data-retention policy',
  'Agent selling/collection powers, player attribution, commissions and historical reassignment policy',
  'Operational, security and legal review',
];

export function getSetting(db: Db, key: string): string | null {
  return db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? null;
}

export function saveDraftSettings(ctx: Ctx, input: Record<string, unknown>): void {
  const actor = requireAny(ctx, ['admin']);
  ctx.db.tx(() => {
    const at = ctx.clock.now().toISOString();
    for (const s of DRAFT_SETTINGS) {
      const raw = typeof input[s.key] === 'string' ? String(input[s.key]).trim() : '';
      if (raw === '') continue;
      if (s.type === 'number') {
        const v = Number(raw);
        if (!Number.isInteger(v) || v < s.min || v > s.max) throw new DomainError('INVALID_SETTING', `${s.label}: enter a whole number between ${s.min} and ${s.max}.`);
      } else if (raw.length > s.max) throw new DomainError('INVALID_SETTING', `${s.label}: too long.`);
      const before = getSetting(ctx.db, s.key);
      if (before === raw) continue;
      ctx.db.run('INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at', s.key, raw, actor.id, at);
      audit(ctx.db, { actorId: actor.id, action: 'settings.draft_updated', entityType: 'setting', entityId: s.key, before: { value: before }, after: { value: raw }, requestId: ctx.requestId, at });
    }
  });
}

/** Local demo only: move the server clock FORWARD. Never backward, so a passed
 *  cutoff can never be reopened. */
export function advanceDemoClock(ctx: Ctx, minutesInput: unknown, enabled: boolean): void {
  const actor = requireAny(ctx, ['admin']);
  if (!enabled) throw new DomainError('CLOCK_DISABLED', 'Demo clock controls are disabled in this environment.', 403);
  const minutes = Number(minutesInput);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes * MINUTE > 7 * DAY) throw new DomainError('INVALID_MINUTES', 'Advance by 1 minute to 7 days.');
  ctx.db.tx(() => {
    const at = ctx.clock.now().toISOString();
    const before = Number(getSetting(ctx.db, DEMO_CLOCK_KEY) ?? 0);
    const after = Math.max(0, before) + minutes * MINUTE;
    ctx.db.run('INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at', DEMO_CLOCK_KEY, String(after), actor.id, at);
    audit(ctx.db, { actorId: actor.id, action: 'demo_clock.advanced', entityType: 'setting', entityId: DEMO_CLOCK_KEY, before: { offset_ms: before }, after: { offset_ms: after, minutes }, requestId: ctx.requestId, at });
  });
}
