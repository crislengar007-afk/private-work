import type { Db } from '../db/index.js';
import { type Exposure, maxExposure } from '../domain/exposure.js';
import { GROSS_PAYOUT_MINOR } from '../domain/rules.js';
import { type DrawWithPhase, listDraws } from './draws.js';

export interface DashboardFigures {
  pendingReview: number;
  pendingClaims: number;
  awaitingPayment: number;
  approvedEntries: number;
  receiptsMinor: number;
  approvedStakesMinor: number;
  refundsOutstandingMinor: number;
  refundsOutstandingCount: number;
  refundsCompletedMinor: number;
  prizeObligationsMinor: number;
  winners: number;
  payoutsCompletedMinor: number;
  openFlags: number;
  pendingResults: number;
}

const n = (db: Db, sql: string, ...p: (string | number)[]) => db.get<{ v: number | null }>(sql, ...p)?.v ?? 0;

/** All figures are SIMULATED and labelled as such in the UI. Receipts are not profit. */
export function dashboardFigures(db: Db): DashboardFigures {
  return {
    pendingReview: n(db, `SELECT count(*) AS v FROM entries WHERE eligibility_status = 'pending_verification'`),
    pendingClaims: n(db, `SELECT count(*) AS v FROM payments p JOIN entries e ON e.id = p.entry_id WHERE p.state = 'submitted' AND p.trusted_received_at IS NULL AND e.eligibility_status = 'awaiting_payment'`),
    awaitingPayment: n(db, `SELECT count(*) AS v FROM entries WHERE eligibility_status = 'awaiting_payment'`),
    approvedEntries: n(db, `SELECT count(*) AS v FROM entries WHERE eligibility_status = 'approved'`),
    receiptsMinor: n(db, `SELECT sum(amount_minor_units) AS v FROM demo_ledger WHERE kind = 'receipt'`),
    approvedStakesMinor: n(db, `SELECT sum(stake_minor_units) AS v FROM entries WHERE eligibility_status = 'approved'`),
    refundsOutstandingMinor: n(db, `SELECT sum(amount_minor_units) AS v FROM refunds WHERE status <> 'completed'`),
    refundsOutstandingCount: n(db, `SELECT count(*) AS v FROM refunds WHERE status <> 'completed'`),
    refundsCompletedMinor: n(db, `SELECT sum(amount_minor_units) AS v FROM demo_ledger WHERE kind = 'refund'`),
    prizeObligationsMinor: n(db, `SELECT count(*) AS v FROM outcomes o JOIN result_versions rv ON rv.id = o.result_version_id WHERE rv.state = 'published' AND o.outcome = 'won'`) * GROSS_PAYOUT_MINOR,
    winners: n(db, `SELECT count(*) AS v FROM outcomes o JOIN result_versions rv ON rv.id = o.result_version_id WHERE rv.state = 'published' AND o.outcome = 'won'`),
    payoutsCompletedMinor: n(db, `SELECT sum(amount_minor_units) AS v FROM demo_ledger WHERE kind = 'payout'`),
    openFlags: n(db, `SELECT count(*) AS v FROM reconciliation_flags WHERE status = 'open'`),
    pendingResults: n(db, `SELECT count(*) AS v FROM result_versions WHERE state = 'submitted'`),
  };
}

export function drawExposure(db: Db, drawId: number): Exposure {
  const counts = new Map<string, number>();
  for (const r of db.all<{ k: string; c: number }>(`SELECT canonical_key AS k, count(*) AS c FROM entries WHERE draw_id = ? AND eligibility_status = 'approved' GROUP BY 1`, drawId)) {
    counts.set(r.k, r.c);
  }
  return maxExposure(counts);
}

export interface DrawHealth {
  draw: DrawWithPhase;
  counts: Record<string, number>;
  receiptsMinor: number;
  exposure: Exposure;
}

export function drawStatusCounts(db: Db, drawId: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of db.all<{ s: string; c: number }>('SELECT eligibility_status AS s, count(*) AS c FROM entries WHERE draw_id = ? GROUP BY 1', drawId)) out[r.s] = r.c;
  return out;
}

export function drawHealth(db: Db, now: Date): DrawHealth[] {
  return listDraws(db, now)
    .filter((d) => d.phase !== 'cancelled')
    .slice(0, 8)
    .map((draw) => ({
      draw,
      counts: drawStatusCounts(db, draw.id),
      receiptsMinor: n(db, `SELECT sum(l.amount_minor_units) AS v FROM demo_ledger l JOIN payments p ON p.id = l.payment_id JOIN entries e ON e.id = p.entry_id WHERE l.kind = 'receipt' AND e.draw_id = ?`, draw.id),
      exposure: drawExposure(db, draw.id),
    }));
}
