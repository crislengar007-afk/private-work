/**
 * Seeds clearly labelled SAMPLE data with dates RELATIVE to now.
 * All data is created through the same service functions the app uses (with a
 * controllable clock), so every invariant, ledger row and audit event is real.
 */
import bcrypt from 'bcryptjs';
import { loadConfig } from '../config.js';
import { Db, openDatabase } from '../db/index.js';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../demo-accounts.js';
import { DAY, FixedClock, HOUR, MINUTE } from '../lib/clock.js';
import { toManilaInput } from '../lib/format.js';
import { demoPaymentRef, randomToken } from '../lib/ids.js';
import type { Ctx, Role } from '../services/context.js';
import { cancelDraw, createDraftDraw, openDraw } from '../services/draws.js';
import { createEntry } from '../services/entries.js';
import { runMaintenance } from '../services/maintenance.js';
import { approvePayment, paymentForEntry, rejectPayment, submitPayment } from '../services/payments.js';
import { approvePayout, completePayout } from '../services/payouts.js';
import { completeRefund, failRefund, startRefundProcessing } from '../services/refunds.js';
import { publishResult, submitResult } from '../services/results.js';
import { adminUpdateTicket, createTicket } from '../services/support.js';
import { assignAgent, createTeam } from '../services/teams.js';
import { insertUser, getUser, toActor } from '../services/users.js';
import { assertSafeLocalDatabase } from './guard.js';

export function seed(db: Db, nowMs = Date.now()): void {
  if (db.get('SELECT 1 FROM users LIMIT 1')) throw new Error('Database already has data. Use `npm run db:reset` to start over.');
  const N = Math.floor(nowMs / MINUTE) * MINUTE;
  const clock = new FixedClock(N);
  const at = (offset: number) => {
    clock.set(N + offset);
  };
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const ids: Record<string, number> = {};
  const created = new Date(N - 7 * DAY).toISOString();
  for (const a of DEMO_ACCOUNTS) ids[a.email] = insertUser(db, { email: a.email, displayName: a.name, passwordHash: hash, roles: [...a.roles] as Role[], grantedBy: null, at: created });
  const fillers: number[] = [];
  for (let i = 1; i <= 50; i++) {
    const n = String(i).padStart(2, '0');
    fillers.push(insertUser(db, { email: `sample${n}@demo.local`, displayName: `Sample Player ${n}`, passwordHash: hash, roles: ['player'], grantedBy: null, at: created }));
  }
  const as = (email: string | number): Ctx => {
    const id = typeof email === 'number' ? email : ids[email];
    return { db, clock, actor: toActor(db, getUser(db, id)!), requestId: 'seed' };
  };
  const ADMIN = 'admin@demo.local';
  const PAY = 'payments@demo.local';
  const EDIT = 'editor@demo.local';
  const REV = 'reviewer@demo.local';
  const JUAN = 'juan@demo.local';
  const MARIA = 'maria@demo.local';
  const PEDRO = 'pedro@demo.local';

  const draw = (label: string, opens: number, sub: number, ver: number, drawAt: number, open = true) => {
    at(Math.min(opens, 0) - 30 * MINUTE);
    const iso = (o: number) => toManilaInput(new Date(N + o).toISOString());
    const id = createDraftDraw(as(ADMIN), { reference_label: label, opens_at: iso(opens), submission_closes_at: iso(sub), verification_closes_at: iso(ver), scheduled_draw_at: iso(drawAt) });
    if (open) openDraw(as(ADMIN), id);
    return id;
  };

  interface Plan {
    pay?: number;
    claimOnly?: number;
    approve?: number;
    reject?: [number, string];
  }
  const entry = (who: string | number, drawId: number, digits: string, t: number, p: Plan = {}) => {
    at(t);
    const e = createEntry(as(who), { drawId, digits, stakeMinor: 1000, idempotencyKey: randomToken(18) }).entry;
    if (p.claimOnly !== undefined) {
      at(p.claimOnly);
      submitPayment(as(who), e.id, { reference: demoPaymentRef(), sampleProof: 'on', simulateReceipt: '' });
    }
    if (p.pay !== undefined) {
      at(p.pay);
      submitPayment(as(who), e.id, { reference: demoPaymentRef(), sampleProof: Math.random() < 0.5 ? 'on' : '', simulateReceipt: 'on' });
    }
    const pid = paymentForEntry(as(who), e.id).id;
    if (p.approve !== undefined) {
      at(p.approve);
      approvePayment(as(PAY), pid);
    }
    if (p.reject) {
      at(p.reject[0]);
      rejectPayment(as(PAY), pid, p.reject[1]);
    }
    return { id: e.id, paymentId: pid };
  };
  const paid = (t: number, approve?: number): Plan => ({ pay: t + MINUTE, approve });
  const PERMS = ['123', '132', '213', '231', '312', '321'];

  // ---- E: Published, then corrected (oldest) ------------------------------------------
  const E = draw('Sample Draw E — published & corrected', -5 * DAY, -4 * DAY - 4 * HOUR, -4 * DAY - 2 * HOUR, -4 * DAY);
  const tE = -5 * DAY + HOUR;
  const eJuan = entry(JUAN, E, '012', tE, paid(tE, tE + 2 * HOUR));
  const eMaria = entry(MARIA, E, '349', tE, paid(tE, tE + 2 * HOUR));
  entry(PEDRO, E, '567', tE, paid(tE, tE + 2 * HOUR));
  at(-4 * DAY + 10 * MINUTE);
  const e1 = submitResult(as(EDIT), E, { result: '012349', sourceLabel: '', sourceUrl: '', correctionReason: '' });
  at(-4 * DAY + 20 * MINUTE);
  publishResult(as(REV), e1, 'on');
  at(-4 * DAY + HOUR);
  completePayout(as(PAY), approvePayout(as(PAY), eJuan.id).payoutId);
  completePayout(as(PAY), approvePayout(as(PAY), eMaria.id).payoutId);
  at(-3 * DAY);
  const e2 = submitResult(as(EDIT), E, { result: '001234', sourceLabel: '', sourceUrl: '', correctionReason: 'Sample transcription error: the last digit was keyed as 9 and the first digits were shifted.' });
  at(-3 * DAY + 10 * MINUTE);
  publishResult(as(REV), e2, 'on');

  // ---- D: Published -------------------------------------------------------------------
  const D = draw('Sample Draw D — published', -3 * DAY, -2 * DAY - 4 * HOUR, -2 * DAY - 2 * HOUR, -2 * DAY);
  const tD = -3 * DAY + HOUR;
  const dJuan = entry(JUAN, D, '135', tD, paid(tD, tD + HOUR));
  entry(MARIA, D, '789', tD, paid(tD, tD + HOUR));
  const dPedro = entry(PEDRO, D, '123', tD, paid(tD, tD + HOUR));
  entry(JUAN, D, '024', tD, paid(tD)); // paid but never approved -> expires, refund
  for (let i = 0; i < 6; i++) entry(fillers[i], D, ['531', '246', '019', '357', '468', '120'][i], tD, paid(tD, tD + HOUR));
  at(-2 * DAY + 10 * MINUTE);
  const d1 = submitResult(as(EDIT), D, { result: '123456', sourceLabel: '', sourceUrl: '', correctionReason: '' });
  at(-2 * DAY + 20 * MINUTE);
  publishResult(as(REV), d1, 'on');
  at(-2 * DAY + HOUR);
  completePayout(as(PAY), approvePayout(as(PAY), dJuan.id).payoutId);
  approvePayout(as(PAY), dPedro.id);

  // ---- F: Cancelled -------------------------------------------------------------------
  const F = draw('Sample Draw F — cancelled', -DAY, DAY, DAY + HOUR, DAY + 2 * HOUR);
  const tF = -20 * HOUR;
  entry(JUAN, F, '135', tF, paid(tF, tF + HOUR));
  entry(MARIA, F, '246', tF, paid(tF));
  entry(PEDRO, F, '357', -HOUR - 2 * MINUTE); // unpaid at cancellation -> voided, no refund
  at(-HOUR);
  cancelDraw(as(ADMIN), F, 'Sample result source unavailable for this demo draw');
  const fRefund = db.get<{ id: number }>(`SELECT r.id FROM refunds r JOIN payments p ON p.id = r.payment_id JOIN entries e ON e.id = p.entry_id WHERE e.draw_id = ? AND e.user_id = ?`, F, ids[JUAN])!;
  at(-50 * MINUTE);
  startRefundProcessing(as(PAY), fRefund.id);
  completeRefund(as(PAY), fRefund.id);

  // ---- C: Awaiting result -------------------------------------------------------------
  const C = draw('Sample Draw C — awaiting result', -2 * DAY, -8 * HOUR, -6 * HOUR, -HOUR);
  const tC = -10 * HOUR;
  entry(JUAN, C, '135', tC, paid(tC, tC + HOUR));
  entry(MARIA, C, '789', tC, paid(tC, tC + HOUR));
  entry(PEDRO, C, '012', tC, paid(tC, tC + HOUR));
  entry(JUAN, C, '468', tC, paid(tC)); // pending -> expired at verification close (refund required)
  const cRej = entry(MARIA, C, '579', tC, { pay: tC + MINUTE, reject: [tC + 30 * MINUTE, 'Sender name did not match the account (sample)'] });
  entry(PEDRO, C, '246', tC); // never paid -> expired, no refund
  for (let i = 0; i < 10; i++) entry(fillers[i], C, PERMS[i % 6], tC, paid(tC, tC + 2 * HOUR));
  const cRefund = db.get<{ id: number }>('SELECT id FROM refunds WHERE payment_id = ?', cRej.paymentId)!;
  at(-5 * HOUR);
  startRefundProcessing(as(PAY), cRefund.id);
  failRefund(as(PAY), cRefund.id, 'Simulated provider timeout — retry needed');

  // ---- B: Submission closed, verification still open ---------------------------------
  const B = draw('Sample Draw B — verification only', -DAY, -30 * MINUTE, 3 * HOUR, 4 * HOUR);
  const tB = -2 * HOUR;
  entry(JUAN, B, '147', tB, paid(tB));
  entry(MARIA, B, '258', tB, paid(tB));
  entry(PEDRO, B, '369', tB, paid(tB, tB + 30 * MINUTE));
  entry(JUAN, B, '901', tB, { claimOnly: tB + MINUTE }); // proof-only: expires, no refund
  for (let i = 10; i < 16; i++) entry(fillers[i], B, ['147', '258', '036', '159', '480', '237'][i - 10], tB, paid(tB));

  // ---- A: Open ------------------------------------------------------------------------------
  const A = draw('Sample Draw A — open', -3 * HOUR, 2 * DAY, 2 * DAY + 2 * HOUR, 2 * DAY + 4 * HOUR);
  const tA = -2 * HOUR;
  entry(JUAN, A, '135', tA, paid(tA, tA + 30 * MINUTE));
  entry(JUAN, A, '246', tA, paid(tA)); // pending verification
  entry(MARIA, A, '531', tA, paid(tA, tA + 30 * MINUTE)); // same combination, different player
  // Combination 1-2-3 at ₱490 (49 entries): exactly ₱10 left.
  for (let i = 0; i < 49; i++) entry(fillers[i], A, PERMS[i % 6], tA, paid(tA, tA + 30 * MINUTE));
  // Combination 4-5-6 full at ₱500: 30 approved + 20 pending verification.
  for (let i = 0; i < 50; i++) entry(fillers[i], A, ['456', '654', '546', '465', '564', '645'][i % 6], tA + 5 * MINUTE, paid(tA + 5 * MINUTE, i < 30 ? tA + 40 * MINUTE : undefined));
  entry(PEDRO, A, '789', -MINUTE); // awaiting payment, reservation still running at seed time
  entry(MARIA, A, '908', -MINUTE, { claimOnly: -MINUTE }); // proof submitted without a ledger receipt

  // ---- G: Draft ----------------------------------------------------------------------------
  draw('Sample Draw G — draft for next week', 6 * DAY, 7 * DAY, 7 * DAY + HOUR, 7 * DAY + 2 * HOUR, false);

  // ---- support -----------------------------------------------------------------------------
  at(-3 * HOUR);
  const juanC = db.get<{ id: number }>(`SELECT id FROM entries WHERE user_id = ? AND draw_id = ? AND selected_digits = '135'`, ids[JUAN], C)!;
  const t1 = createTicket(as(JUAN), { subject: 'When is the Draw C sample result posted?', body: 'My entry 135 for Draw C is approved. When will the result be published?', entryId: String(juanC.id) });
  at(-2 * HOUR);
  adminUpdateTicket(as(ADMIN), t1, { state: 'in_progress', reply: 'The result editor will enter the sample result shortly; a second reviewer must publish it.', note: 'Waiting on result editor (Eddie).' });
  at(-30 * MINUTE);
  createTicket(as(MARIA), { subject: 'Refund for rejected entry 579', body: 'My Draw C entry 579 was rejected. Where can I see the refund status?', entryId: String(db.get<{ id: number }>(`SELECT entry_id AS id FROM payments WHERE id = ?`, cRej.paymentId)!.id) });

  // ---- teams -------------------------------------------------------------------------------
  at(-3 * DAY);
  const alpha = createTeam(as(ADMIN), 'Team Alpha', ids['leader.a@demo.local']);
  const bravo = createTeam(as(ADMIN), 'Team Bravo', ids['leader.b@demo.local']);
  assignAgent(as(ADMIN), ids['agent.a1@demo.local'], alpha);
  assignAgent(as(ADMIN), ids['agent.a2@demo.local'], bravo); // later moved to Alpha
  assignAgent(as(ADMIN), ids['agent.b1@demo.local'], bravo);
  assignAgent(as(ADMIN), ids['agent.b2@demo.local'], bravo);
  at(-DAY);
  assignAgent(as(ADMIN), ids['agent.a2@demo.local'], alpha);

  // Bring everything to "now": expire due entries, finish matching.
  at(0);
  runMaintenance(db, clock);
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seed.ts');
if (isMain) {
  const config = loadConfig();
  assertSafeLocalDatabase(config);
  const db = openDatabase(config.databasePath);
  seed(db);
  const n = db.get<{ u: number; e: number; d: number }>('SELECT (SELECT count(*) FROM users) AS u, (SELECT count(*) FROM entries) AS e, (SELECT count(*) FROM draws) AS d')!;
  console.log(`Seeded ${n.d} sample draws, ${n.u} synthetic users and ${n.e} entries into ${config.databasePath}.`);
  console.log(`Demo password for all seeded accounts: ${DEMO_PASSWORD} (local only). See README for the account list.`);
  db.close();
}
