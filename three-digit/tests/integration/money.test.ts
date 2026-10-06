import { describe, expect, it } from 'vitest';
import { Db, migrate } from '../../src/db/index.js';
import { capacityScenarios, drawMoney } from '../../src/services/reports.js';
import { seed } from '../../src/scripts/seed.js';

describe('admin money breakdown on seeded data', () => {
  const db = new Db(':memory:');
  migrate(db);
  seed(db);
  const draws = db.all<{ id: number; reference_label: string }>('SELECT id, reference_label FROM draws');
  const id = (like: string) => draws.find((d) => d.reference_label.includes(like))!.id;

  it('reserved capacity in the cap table equals paid-pending + unpaid holds for every draw', () => {
    for (const d of draws) {
      const m = drawMoney(db, d.id);
      if (d.reference_label.includes('cancelled')) continue; // voided entries keep no holds
      expect(m.reservedMinor, d.reference_label).toBe(m.heldPaidMinor + m.heldUnpaidMinor);
    }
  });

  it('Draw A: collected, approved, reserved, worst case and shortfall are distinct figures', () => {
    const m = drawMoney(db, id('Draw A'));
    expect(m.approvedStakesMinor).toBe(81 * 1000);
    expect(m.heldPaidMinor).toBe(21 * 1000);
    expect(m.receiptsMinor).toBe((81 + 21) * 1000);
    // 123 (49) + 135 (2) + 456 (30) all fit in 123456 -> 81 winners.
    expect(m.exposure).toMatchObject({ maxWinners: 81, maxPayoutMinor: 81 * 310000, worstDigitSet: '123456' });
    expect(m.shortfallMinor).toBe(81 * 310000 - 81 * 1000);
    expect(m.exposureIfHeldApproved.maxPayoutMinor).toBeGreaterThan(m.exposure.maxPayoutMinor);
  });

  it('Draw D (published 123456): actual obligation uses the real winners', () => {
    const m = drawMoney(db, id('Draw D'));
    expect(m.published?.result).toBe('123456');
    expect(m.published?.obligationMinor).toBe(m.published!.winners * 310000);
    expect(m.refundObligationsMinor).toBe(1000); // the paid-but-never-approved entry
  });

  it('illustrative scenarios match the owner examples', () => {
    const [one, full] = capacityScenarios();
    expect(one).toMatchObject({ collectedMinor: 120000, shortfallMinor: 6_200_000 - 120000 });
    expect(one.worst).toMatchObject({ maxWinners: 20, maxPayoutMinor: 6_200_000 });
    expect(full).toMatchObject({ collectedMinor: 6_000_000, shortfallMinor: 310_000_000 - 6_000_000 });
    expect(full.worst).toMatchObject({ maxWinners: 1000, maxPayoutMinor: 310_000_000 });
  });
});
