import type { Db } from '../db/index.js';
import { type Exposure, maxExposure } from '../domain/exposure.js';
import { GROSS_PAYOUT_MINOR, STAKE_MINOR } from '../domain/rules.js';
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

/** Money picture for one draw, kept as four separate ideas (all SIMULATED):
 *  collected payments, reserved capacity, potential payout, and a
 *  hypothetical funding shortfall. None of these is profit or a forecast. */
export interface DrawMoney {
  receiptsMinor: number; // demo-ledger receipts for this draw (includes money later refunded)
  refundObligationsMinor: number; // receipts that must go back (rejected/expired/cancelled)
  approvedStakesMinor: number; // stakes of entries eligible to win
  heldPaidMinor: number; // reserved capacity: paid, pending verification
  heldUnpaidMinor: number; // reserved capacity: awaiting payment (5-min holds)
  reservedMinor: number; // capacity table total (should equal heldPaid + heldUnpaid)
  exposure: Exposure; // worst case over every valid result, approved entries only
  exposureIfHeldApproved: Exposure; // worst case if every held reservation were approved
  shortfallMinor: number; // max(0, worst-case gross payout − approved stakes)
  published: { result: string; winners: number; obligationMinor: number; shortfallMinor: number } | null;
}

function countsFor(db: Db, drawId: number, statuses: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of db.all<{ k: string; c: number }>(
    `SELECT canonical_key AS k, count(*) AS c FROM entries WHERE draw_id = ? AND eligibility_status IN (${statuses.map(() => '?').join(',')}) GROUP BY 1`,
    drawId, ...statuses,
  )) m.set(r.k, r.c);
  return m;
}

export function drawMoney(db: Db, drawId: number): DrawMoney {
  const sumStake = (status: string) => n(db, `SELECT sum(stake_minor_units) AS v FROM entries WHERE draw_id = ? AND eligibility_status = ?`, drawId, status);
  const exposure = maxExposure(countsFor(db, drawId, ['approved']));
  const approvedStakesMinor = sumStake('approved');
  const pub = db.get<{ six_digit_result: string; id: number }>(`SELECT id, six_digit_result FROM result_versions WHERE draw_id = ? AND state = 'published'`, drawId);
  const winners = pub ? n(db, `SELECT count(*) AS v FROM outcomes WHERE result_version_id = ? AND outcome = 'won'`, pub.id) : 0;
  return {
    receiptsMinor: n(db, `SELECT sum(l.amount_minor_units) AS v FROM demo_ledger l JOIN payments p ON p.id = l.payment_id JOIN entries e ON e.id = p.entry_id WHERE l.kind = 'receipt' AND e.draw_id = ?`, drawId),
    refundObligationsMinor: n(db, `SELECT sum(r.amount_minor_units) AS v FROM refunds r JOIN payments p ON p.id = r.payment_id JOIN entries e ON e.id = p.entry_id WHERE e.draw_id = ?`, drawId),
    approvedStakesMinor,
    heldPaidMinor: sumStake('pending_verification'),
    heldUnpaidMinor: sumStake('awaiting_payment'),
    reservedMinor: n(db, `SELECT sum(reserved_minor) AS v FROM combination_capacity WHERE draw_id = ?`, drawId),
    exposure,
    exposureIfHeldApproved: maxExposure(countsFor(db, drawId, ['approved', 'pending_verification', 'awaiting_payment'])),
    shortfallMinor: Math.max(0, exposure.maxPayoutMinor - approvedStakesMinor),
    published: pub
      ? { result: pub.six_digit_result, winners, obligationMinor: winners * GROSS_PAYOUT_MINOR, shortfallMinor: Math.max(0, winners * GROSS_PAYOUT_MINOR - approvedStakesMinor) }
      : null,
  };
}

/** Illustrative scenarios across all 120 unordered combinations (not forecasts). */
export function capacityScenarios(): { label: string; perCombination: number; collectedMinor: number; worst: Exposure; shortfallMinor: number }[] {
  const all: string[] = [];
  for (let a = 0; a < 10; a++) for (let b = a + 1; b < 10; b++) for (let c = b + 1; c < 10; c++) all.push(`${a}${b}${c}`);
  return [
    { label: 'One ₱10 entry on every combination', perCombination: 1 },
    { label: 'Every combination filled to the ₱500 cap', perCombination: 50 },
  ].map((s) => {
    const worst = maxExposure(new Map(all.map((k) => [k, s.perCombination])));
    const collectedMinor = all.length * s.perCombination * STAKE_MINOR;
    return { ...s, collectedMinor, worst, shortfallMinor: Math.max(0, worst.maxPayoutMinor - collectedMinor) };
  });
}

export interface DrawHealth {
  draw: DrawWithPhase;
  counts: Record<string, number>;
  money: DrawMoney;
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
      money: drawMoney(db, draw.id),
    }));
}
