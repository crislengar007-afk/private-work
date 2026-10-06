import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/lib/errors.js';
import { capacityView } from '../../src/services/capacity.js';
import { createEntry, getOwnEntry } from '../../src/services/entries.js';
import { runMaintenance } from '../../src/services/maintenance.js';
import { approvePayment, paymentForEntry, rejectPayment, submitPayment } from '../../src/services/payments.js';
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

function setup() {
  const env = createEnv();
  const drawId = env.draw();
  const player = env.user(['player']);
  const reviewer = env.user(['payment_reviewer']);
  return { env, drawId, player, reviewer };
}

const pay = (env: ReturnType<typeof createEnv>, player: number, entryId: number, ref = `REF${entryId}X${Math.random().toString(36).slice(2, 8).toUpperCase()}`) =>
  submitPayment(env.as(player), entryId, { reference: ref, sampleProof: 'on', simulateReceipt: 'on' });

describe('entry creation', () => {
  it('accepts 012 with leading zero and creates a held reservation + unpaid payment', () => {
    const { env, drawId, player } = setup();
    const { entry } = createEntry(env.as(player), { drawId, digits: '012', stakeMinor: 1000, idempotencyKey: idem() });
    expect(entry.selected_digits).toBe('012');
    expect(entry.canonical_key).toBe('012');
    expect(entry.eligibility_status).toBe('awaiting_payment');
    expect(entry.reservation_state).toBe('held');
    expect(entry.reservation_expires_at).toBe(new Date(env.clock.now().getTime() + 5 * MINUTE).toISOString());
    expect(paymentForEntry(env.as(player), entry.id).state).toBe('unpaid');
    expect(capacityView(env.db, drawId, '012').reservedMinor).toBe(1000);
  });

  it.each(['112', '555', '101', 'abc', '12', '1234'])('server rejects %s', (digits) => {
    const { env, drawId, player } = setup();
    expect(code(() => createEntry(env.as(player), { drawId, digits, stakeMinor: 1000, idempotencyKey: idem() }))).toBe('INVALID_DIGITS');
  });

  it('database CHECK constraints also reject repeated digits', () => {
    const { env } = setup();
    expect(() => env.db.run(`UPDATE entries SET selected_digits = '112'`)).not.toThrow(); // no rows yet
    expect(() =>
      env.db.run(`INSERT INTO entries (public_ref, user_id, draw_id, selected_digits, canonical_key, stake_minor_units, eligibility_status, rule_version_id, idempotency_key, reservation_state, submitted_at, created_at, updated_at)
        VALUES ('X', 1, 1, '112', '112', 1000, 'awaiting_payment', 1, 'k', 'held', 'a', 'a', 'a')`),
    ).toThrow(/CHECK/);
  });

  it('rejects unsupported stake amounts server-side (acceptance 11)', () => {
    const { env, drawId, player } = setup();
    for (const stake of [2000, 500, 0, -1000, '1000.5', 'abc']) {
      expect(code(() => createEntry(env.as(player), { drawId, digits: '123', stakeMinor: stake, idempotencyKey: idem() }))).toBe('UNSUPPORTED_STAKE');
    }
  });

  it('blocks the same combination in a different order for the same player, but allows another player (acceptance 3)', () => {
    const { env, drawId, player } = setup();
    const other = env.user(['player']);
    createEntry(env.as(player), { drawId, digits: '135', stakeMinor: 1000, idempotencyKey: idem() });
    expect(code(() => createEntry(env.as(player), { drawId, digits: '531', stakeMinor: 1000, idempotencyKey: idem() }))).toBe('DUPLICATE_COMBINATION');
    expect(code(() => createEntry(env.as(other), { drawId, digits: '531', stakeMinor: 1000, idempotencyKey: idem() }))).toBe('OK');
  });

  it('after rejection, a new attempt gets a fresh entry (never revived)', () => {
    const { env, drawId, player, reviewer } = setup();
    const { entry } = createEntry(env.as(player), { drawId, digits: '135', stakeMinor: 1000, idempotencyKey: idem() });
    rejectPayment(env.as(reviewer), paymentForEntry(env.as(player), entry.id).id, 'No payment arrived');
    const again = createEntry(env.as(player), { drawId, digits: '351', stakeMinor: 1000, idempotencyKey: idem() });
    expect(again.entry.id).not.toBe(entry.id);
    expect(again.entry.public_ref).not.toBe(entry.public_ref);
  });

  it('idempotent retry with the same key returns the same entry and consumes capacity once (acceptance 21)', () => {
    const { env, drawId, player } = setup();
    const key = idem();
    const a = createEntry(env.as(player), { drawId, digits: '246', stakeMinor: 1000, idempotencyKey: key });
    const b = createEntry(env.as(player), { drawId, digits: '246', stakeMinor: 1000, idempotencyKey: key });
    expect(b.replayed).toBe(true);
    expect(b.entry.id).toBe(a.entry.id);
    expect(capacityView(env.db, drawId, '246').usedMinor).toBe(1000);
    expect(env.db.get<{ n: number }>('SELECT count(*) AS n FROM entries')!.n).toBe(1);
  });

  it('players cannot read another player’s entry (acceptance 8)', () => {
    const { env, drawId, player } = setup();
    const other = env.user(['player']);
    const { entry } = createEntry(env.as(player), { drawId, digits: '135', stakeMinor: 1000, idempotencyKey: idem() });
    expect(code(() => getOwnEntry(env.as(other), entry.id))).toBe('NOT_FOUND');
    expect(code(() => submitPayment(env.as(other), entry.id, { reference: 'ABCDEF123', sampleProof: '', simulateReceipt: 'on' }))).toBe('NOT_FOUND');
  });

  it('players cannot call admin operations', () => {
    const { env, drawId, player } = setup();
    const other = env.user(['player']);
    const { entry } = createEntry(env.as(player), { drawId, digits: '135', stakeMinor: 1000, idempotencyKey: idem() });
    pay(env, player, entry.id);
    const pid = paymentForEntry(env.as(player), entry.id).id;
    expect(code(() => approvePayment(env.as(other), pid))).toBe('FORBIDDEN');
    expect(code(() => approvePayment(env.as(player), pid))).toBe('FORBIDDEN');
  });
});

describe('cutoffs (acceptance 4, 5, 15)', () => {
  it('rejects entry creation and payment at the exact submission cutoff', () => {
    const { env, drawId, player } = setup();
    const { entry } = createEntry(env.as(player), { drawId, digits: '135', stakeMinor: 1000, idempotencyKey: idem() });
    const d = env.db.get<{ submission_closes_at: string }>('SELECT submission_closes_at FROM draws WHERE id = ?', drawId)!;
    env.clock.set(d.submission_closes_at);
    expect(code(() => createEntry(env.as(player), { drawId, digits: '246', stakeMinor: 1000, idempotencyKey: idem() }))).toBe('SUBMISSION_CLOSED');
    // The reservation was capped at the cutoff too, so the entry is now expired.
    expect(code(() => pay(env, player, entry.id))).toBe('ENTRY_NOT_PAYABLE');
  });

  it('reservation is shortened to the submission cutoff when that is sooner', () => {
    const env = createEnv();
    const drawId = env.draw({ submissionIn: 2 * MINUTE });
    const player = env.user(['player']);
    const { entry } = createEntry(env.as(player), { drawId, digits: '135', stakeMinor: 1000, idempotencyKey: idem() });
    expect(entry.reservation_expires_at).toBe(new Date(env.clock.now().getTime() + 2 * MINUTE).toISOString());
  });

  it('approval at the exact verification cutoff is rejected; earlier approval succeeds', () => {
    const { env, drawId, player, reviewer } = setup();
    const a = createEntry(env.as(player), { drawId, digits: '135', stakeMinor: 1000, idempotencyKey: idem() }).entry;
    const b = createEntry(env.as(player), { drawId, digits: '246', stakeMinor: 1000, idempotencyKey: idem() }).entry;
    pay(env, player, a.id);
    pay(env, player, b.id);
    const pa = paymentForEntry(env.as(player), a.id).id;
    const pb = paymentForEntry(env.as(player), b.id).id;
    env.clock.advance(2 * HOUR + 30 * MINUTE); // submission closed, verification open
    expect(approvePayment(env.as(reviewer), pa).alreadyApproved).toBe(false);
    expect(getOwnEntry(env.as(player), a.id).eligibility_status).toBe('approved');
    const d = env.db.get<{ verification_closes_at: string }>('SELECT verification_closes_at FROM draws WHERE id = ?', drawId)!;
    env.clock.set(d.verification_closes_at);
    // Scheduler has NOT run; the request-time guard expires the entry, and approval fails.
    expect(code(() => approvePayment(env.as(reviewer), pb))).toBe('NOT_PENDING');
    expect(getOwnEntry(env.as(player), b.id).eligibility_status).toBe('expired');
  });

  it('approval 1ms before the verification cutoff still succeeds', () => {
    const { env, drawId, player, reviewer } = setup();
    const a = createEntry(env.as(player), { drawId, digits: '135', stakeMinor: 1000, idempotencyKey: idem() }).entry;
    pay(env, player, a.id);
    const d = env.db.get<{ verification_closes_at: string }>('SELECT verification_closes_at FROM draws WHERE id = ?', drawId)!;
    env.clock.set(new Date(new Date(d.verification_closes_at).getTime() - 1).toISOString());
    // 1ms before the cutoff works...
    expect(code(() => approvePayment(env.as(reviewer), paymentForEntry(env.as(player), a.id).id))).toBe('OK');
  });

  it('a late approval cannot revive an expired entry; funds go to a refund obligation', () => {
    const { env, drawId, player, reviewer } = setup();
    const a = createEntry(env.as(player), { drawId, digits: '135', stakeMinor: 1000, idempotencyKey: idem() }).entry;
    pay(env, player, a.id);
    env.clock.advance(3 * HOUR + MINUTE);
    runMaintenance(env.db, env.clock);
    const pid = paymentForEntry(env.as(player), a.id).id;
    expect(getOwnEntry(env.as(player), a.id).eligibility_status).toBe('expired');
    expect(code(() => approvePayment(env.as(reviewer), pid))).toBe('NOT_PENDING');
    expect(env.db.get<{ status: string; reason: string }>('SELECT status, reason FROM refunds WHERE payment_id = ?', pid)).toEqual({ status: 'required', reason: 'entry_expired' });
    expect(capacityView(env.db, drawId, '135').usedMinor).toBe(0);
  });
});

describe('payment verification integrity (acceptance 6, 7, 23)', () => {
  it('an unverified proof (no ledger receipt) cannot approve and does not prolong the reservation', () => {
    const { env, drawId, player, reviewer } = setup();
    const e = createEntry(env.as(player), { drawId, digits: '135', stakeMinor: 1000, idempotencyKey: idem() }).entry;
    const r = submitPayment(env.as(player), e.id, { reference: 'FAKEPROOF1', sampleProof: 'on', simulateReceipt: '' });
    expect(r.received).toBe(false);
    const after = getOwnEntry(env.as(player), e.id);
    expect(after.eligibility_status).toBe('awaiting_payment');
    expect(after.reservation_expires_at).toBe(e.reservation_expires_at);
    const pid = paymentForEntry(env.as(player), e.id).id;
    expect(code(() => approvePayment(env.as(reviewer), pid))).toBe('NOT_PENDING');
    // Reservation timeout then expires it; no funds -> no refund.
    env.clock.advance(5 * MINUTE);
    runMaintenance(env.db, env.clock);
    expect(getOwnEntry(env.as(player), e.id).eligibility_status).toBe('expired');
    expect(env.db.get('SELECT 1 FROM refunds WHERE payment_id = ?', pid)).toBeUndefined();
    // A late payment cannot restore the slot.
    expect(code(() => submitPayment(env.as(player), e.id, { reference: 'FAKEPROOF1', sampleProof: '', simulateReceipt: 'on' }))).toBe('ENTRY_NOT_PAYABLE');
    expect(capacityView(env.db, drawId, '135').usedMinor).toBe(0);
  });

  it('reusing a payment reference across entries fails', () => {
    const { env, drawId, player } = setup();
    const other = env.user(['player']);
    const a = createEntry(env.as(player), { drawId, digits: '135', stakeMinor: 1000, idempotencyKey: idem() }).entry;
    const b = createEntry(env.as(other), { drawId, digits: '246', stakeMinor: 1000, idempotencyKey: idem() }).entry;
    pay(env, player, a.id, 'SAME-REF-001');
    expect(code(() => pay(env, other, b.id, 'same ref 001'))).toBe('REFERENCE_USED');
  });

  it('duplicate clicks and competing reviewers yield one approval and one ledger effect', () => {
    const { env, drawId, player, reviewer } = setup();
    const reviewer2 = env.user(['payment_reviewer']);
    const e = createEntry(env.as(player), { drawId, digits: '135', stakeMinor: 1000, idempotencyKey: idem() }).entry;
    pay(env, player, e.id);
    pay(env, player, e.id); // duplicate payment submit: no second receipt
    const pid = paymentForEntry(env.as(player), e.id).id;
    expect(approvePayment(env.as(reviewer), pid).alreadyApproved).toBe(false);
    expect(approvePayment(env.as(reviewer2), pid).alreadyApproved).toBe(true);
    expect(approvePayment(env.as(reviewer), pid).alreadyApproved).toBe(true);
    expect(env.db.get<{ n: number }>(`SELECT count(*) AS n FROM demo_ledger WHERE payment_id = ?`, pid)!.n).toBe(1);
    expect(env.db.get<{ n: number }>(`SELECT count(*) AS n FROM audit_events WHERE action = 'payment.approved'`)!.n).toBe(1);
    expect(capacityView(env.db, drawId, '135')).toMatchObject({ reservedMinor: 0, approvedMinor: 1000, usedMinor: 1000 });
  });

  it('a reviewer cannot approve their own entry', () => {
    const env = createEnv();
    const drawId = env.draw();
    const both = env.user(['player', 'payment_reviewer']);
    const e = createEntry(env.as(both), { drawId, digits: '135', stakeMinor: 1000, idempotencyKey: idem() }).entry;
    pay(env, both, e.id);
    expect(code(() => approvePayment(env.as(both), paymentForEntry(env.as(both), e.id).id))).toBe('SELF_REVIEW');
  });

  it('paid rejection releases capacity once and creates one refund; unpaid rejection creates none', () => {
    const { env, drawId, player, reviewer } = setup();
    const a = createEntry(env.as(player), { drawId, digits: '135', stakeMinor: 1000, idempotencyKey: idem() }).entry;
    const b = createEntry(env.as(player), { drawId, digits: '246', stakeMinor: 1000, idempotencyKey: idem() }).entry;
    pay(env, player, a.id);
    const pa = paymentForEntry(env.as(player), a.id).id;
    const pb = paymentForEntry(env.as(player), b.id).id;
    rejectPayment(env.as(reviewer), pa, 'Reference mismatch');
    rejectPayment(env.as(reviewer), pa, 'Reference mismatch'); // retry
    rejectPayment(env.as(reviewer), pb, 'Never paid at all');
    expect(capacityView(env.db, drawId, '135').usedMinor).toBe(0);
    expect(capacityView(env.db, drawId, '246').usedMinor).toBe(0);
    expect(env.db.get<{ n: number }>('SELECT count(*) AS n FROM refunds')!.n).toBe(1);
    expect(env.db.get<{ payment_id: number }>('SELECT payment_id FROM refunds')!.payment_id).toBe(pa);
  });
});
