import { GROSS_PAYOUT_MINOR } from '../domain/rules.js';
import { DomainError, NotFoundError } from '../lib/errors.js';
import { payoutRef } from '../lib/ids.js';
import { audit } from './audit.js';
import { type Ctx, requireAny } from './context.js';

export interface WinnerRow {
  entry_id: number;
  entry_ref: string;
  selected_digits: string;
  user_email: string;
  draw_id: number;
  draw_label: string;
  result_version_id: number;
  version: number;
  six_digit_result: string;
  prize_minor_units: number;
  payout_id: number | null;
  payout_state: string | null;
  payout_reference: string | null;
  payout_version_id: number | null;
}

/** Winners under the CURRENT published version (matching complete). */
export function listWinners(ctx: Ctx, q: { drawId?: number } = {}): WinnerRow[] {
  requireAny(ctx, ['admin', 'payment_reviewer']);
  return ctx.db.all<WinnerRow>(
    `SELECT e.id AS entry_id, e.public_ref AS entry_ref, e.selected_digits, u.email AS user_email, d.id AS draw_id, d.reference_label AS draw_label,
       rv.id AS result_version_id, rv.version, rv.six_digit_result, o.prize_minor_units,
       p.id AS payout_id, p.state AS payout_state, p.reference AS payout_reference, p.result_version_id AS payout_version_id
     FROM outcomes o JOIN result_versions rv ON rv.id = o.result_version_id AND rv.state = 'published' AND rv.matching_state = 'complete'
     JOIN entries e ON e.id = o.entry_id JOIN users u ON u.id = e.user_id JOIN draws d ON d.id = e.draw_id
     LEFT JOIN payouts p ON p.entry_id = e.id
     WHERE o.outcome = 'won' ${q.drawId ? 'AND d.id = ?' : ''}
     ORDER BY d.scheduled_draw_at DESC, e.id`,
    ...(q.drawId ? [q.drawId] : []),
  );
}

export interface PayoutRow {
  id: number;
  entry_id: number;
  result_version_id: number;
  gross_minor_units: number;
  state: 'approved' | 'completed' | 'cancelled';
  reference: string;
  approved_by: number;
  approved_at: string;
  completed_by: number | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
}

function currentWin(ctx: Ctx, entryId: number) {
  return ctx.db.get<{ result_version_id: number }>(
    `SELECT o.result_version_id FROM outcomes o JOIN result_versions rv ON rv.id = o.result_version_id
     WHERE o.entry_id = ? AND o.outcome = 'won' AND rv.state = 'published' AND rv.matching_state = 'complete'`,
    entryId,
  );
}

/** Simulated payout review step. One payout per entry, ever (UNIQUE entry_id). */
export function approvePayout(ctx: Ctx, entryId: number): { payoutId: number; existed: boolean } {
  const actor = requireAny(ctx, ['admin', 'payment_reviewer']);
  return ctx.db.tx(() => {
    const at = ctx.clock.now().toISOString();
    const existing = ctx.db.get<PayoutRow>('SELECT * FROM payouts WHERE entry_id = ?', entryId);
    if (existing) return { payoutId: existing.id, existed: true };
    const win = currentWin(ctx, entryId);
    if (!win) throw new DomainError('NOT_A_WINNER', 'This entry is not a winner under the current published result.', 409);
    const owner = ctx.db.get<{ user_id: number }>('SELECT user_id FROM entries WHERE id = ?', entryId)!;
    if (owner.user_id === actor.id) throw new DomainError('SELF_REVIEW', 'You cannot approve a payout for your own entry.', 403);
    const ref = payoutRef();
    const id = ctx.db.run(
      `INSERT INTO payouts (entry_id, result_version_id, gross_minor_units, state, reference, approved_by, approved_at, created_at, updated_at) VALUES (?, ?, ?, 'approved', ?, ?, ?, ?, ?)`,
      entryId, win.result_version_id, GROSS_PAYOUT_MINOR, ref, actor.id, at, at, at,
    ).lastInsertRowid;
    audit(ctx.db, { actorId: actor.id, action: 'payout.approved', entityType: 'payout', entityId: id, after: { entry_id: entryId, gross: GROSS_PAYOUT_MINOR, reference: ref }, requestId: ctx.requestId, at });
    return { payoutId: id, existed: false };
  });
}

/** Ledger-confirmed simulated completion. Idempotent via ledger key payout:<id>. */
export function completePayout(ctx: Ctx, payoutId: number): void {
  const actor = requireAny(ctx, ['admin', 'payment_reviewer']);
  ctx.db.tx(() => {
    const at = ctx.clock.now().toISOString();
    const p = ctx.db.get<PayoutRow>('SELECT * FROM payouts WHERE id = ?', payoutId);
    if (!p) throw new NotFoundError();
    if (p.state === 'completed') return;
    if (p.state !== 'approved') throw new DomainError('PAYOUT_STATE', `Payout is ${p.state}.`, 409);
    if (!currentWin(ctx, p.entry_id)) throw new DomainError('NOT_A_WINNER', 'The current published result no longer makes this entry a winner. See reconciliation.', 409);
    ctx.db.run(
      `INSERT INTO demo_ledger (kind, payout_id, amount_minor_units, reference, idempotency_key, created_by, created_at) VALUES ('payout', ?, ?, ?, ?, ?, ?)`,
      p.id, p.gross_minor_units, p.reference, `payout:${p.id}`, actor.id, at,
    );
    ctx.db.run(`UPDATE payouts SET state = 'completed', completed_by = ?, completed_at = ?, updated_at = ? WHERE id = ? AND state = 'approved'`, actor.id, at, at, p.id);
    audit(ctx.db, { actorId: actor.id, action: 'payout.completed', entityType: 'payout', entityId: p.id, after: { reference: p.reference, gross: p.gross_minor_units }, requestId: ctx.requestId, at });
  });
}

export interface PayoutHistoryRow extends PayoutRow {
  entry_ref: string;
  user_email: string;
  draw_label: string;
  version: number;
}

export function payoutHistory(ctx: Ctx): PayoutHistoryRow[] {
  requireAny(ctx, ['admin', 'payment_reviewer']);
  return ctx.db.all<PayoutHistoryRow>(
    `SELECT p.*, e.public_ref AS entry_ref, u.email AS user_email, d.reference_label AS draw_label, rv.version
     FROM payouts p JOIN entries e ON e.id = p.entry_id JOIN users u ON u.id = e.user_id JOIN draws d ON d.id = e.draw_id JOIN result_versions rv ON rv.id = p.result_version_id
     ORDER BY p.id DESC LIMIT 300`,
  );
}

export interface FlagRow {
  id: number;
  payout_id: number;
  entry_id: number;
  entry_ref: string;
  version: number;
  reason: string;
  status: 'open' | 'resolved';
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

export function reconciliationFlags(ctx: Ctx): FlagRow[] {
  requireAny(ctx, ['admin', 'payment_reviewer']);
  return ctx.db.all<FlagRow>(
    `SELECT f.*, e.public_ref AS entry_ref, rv.version FROM reconciliation_flags f JOIN entries e ON e.id = f.entry_id JOIN result_versions rv ON rv.id = f.result_version_id ORDER BY f.status = 'open' DESC, f.id DESC`,
  );
}

export function resolveFlag(ctx: Ctx, flagId: number, note: unknown): void {
  const actor = requireAny(ctx, ['admin']);
  const why = typeof note === 'string' ? note.trim() : '';
  if (why.length < 5) throw new DomainError('REASON_REQUIRED', 'Enter a resolution note (at least 5 characters).');
  ctx.db.tx(() => {
    const at = ctx.clock.now().toISOString();
    const r = ctx.db.run(`UPDATE reconciliation_flags SET status = 'resolved', resolved_by = ?, resolution_note = ?, resolved_at = ? WHERE id = ? AND status = 'open'`, actor.id, why, at, flagId);
    if (r.changes) audit(ctx.db, { actorId: actor.id, action: 'payout.reconciliation_resolved', entityType: 'reconciliation_flag', entityId: flagId, after: { note: why }, requestId: ctx.requestId, at });
  });
}
