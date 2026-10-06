import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/lib/errors.js';
import { capacityView } from '../../src/services/capacity.js';
import { createEntry, getOwnEntry } from '../../src/services/entries.js';
import { runMaintenance } from '../../src/services/maintenance.js';
import { approvePayment, paymentForEntry, rejectPayment, submitPayment } from '../../src/services/payments.js';
import { publishResult, submitResult } from '../../src/services/results.js';
import { approvePayout, completePayout } from '../../src/services/payouts.js';
import { HOUR, MINUTE, createEnv, idem } from '../helpers/env.js';

const PERMS = ['123', '132', '213', '231', '312', '321'];

function err(fn: () => unknown): DomainError | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof DomainError) return e;
    throw e;
  }
}

/** Fill a combination with `n` entries from distinct players (one active entry per player). */
function fill(env: ReturnType<typeof createEnv>, drawId: number, n: number, approve: boolean) {
  const reviewer = env.user(['payment_reviewer']);
  const ids: { player: number; entry: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p = env.user(['player']);
    const e = createEntry(env.as(p), { drawId, digits: PERMS[i % 6], stakeMinor: 1000, idempotencyKey: idem() }).entry;
    if (approve) {
      submitPayment(env.as(p), e.id, { reference: `FILL${drawId}N${i}X`, sampleProof: '', simulateReceipt: 'on' });
      approvePayment(env.as(reviewer), paymentForEntry(env.as(p), e.id).id);
    }
    ids.push({ player: p, entry: e.id });
  }
  return { reviewer, ids };
}

describe('₱500 combination cap (SPEC §17)', () => {
  it('stores cents: stake 1000, cap 50000, gross prize 310000 (acceptance 26)', () => {
    const env = createEnv();
    const drawId = env.draw();
    const p = env.user(['player']);
    createEntry(env.as(p), { drawId, digits: '123', stakeMinor: 1000, idempotencyKey: idem() });
    expect(env.db.get('SELECT cap_minor, reserved_minor FROM combination_capacity')).toEqual({ cap_minor: 50000, reserved_minor: 1000 });
    expect(env.db.get('SELECT stake_minor, gross_payout_minor, combination_cap_minor, includes_stake FROM rule_versions')).toEqual({ stake_minor: 1000, gross_payout_minor: 310000, combination_cap_minor: 50000, includes_stake: 1 });
  });

  it('at ₱490 one reservation succeeds; the next fails with the limit message and no payment row (acceptance 17)', () => {
    const env = createEnv();
    const drawId = env.draw();
    fill(env, drawId, 49, true);
    expect(capacityView(env.db, drawId, '123')).toMatchObject({ usedMinor: 49000, availableMinor: 1000 });
    const a = env.user(['player']);
    const b = env.user(['player']);
    expect(err(() => createEntry(env.as(a), { drawId, digits: '321', stakeMinor: 1000, idempotencyKey: idem() }))).toBeNull();
    const paymentsBefore = env.db.get<{ n: number }>('SELECT count(*) AS n FROM payments')!.n;
    const e = err(() => createEntry(env.as(b), { drawId, digits: '213', stakeMinor: 1000, idempotencyKey: idem() }));
    expect(e?.code).toBe('CAPACITY_FULL');
    expect(e?.message).toContain('already reached the ₱500 limit');
    expect(e?.message).toContain('Naabot na ng combination na ito ang ₱500 limit');
    expect(env.db.get<{ n: number }>('SELECT count(*) AS n FROM payments')!.n).toBe(paymentsBefore);
    expect(capacityView(env.db, drawId, '123').usedMinor).toBe(50000);
  });

  it('at ₱500 every permutation is blocked for every player (acceptance 18)', () => {
    const env = createEnv();
    const drawId = env.draw();
    fill(env, drawId, 50, false);
    for (const perm of PERMS) {
      const p = env.user(['player']);
      expect(err(() => createEntry(env.as(p), { drawId, digits: perm, stakeMinor: 1000, idempotencyKey: idem() }))?.code).toBe('CAPACITY_FULL');
    }
  });

  it('different combinations and other draws have independent capacity (acceptance 20)', () => {
    const env = createEnv();
    const d1 = env.draw();
    const d2 = env.draw();
    fill(env, d1, 50, false);
    const p = env.user(['player']);
    expect(err(() => createEntry(env.as(p), { drawId: d1, digits: '124', stakeMinor: 1000, idempotencyKey: idem() }))).toBeNull();
    expect(err(() => createEntry(env.as(p), { drawId: d2, digits: '123', stakeMinor: 1000, idempotencyKey: idem() }))).toBeNull();
  });

  it('approval converts reserved to approved without double counting; timeout releases once (acceptance 22)', () => {
    const env = createEnv();
    const drawId = env.draw();
    const { ids } = fill(env, drawId, 3, true);
    expect(capacityView(env.db, drawId, '123')).toMatchObject({ reservedMinor: 0, approvedMinor: 3000 });
    const p = env.user(['player']);
    createEntry(env.as(p), { drawId, digits: '123', stakeMinor: 1000, idempotencyKey: idem() });
    expect(capacityView(env.db, drawId, '123')).toMatchObject({ reservedMinor: 1000, approvedMinor: 3000 });
    env.clock.advance(5 * MINUTE);
    runMaintenance(env.db, env.clock);
    runMaintenance(env.db, env.clock);
    expect(capacityView(env.db, drawId, '123')).toMatchObject({ reservedMinor: 0, approvedMinor: 3000 });
    // Expiring/rejecting cannot release another entry's allocation.
    expect(ids.every((x) => getOwnEntry(env.as(x.player), x.entry).reservation_state === 'converted')).toBe(true);
  });

  it('stale availability is rejected server-side without creating an entry or payment (acceptance 24)', () => {
    const env = createEnv();
    const drawId = env.draw();
    fill(env, drawId, 49, false);
    const a = env.user(['player']);
    const b = env.user(['player']);
    // Both players "saw" ₱10 available. A confirms first.
    createEntry(env.as(a), { drawId, digits: '123', stakeMinor: 1000, idempotencyKey: idem() });
    const before = env.db.get<{ e: number; p: number }>('SELECT (SELECT count(*) FROM entries) AS e, (SELECT count(*) FROM payments) AS p')!;
    expect(err(() => createEntry(env.as(b), { drawId, digits: '132', stakeMinor: 1000, idempotencyKey: idem() }))?.code).toBe('CAPACITY_FULL');
    expect(env.db.get('SELECT (SELECT count(*) FROM entries) AS e, (SELECT count(*) FROM payments) AS p')).toEqual(before);
  });

  it('capacity released after cutoff does not reopen submission; settled wins keep their allocation (acceptance 25)', () => {
    const env = createEnv();
    const drawId = env.draw();
    const { reviewer, ids } = fill(env, drawId, 49, true);
    const last = env.user(['player']);
    const e = createEntry(env.as(last), { drawId, digits: '123', stakeMinor: 1000, idempotencyKey: idem() }).entry;
    submitPayment(env.as(last), e.id, { reference: 'LASTSLOT01', sampleProof: '', simulateReceipt: 'on' });
    env.clock.advance(2 * HOUR + MINUTE); // past submission cutoff
    rejectPayment(env.as(reviewer), paymentForEntry(env.as(last), e.id).id, 'Mismatched sender');
    expect(capacityView(env.db, drawId, '123').availableMinor).toBe(1000);
    const late = env.user(['player']);
    expect(err(() => createEntry(env.as(late), { drawId, digits: '123', stakeMinor: 1000, idempotencyKey: idem() }))?.code).toBe('SUBMISSION_CLOSED');
    // Publish a winning result and settle a payout: allocation stays.
    env.clock.advance(2 * HOUR);
    const editor = env.user(['result_editor']);
    const pubr = env.user(['result_reviewer']);
    const vid = submitResult(env.as(editor), drawId, { result: '123456', sourceLabel: '', sourceUrl: '', correctionReason: '' });
    publishResult(env.as(pubr), vid, 'on');
    const admin = env.user(['admin']);
    const po = approvePayout(env.as(admin), ids[0].entry);
    completePayout(env.as(admin), po.payoutId);
    expect(capacityView(env.db, drawId, '123')).toMatchObject({ approvedMinor: 49000, reservedMinor: 0 });
  });

  it('the database refuses to exceed the cap even if application checks were bypassed', () => {
    const env = createEnv();
    const drawId = env.draw();
    fill(env, drawId, 50, false);
    expect(() => env.db.run(`UPDATE combination_capacity SET reserved_minor = reserved_minor + 1000 WHERE draw_id = ?`, drawId)).toThrow(/CHECK/);
  });
});
