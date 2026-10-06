import type { Db } from '../db/index.js';
import { DomainError, NotFoundError } from '../lib/errors.js';
import { refundRef } from '../lib/ids.js';
import { audit } from './audit.js';
import { type Ctx, requireAny, nowIso } from './context.js';

export type RefundReason = 'payment_rejected' | 'entry_expired' | 'draw_cancelled' | 'entry_voided';

export interface RefundRow {
  id: number;
  payment_id: number;
  amount_minor_units: number;
  reason: RefundReason;
  status: 'required' | 'processing' | 'completed' | 'failed';
  reference: string | null;
  failure_reason: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** Creates a refund obligation only if the simulated ledger shows funds were
 *  received for this payment. Idempotent (UNIQUE payment_id). */
export function createRefundObligation(db: Db, paymentId: number, reason: RefundReason, at: string, actorId: number | null, requestId: string | null): boolean {
  const receipt = db.get<{ amount_minor_units: number }>(`SELECT amount_minor_units FROM demo_ledger WHERE kind = 'receipt' AND payment_id = ?`, paymentId);
  if (!receipt) return false;
  const r = db.run(
    `INSERT OR IGNORE INTO refunds (payment_id, amount_minor_units, reason, status, created_at, updated_at) VALUES (?, ?, ?, 'required', ?, ?)`,
    paymentId, receipt.amount_minor_units, reason, at, at,
  );
  if (r.changes === 1) {
    audit(db, { actorId, action: 'refund.obligation_created', entityType: 'refund', entityId: r.lastInsertRowid, after: { payment_id: paymentId, reason, amount: receipt.amount_minor_units }, requestId, at });
  }
  return r.changes === 1;
}

export interface RefundListRow extends RefundRow {
  entry_id: number;
  entry_ref: string;
  user_email: string;
  draw_label: string;
}

export function listRefunds(ctx: Ctx, q: { status?: string }): RefundListRow[] {
  requireAny(ctx, ['admin', 'payment_reviewer']);
  const valid = ['required', 'processing', 'completed', 'failed'].includes(q.status ?? '');
  return ctx.db.all<RefundListRow>(
    `SELECT r.*, e.id AS entry_id, e.public_ref AS entry_ref, u.email AS user_email, d.reference_label AS draw_label
     FROM refunds r JOIN payments p ON p.id = r.payment_id JOIN entries e ON e.id = p.entry_id
     JOIN users u ON u.id = e.user_id JOIN draws d ON d.id = e.draw_id
     ${valid ? 'WHERE r.status = ?' : ''} ORDER BY r.id DESC LIMIT 300`,
    ...(valid ? [q.status!] : []),
  );
}

function loadRefund(ctx: Ctx, id: number): RefundRow {
  const r = ctx.db.get<RefundRow>('SELECT * FROM refunds WHERE id = ?', id);
  if (!r) throw new NotFoundError();
  return r;
}

export function startRefundProcessing(ctx: Ctx, id: number): void {
  const actor = requireAny(ctx, ['admin', 'payment_reviewer']);
  const at = nowIso(ctx);
  ctx.db.tx(() => {
    const r = loadRefund(ctx, id);
    if (r.status === 'processing') return; // duplicate click
    if (r.status !== 'required' && r.status !== 'failed') throw new DomainError('REFUND_STATE', `Refund is ${r.status}; cannot start processing.`);
    ctx.db.run(`UPDATE refunds SET status = 'processing', attempts = attempts + 1, failure_reason = NULL, updated_at = ? WHERE id = ? AND status IN ('required','failed')`, at, id);
    audit(ctx.db, { actorId: actor.id, action: 'refund.processing', entityType: 'refund', entityId: id, before: { status: r.status }, after: { status: 'processing' }, requestId: ctx.requestId, at });
  });
}

/** Ledger-confirmed completion. Never labelled refunded before the simulated
 *  refund transaction exists. Idempotent via ledger idempotency key. */
export function completeRefund(ctx: Ctx, id: number): void {
  const actor = requireAny(ctx, ['admin', 'payment_reviewer']);
  const at = nowIso(ctx);
  ctx.db.tx(() => {
    const r = loadRefund(ctx, id);
    if (r.status === 'completed') return;
    if (r.status !== 'processing') throw new DomainError('REFUND_STATE', 'Start processing before completing the simulated refund.');
    const ref = refundRef();
    ctx.db.run(
      `INSERT INTO demo_ledger (kind, payment_id, refund_id, amount_minor_units, reference, idempotency_key, created_by, created_at) VALUES ('refund', ?, ?, ?, ?, ?, ?, ?)`,
      r.payment_id, r.id, r.amount_minor_units, ref, `refund:${r.id}`, actor.id, at,
    );
    ctx.db.run(`UPDATE refunds SET status = 'completed', reference = ?, completed_at = ?, updated_at = ? WHERE id = ? AND status = 'processing'`, ref, at, at, id);
    audit(ctx.db, { actorId: actor.id, action: 'refund.completed', entityType: 'refund', entityId: id, after: { reference: ref, amount: r.amount_minor_units }, requestId: ctx.requestId, at });
  });
}

export function failRefund(ctx: Ctx, id: number, reason: unknown): void {
  const actor = requireAny(ctx, ['admin', 'payment_reviewer']);
  const why = typeof reason === 'string' ? reason.trim() : '';
  if (why.length < 3) throw new DomainError('REASON_REQUIRED', 'Enter a failure reason.');
  const at = nowIso(ctx);
  ctx.db.tx(() => {
    const r = loadRefund(ctx, id);
    if (r.status !== 'processing') throw new DomainError('REFUND_STATE', 'Only a processing refund can be marked failed.');
    ctx.db.run(`UPDATE refunds SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?`, why, at, id);
    audit(ctx.db, { actorId: actor.id, action: 'refund.failed', entityType: 'refund', entityId: id, after: { reason: why }, requestId: ctx.requestId, at });
  });
}
