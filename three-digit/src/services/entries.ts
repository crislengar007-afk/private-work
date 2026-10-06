import type { Db } from '../db/index.js';
import { canonicalKey, validateSelection } from '../domain/digits.js';
import { STAKE_MINOR } from '../domain/rules.js';
import { DomainError, NotFoundError, isConstraintError } from '../lib/errors.js';
import { entryRef } from '../lib/ids.js';
import { audit } from './audit.js';
import { capacityView, reserveCapacity } from './capacity.js';
import { type Ctx, requireAny } from './context.js';
import { assertAcceptingEntries, getDraw, getRule } from './draws.js';
import { expireEntryIfDue } from './maintenance.js';

export type EligibilityStatus = 'awaiting_payment' | 'pending_verification' | 'approved' | 'rejected' | 'expired' | 'voided';
export const ACTIVE_STATUSES: EligibilityStatus[] = ['awaiting_payment', 'pending_verification', 'approved'];
export const ALL_STATUSES: EligibilityStatus[] = ['awaiting_payment', 'pending_verification', 'approved', 'rejected', 'expired', 'voided'];

export interface EntryRow {
  id: number;
  public_ref: string;
  user_id: number;
  draw_id: number;
  selected_digits: string;
  canonical_key: string;
  stake_minor_units: number;
  eligibility_status: EligibilityStatus;
  rule_version_id: number;
  idempotency_key: string;
  reservation_state: 'held' | 'converted' | 'released';
  reservation_expires_at: string | null;
  team_id: number | null;
  agent_id: number | null;
  submitted_at: string;
  approved_at: string | null;
  reviewer_id: number | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  expired_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEntryInput {
  drawId: number;
  digits: unknown;
  stakeMinor: unknown;
  idempotencyKey: unknown;
}

/** SPEC §11/§17: validates auth, draw/time, rules, amount, uniqueness and
 *  idempotency, and atomically reserves capacity. Reservation, entry creation
 *  and idempotency registration commit or roll back together. */
export function createEntry(ctx: Ctx, input: CreateEntryInput): { entry: EntryRow; replayed: boolean } {
  const actor = requireAny(ctx, ['player']);
  const idem = typeof input.idempotencyKey === 'string' ? input.idempotencyKey : '';
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(idem)) {
    throw new DomainError('BAD_REQUEST_KEY', 'This form has expired. Please review your entry again before confirming.');
  }
  try {
    return ctx.db.tx(() => {
      const now = ctx.clock.now();
      const at = now.toISOString();
      const prior = ctx.db.get<EntryRow>('SELECT * FROM entries WHERE user_id = ? AND idempotency_key = ?', actor.id, idem);
      if (prior) {
        if (prior.draw_id !== input.drawId || prior.selected_digits !== input.digits) {
          throw new DomainError('REQUEST_KEY_REUSED', 'This confirmation was already used for a different selection. Please review again.', 409);
        }
        return { entry: prior, replayed: true };
      }
      const sel = validateSelection(input.digits);
      if (!sel.ok) throw new DomainError('INVALID_DIGITS', sel.error);
      const stake = typeof input.stakeMinor === 'number' ? input.stakeMinor : Number(input.stakeMinor);
      if (stake !== STAKE_MINOR) {
        throw new DomainError('UNSUPPORTED_STAKE', 'Only the fixed ₱10 stake is currently authorized. Other amounts are disabled until the owner confirms their rules.');
      }
      const draw = getDraw(ctx.db, input.drawId);
      if (!draw) throw new NotFoundError('That draw does not exist.');
      assertAcceptingEntries(draw, now);
      const rule = getRule(ctx.db, draw.rule_version_id);
      if (rule.stake_minor !== stake) throw new DomainError('UNSUPPORTED_STAKE', 'Stake does not match this draw’s frozen rules.');

      const dup = ctx.db.get<{ public_ref: string }>(
        `SELECT public_ref FROM entries WHERE user_id = ? AND draw_id = ? AND canonical_key = ? AND eligibility_status IN ('awaiting_payment','pending_verification','approved')`,
        actor.id, draw.id, sel.canonical,
      );
      if (dup) {
        throw new DomainError('DUPLICATE_COMBINATION', `May active entry ka na (${dup.public_ref}) para sa combination na ito sa draw na ito. ${sel.digits} counts as the same combination in any order.`, 409);
      }
      if (!reserveCapacity(ctx.db, draw.id, sel.canonical, stake, at)) {
        const cap = capacityView(ctx.db, draw.id, sel.canonical);
        throw new DomainError(
          'CAPACITY_FULL',
          cap.full
            ? 'This number combination has already reached the ₱500 limit. Please choose another combination. (Naabot na ng combination na ito ang ₱500 limit. Pumili ng ibang combination.)'
            : `Only ${cap.availableMinor / 100} pesos remain for this combination; the requested stake exceeds it.`,
          409,
          { capacity: cap },
        );
      }
      const expiresMs = Math.min(now.getTime() + rule.reservation_minutes * 60_000, new Date(draw.submission_closes_at).getTime());
      const expiresAt = new Date(expiresMs).toISOString();
      const ref = entryRef();
      const id = ctx.db.run(
        `INSERT INTO entries (public_ref, user_id, draw_id, selected_digits, canonical_key, stake_minor_units, eligibility_status, rule_version_id,
           idempotency_key, reservation_state, reservation_expires_at, submitted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'awaiting_payment', ?, ?, 'held', ?, ?, ?, ?)`,
        ref, actor.id, draw.id, sel.digits, sel.canonical, stake, rule.id, idem, expiresAt, at, at, at,
      ).lastInsertRowid;
      ctx.db.run(
        `INSERT INTO payments (entry_id, provider, expected_minor_units, state, created_at, updated_at) VALUES (?, 'demo', ?, 'unpaid', ?, ?)`,
        id, stake, at, at,
      );
      audit(ctx.db, { actorId: actor.id, action: 'entry.created', entityType: 'entry', entityId: id, after: { ref, draw_id: draw.id, digits: sel.digits, canonical: sel.canonical, stake }, requestId: ctx.requestId, at });
      audit(ctx.db, { actorId: actor.id, action: 'capacity.reserved', entityType: 'entry', entityId: id, after: { canonical: sel.canonical, amount: stake, expires_at: expiresAt }, requestId: ctx.requestId, at });
      return { entry: ctx.db.get<EntryRow>('SELECT * FROM entries WHERE id = ?', id)!, replayed: false };
    });
  } catch (err) {
    if (isConstraintError(err, 'entries.user_id, entries.draw_id, entries.canonical_key')) {
      throw new DomainError('DUPLICATE_COMBINATION', 'May active entry ka na para sa combination na ito sa draw na ito.', 409);
    }
    throw err;
  }
}

/** Player-scoped read. Another player's entry is indistinguishable from a missing one. */
export function getOwnEntry(ctx: Ctx, id: number): EntryRow {
  const actor = requireAny(ctx, ['player']);
  expireEntryIfDue(ctx.db, ctx.clock, id);
  const e = ctx.db.get<EntryRow>('SELECT * FROM entries WHERE id = ? AND user_id = ?', id, actor.id);
  if (!e) throw new NotFoundError('Entry not found.');
  return e;
}

export interface EntryListRow extends EntryRow {
  draw_label: string;
  scheduled_draw_at: string;
  payment_state: string;
  outcome: 'won' | 'lost' | null;
  prize_minor_units: number | null;
  user_email?: string;
}

const OUTCOME_JOIN = `LEFT JOIN result_versions rv ON rv.draw_id = e.draw_id AND rv.state = 'published' AND rv.matching_state = 'complete'
  LEFT JOIN outcomes o ON o.entry_id = e.id AND o.result_version_id = rv.id`;

export function listOwnEntries(ctx: Ctx, q: { drawId?: number; status?: string; search?: string }): EntryListRow[] {
  const actor = requireAny(ctx, ['player']);
  const where = ['e.user_id = ?'];
  const params: (string | number)[] = [actor.id];
  if (q.drawId) {
    where.push('e.draw_id = ?');
    params.push(q.drawId);
  }
  if (q.status && (ALL_STATUSES as string[]).includes(q.status)) {
    where.push('e.eligibility_status = ?');
    params.push(q.status);
  }
  if (q.search && /^[0-9]{1,3}$/.test(q.search)) {
    where.push(`e.selected_digits LIKE ?`);
    params.push(`%${q.search}%`);
  } else if (q.search) {
    where.push('e.public_ref LIKE ?');
    params.push(`%${q.search.toUpperCase()}%`);
  }
  return ctx.db.all<EntryListRow>(
    `SELECT e.*, d.reference_label AS draw_label, d.scheduled_draw_at, p.state AS payment_state, o.outcome, o.prize_minor_units
     FROM entries e JOIN draws d ON d.id = e.draw_id JOIN payments p ON p.entry_id = e.id ${OUTCOME_JOIN}
     WHERE ${where.join(' AND ')} ORDER BY e.id DESC LIMIT 300`,
    ...params,
  );
}

export function adminListEntries(ctx: Ctx, q: { drawId?: number; status?: string; player?: string; combination?: string }): EntryListRow[] {
  requireAny(ctx, ['admin', 'payment_reviewer']);
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (q.drawId) {
    where.push('e.draw_id = ?');
    params.push(q.drawId);
  }
  if (q.status && (ALL_STATUSES as string[]).includes(q.status)) {
    where.push('e.eligibility_status = ?');
    params.push(q.status);
  }
  if (q.player) {
    where.push('(u.email LIKE ? OR u.display_name LIKE ?)');
    params.push(`%${q.player}%`, `%${q.player}%`);
  }
  if (q.combination) {
    const sel = validateSelection(q.combination);
    // Any order of the same digits finds the same canonical bucket.
    where.push('e.canonical_key = ?');
    params.push(sel.ok ? sel.canonical : canonicalKey(q.combination.replace(/\D/g, '').slice(0, 3)));
  }
  return ctx.db.all<EntryListRow>(
    `SELECT e.*, d.reference_label AS draw_label, d.scheduled_draw_at, p.state AS payment_state, o.outcome, o.prize_minor_units, u.email AS user_email
     FROM entries e JOIN draws d ON d.id = e.draw_id JOIN payments p ON p.entry_id = e.id JOIN users u ON u.id = e.user_id ${OUTCOME_JOIN}
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.id DESC LIMIT 500`,
    ...params,
  );
}

export function entryCounts(db: Db, userId: number): Record<EligibilityStatus, number> {
  const out = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<EligibilityStatus, number>;
  for (const r of db.all<{ s: EligibilityStatus; n: number }>('SELECT eligibility_status AS s, count(*) AS n FROM entries WHERE user_id = ? GROUP BY 1', userId)) out[r.s] = r.n;
  return out;
}

