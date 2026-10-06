import type { Db } from '../db/index.js';
import type { Clock } from '../lib/clock.js';
import { audit } from './audit.js';
import { releaseReservation } from './capacity.js';
import { createRefundObligation } from './refunds.js';
import { runMatching } from './results.js';

interface DueRow {
  id: number;
  draw_id: number;
  canonical_key: string;
  stake_minor_units: number;
  eligibility_status: string;
  reservation_expires_at: string | null;
  submission_closes_at: string;
  verification_closes_at: string;
  payment_id: number;
}

const DUE_SELECT = `SELECT e.id, e.draw_id, e.canonical_key, e.stake_minor_units, e.eligibility_status, e.reservation_expires_at,
  d.submission_closes_at, d.verification_closes_at, p.id AS payment_id
  FROM entries e JOIN draws d ON d.id = e.draw_id JOIN payments p ON p.entry_id = e.id`;

function isDue(e: DueRow, at: string): 'reservation_timeout' | 'verification_closed' | null {
  if (e.eligibility_status === 'awaiting_payment' && ((e.reservation_expires_at !== null && e.reservation_expires_at <= at) || e.submission_closes_at <= at)) {
    return 'reservation_timeout';
  }
  if (e.eligibility_status === 'pending_verification' && e.verification_closes_at <= at) return 'verification_closed';
  return null;
}

/** Idempotent: re-checks inside the transaction and only transitions from an
 *  active, unapproved state. Funds received -> refund obligation; none -> no refund. */
function expireOne(db: Db, entryId: number, at: string, requestId: string | null): boolean {
  return db.tx(() => {
    const e = db.get<DueRow>(`${DUE_SELECT} WHERE e.id = ?`, entryId);
    if (!e) return false;
    const why = isDue(e, at);
    if (!why) return false;
    const r = db.run(
      `UPDATE entries SET eligibility_status = 'expired', expired_at = ?, updated_at = ? WHERE id = ? AND eligibility_status IN ('awaiting_payment','pending_verification')`,
      at, at, e.id,
    );
    if (r.changes !== 1) return false;
    releaseReservation(db, e, at, null, requestId);
    createRefundObligation(db, e.payment_id, 'entry_expired', at, null, requestId);
    audit(db, { actorId: null, action: 'entry.expired', entityType: 'entry', entityId: e.id, before: { status: e.eligibility_status }, after: { status: 'expired', reason: why }, requestId, at });
    return true;
  });
}

/** Request-time guard: lets a request act on correct state even if the
 *  periodic job has not run (scheduler failure cannot allow late actions). */
export function expireEntryIfDue(db: Db, clock: Clock, entryId: number): boolean {
  return expireOne(db, entryId, clock.now().toISOString(), null);
}

export function expireDueEntries(db: Db, clock: Clock, drawId?: number): number {
  const at = clock.now().toISOString();
  const rows = db.all<{ id: number }>(
    `SELECT e.id FROM entries e JOIN draws d ON d.id = e.draw_id
     WHERE ((e.eligibility_status = 'awaiting_payment' AND (e.reservation_expires_at <= ? OR d.submission_closes_at <= ?))
         OR (e.eligibility_status = 'pending_verification' AND d.verification_closes_at <= ?))
       ${drawId ? 'AND e.draw_id = ?' : ''}`,
    at, at, at, ...(drawId ? [drawId] : []),
  );
  let n = 0;
  for (const r of rows) if (expireOne(db, r.id, at, null)) n++;
  return n;
}

/** Request-time guard for capacity: before a combination's capacity is read or
 *  reserved, expire any of ITS reservations that are already past due, so a
 *  stalled background job can never keep a dead reservation occupying the cap. */
export function expireDueForCombination(db: Db, at: string, drawId: number, canonical: string): number {
  const rows = db.all<{ id: number }>(
    `SELECT e.id FROM entries e JOIN draws d ON d.id = e.draw_id
     WHERE e.draw_id = ? AND e.canonical_key = ?
       AND ((e.eligibility_status = 'awaiting_payment' AND (e.reservation_expires_at <= ? OR d.submission_closes_at <= ?))
         OR (e.eligibility_status = 'pending_verification' AND d.verification_closes_at <= ?))`,
    drawId, canonical, at, at, at,
  );
  let n = 0;
  for (const r of rows) if (expireOne(db, r.id, at, null)) n++;
  return n;
}

/** Periodic job: expiry plus resuming any interrupted matching run. */
export function runMaintenance(db: Db, clock: Clock): { expired: number; matched: number } {
  const expired = expireDueEntries(db, clock);
  let matched = 0;
  for (const v of db.all<{ id: number }>(`SELECT id FROM result_versions WHERE state = 'published' AND matching_state <> 'complete'`)) {
    matched += runMatching(db, clock, v.id).processed;
  }
  return { expired, matched };
}
