import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/lib/errors.js';
import { cancelDraw } from '../../src/services/draws.js';
import { createEntry } from '../../src/services/entries.js';
import { approvePayment, paymentForEntry, submitPayment } from '../../src/services/payments.js';
import { approvePayout, completePayout, reconciliationFlags } from '../../src/services/payouts.js';
import { completeRefund, startRefundProcessing } from '../../src/services/refunds.js';
import { publishResult, rejectResult, runMatching, submitResult } from '../../src/services/results.js';
import { runMaintenance } from '../../src/services/maintenance.js';
import { HOUR, MINUTE, createEnv, idem } from '../helpers/env.js';

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
  return 'OK';
}

/** Draw with entries in every eligibility state. */
function scenario() {
  const env = createEnv();
  const drawId = env.draw();
  const reviewer = env.user(['payment_reviewer']);
  const editor = env.user(['result_editor']);
  const pubr = env.user(['result_reviewer']);
  const admin = env.user(['admin']);
  const players = Array.from({ length: 6 }, () => env.user(['player']));
  const mk = (i: number, digits: string, paid: boolean, approve: boolean) => {
    const e = createEntry(env.as(players[i]), { drawId, digits, stakeMinor: 1000, idempotencyKey: idem() }).entry;
    if (paid) submitPayment(env.as(players[i]), e.id, { reference: `SCN${i}${digits}X`, sampleProof: '', simulateReceipt: 'on' });
    if (approve) approvePayment(env.as(reviewer), paymentForEntry(env.as(players[i]), e.id).id);
    return e.id;
  };
  const won = mk(0, '135', true, true); // wins vs 123456
  const won2 = mk(1, '531', true, true); // same combination, other player
  const lost = mk(2, '789', true, true);
  const pending = mk(3, '123', true, false); // paid, never approved -> expired at verification close
  const unpaid = mk(4, '456', false, false); // reservation timeout -> expired, no refund
  return { env, drawId, reviewer, editor, pubr, admin, players, won, won2, lost, pending, unpaid };
}

const outcome = (env: ReturnType<typeof createEnv>, entryId: number) =>
  env.db.get<{ outcome: string; prize_minor_units: number | null }>(
    `SELECT o.outcome, o.prize_minor_units FROM outcomes o JOIN result_versions rv ON rv.id = o.result_version_id AND rv.state = 'published' WHERE o.entry_id = ?`,
    entryId,
  );

describe('result workflow', () => {
  it('editor cannot self-publish; publication waits for the draw time (acceptance 9)', () => {
    const s = scenario();
    s.env.clock.advance(3 * HOUR + MINUTE); // verification closed, before draw time
    const vid = submitResult(s.env.as(s.editor), s.drawId, { result: '123456', sourceLabel: '', sourceUrl: '', correctionReason: '' });
    expect(code(() => publishResult(s.env.as(s.pubr), vid, 'on'))).toBe('PUBLISH_TOO_EARLY');
    s.env.clock.advance(HOUR);
    expect(code(() => publishResult(s.env.as(s.editor), vid, 'on'))).toBe('FORBIDDEN'); // editor lacks reviewer role
    const both = s.env.user(['result_editor', 'result_reviewer']);
    rejectResult(s.env.as(s.pubr), vid, 'Testing self review');
    const v2 = submitResult(s.env.as(both), s.drawId, { result: '123456', sourceLabel: '', sourceUrl: '', correctionReason: '' });
    expect(code(() => publishResult(s.env.as(both), v2, 'on'))).toBe('SELF_PUBLISH');
    // Admin also cannot self-publish.
    rejectResult(s.env.as(s.pubr), v2, 'Testing admin self');
    const v3 = submitResult(s.env.as(s.admin), s.drawId, { result: '123456', sourceLabel: '', sourceUrl: '', correctionReason: '' });
    expect(code(() => publishResult(s.env.as(s.admin), v3, 'on'))).toBe('SELF_PUBLISH');
    expect(publishResult(s.env.as(s.pubr), v3, 'on').alreadyPublished).toBe(false);
    expect(() => s.env.db.run('UPDATE result_versions SET reviewed_by = entered_by WHERE id = ?', v3)).toThrow(/CHECK/);
  });

  it('only approved entries win; PHP 3,100 total, not 3,110; losers 0; ineligible none (acceptance 10, 11)', () => {
    const s = scenario();
    s.env.clock.advance(4 * HOUR + MINUTE);
    const vid = submitResult(s.env.as(s.editor), s.drawId, { result: '123456', sourceLabel: '', sourceUrl: '', correctionReason: '' });
    publishResult(s.env.as(s.pubr), vid, 'on');
    expect(outcome(s.env, s.won)).toEqual({ outcome: 'won', prize_minor_units: 310000 });
    expect(outcome(s.env, s.won2)).toEqual({ outcome: 'won', prize_minor_units: 310000 });
    expect(outcome(s.env, s.lost)).toEqual({ outcome: 'lost', prize_minor_units: 0 });
    // 123 would match 123456 but the entry was never approved -> no outcome, no prize.
    expect(outcome(s.env, s.pending)).toBeUndefined();
    expect(outcome(s.env, s.unpaid)).toBeUndefined();
    expect(s.env.db.get('SELECT eligibility_status FROM entries WHERE id = ?', s.pending)).toEqual({ eligibility_status: 'expired' });
    expect(s.env.db.get<{ n: number }>(`SELECT count(*) AS n FROM refunds`)!.n).toBe(1); // only the paid-but-expired entry
    // Payout: one per entry; net gain = 3,090.
    const p = approvePayout(s.env.as(s.admin), s.won);
    expect(approvePayout(s.env.as(s.admin), s.won)).toEqual({ payoutId: p.payoutId, existed: true });
    completePayout(s.env.as(s.admin), p.payoutId);
    completePayout(s.env.as(s.admin), p.payoutId);
    const ledger = s.env.db.all<{ amount_minor_units: number }>(`SELECT amount_minor_units FROM demo_ledger WHERE kind = 'payout'`);
    expect(ledger).toEqual([{ amount_minor_units: 310000 }]);
    expect(ledger[0].amount_minor_units - 1000).toBe(309000);
    expect(code(() => approvePayout(s.env.as(s.admin), s.lost))).toBe('NOT_A_WINNER');
    expect(code(() => approvePayout(s.env.as(s.admin), s.pending))).toBe('NOT_A_WINNER');
  });

  it('corrections create a new version, keep history, recompute once and flag paid entries (acceptance 13)', () => {
    const s = scenario();
    s.env.clock.advance(4 * HOUR + MINUTE);
    const v1 = submitResult(s.env.as(s.editor), s.drawId, { result: '123456', sourceLabel: '', sourceUrl: '', correctionReason: '' });
    publishResult(s.env.as(s.pubr), v1, 'on');
    const paid = approvePayout(s.env.as(s.admin), s.won);
    completePayout(s.env.as(s.admin), paid.payoutId);
    const approvedOnly = approvePayout(s.env.as(s.admin), s.won2);
    expect(code(() => submitResult(s.env.as(s.editor), s.drawId, { result: '789012', sourceLabel: '', sourceUrl: '', correctionReason: 'short' }))).toBe('CORRECTION_REASON');
    const v2 = submitResult(s.env.as(s.editor), s.drawId, { result: '789012', sourceLabel: '', sourceUrl: '', correctionReason: 'Transcription error in the sample result' });
    publishResult(s.env.as(s.pubr), v2, 'on');
    publishResult(s.env.as(s.pubr), v2, 'on'); // retry is a no-op
    expect(s.env.db.all('SELECT version, state FROM result_versions WHERE draw_id = ? ORDER BY version', s.drawId)).toEqual([
      { version: 1, state: 'superseded' },
      { version: 2, state: 'published' },
    ]);
    // History preserved: v1 outcomes still exist; v2 outcomes computed exactly once.
    expect(s.env.db.get<{ n: number }>('SELECT count(*) AS n FROM outcomes WHERE result_version_id = ?', v1)!.n).toBe(3);
    expect(s.env.db.get<{ n: number }>('SELECT count(*) AS n FROM outcomes WHERE result_version_id = ?', v2)!.n).toBe(3);
    expect(outcome(s.env, s.won)?.outcome).toBe('lost');
    expect(outcome(s.env, s.lost)?.outcome).toBe('won');
    // No second payout for the paid entry, no debit; flagged for review.
    expect(s.env.db.get<{ n: number }>(`SELECT count(*) AS n FROM demo_ledger WHERE kind = 'payout'`)!.n).toBe(1);
    expect(s.env.db.get('SELECT state FROM payouts WHERE id = ?', paid.payoutId)).toEqual({ state: 'completed' });
    expect(s.env.db.get('SELECT state FROM payouts WHERE id = ?', approvedOnly.payoutId)).toEqual({ state: 'cancelled' });
    const flags = reconciliationFlags(s.env.as(s.admin));
    expect(flags).toHaveLength(2);
    runMaintenance(s.env.db, s.env.clock);
    expect(reconciliationFlags(s.env.as(s.admin))).toHaveLength(2);
    expect(() => s.env.db.run('DELETE FROM result_versions WHERE id = ?', v1)).toThrow(/cannot be deleted/);
  });

  it('matching resumes after interruption without duplicating outcomes (acceptance 14)', () => {
    const env = createEnv();
    const drawId = env.draw();
    const reviewer = env.user(['payment_reviewer']);
    for (let i = 0; i < 30; i++) {
      const p = env.user(['player']);
      const e = createEntry(env.as(p), { drawId, digits: i % 2 ? '135' : '790', stakeMinor: 1000, idempotencyKey: idem() }).entry;
      submitPayment(env.as(p), e.id, { reference: `RESUME${i}XX`, sampleProof: '', simulateReceipt: 'on' });
      approvePayment(env.as(reviewer), paymentForEntry(env.as(p), e.id).id);
    }
    env.clock.advance(4 * HOUR + MINUTE);
    const editor = env.user(['result_editor']);
    const pubr = env.user(['result_reviewer']);
    const vid = submitResult(env.as(editor), drawId, { result: '123456', sourceLabel: '', sourceUrl: '', correctionReason: '' });
    publishResult(env.as(pubr), vid, 'on', { matchingBatches: 0 }); // "crash" before matching
    expect(env.db.get('SELECT matching_state FROM result_versions WHERE id = ?', vid)).toEqual({ matching_state: 'processing' });
    expect(runMatching(env.db, env.clock, vid, { batchSize: 7, maxBatches: 2 })).toEqual({ processed: 14, complete: false });
    runMaintenance(env.db, env.clock); // resumes
    runMatching(env.db, env.clock, vid);
    expect(env.db.get<{ n: number; w: number }>(`SELECT count(*) AS n, sum(outcome = 'won') AS w FROM outcomes WHERE result_version_id = ?`, vid)).toEqual({ n: 30, w: 15 });
    expect(env.db.get('SELECT matching_state FROM result_versions WHERE id = ?', vid)).toEqual({ matching_state: 'complete' });
  });
});

describe('cancellation and refunds (acceptance 12)', () => {
  it('a cancelled paid draw creates one refund per received payment; unpaid entries none', () => {
    const s = scenario();
    const r1 = cancelDraw(s.env.as(s.admin), s.drawId, 'Sample source unavailable');
    const r2 = cancelDraw(s.env.as(s.admin), s.drawId, 'Sample source unavailable');
    expect(r1).toEqual({ voided: 5, refunds: 4 });
    expect(r2).toEqual({ voided: 0, refunds: 0 });
    expect(s.env.db.get<{ n: number }>('SELECT count(*) AS n FROM refunds')!.n).toBe(4);
    expect(s.env.db.get<{ n: number }>(`SELECT count(*) AS n FROM entries WHERE eligibility_status = 'voided'`)!.n).toBe(5);
    s.env.clock.advance(5 * HOUR);
    expect(code(() => submitResult(s.env.as(s.editor), s.drawId, { result: '123456', sourceLabel: '', sourceUrl: '', correctionReason: '' }))).toBe('DRAW_CANCELLED');
    // Refund completes only through a ledger transaction.
    const ref = s.env.db.get<{ id: number }>('SELECT id FROM refunds LIMIT 1')!;
    expect(code(() => completeRefund(s.env.as(s.admin), ref.id))).toBe('REFUND_STATE');
    startRefundProcessing(s.env.as(s.admin), ref.id);
    completeRefund(s.env.as(s.admin), ref.id);
    completeRefund(s.env.as(s.admin), ref.id);
    expect(s.env.db.get<{ n: number }>(`SELECT count(*) AS n FROM demo_ledger WHERE kind = 'refund'`)!.n).toBe(1);
    expect(s.env.db.get('SELECT status FROM refunds WHERE id = ?', ref.id)).toEqual({ status: 'completed' });
  });

  it('audit history and ledger are append-only', () => {
    const s = scenario();
    expect(() => s.env.db.run('DELETE FROM audit_events')).toThrow(/immutable/);
    expect(() => s.env.db.run('UPDATE audit_events SET action = ?', 'x')).toThrow(/immutable/);
    expect(() => s.env.db.run('DELETE FROM demo_ledger')).toThrow(/append-only/);
    expect(() => s.env.db.run(`UPDATE entries SET selected_digits = '999' WHERE id = ?`, s.won)).toThrow(/immutable/);
    expect(() => s.env.db.run(`UPDATE draws SET scheduled_draw_at = ? WHERE id = ?`, new Date().toISOString(), s.drawId)).toThrow(/frozen/);
  });
});
