import { DomainError, NotFoundError, isConstraintError } from '../lib/errors.js';
import { randomToken, receiptLedgerRef } from '../lib/ids.js';
import { audit } from './audit.js';
import { convertReservation, releaseReservation } from './capacity.js';
import { type Ctx, hasAny, requireAny } from './context.js';
import { type DrawRow, getDraw } from './draws.js';
import type { EntryRow } from './entries.js';
import { expireEntryIfDue } from './maintenance.js';
import { createRefundObligation } from './refunds.js';

export interface PaymentRow {
  id: number;
  entry_id: number;
  provider: 'demo';
  reference: string | null;
  expected_minor_units: number;
  received_minor_units: number | null;
  trusted_received_at: string | null;
  state: 'unpaid' | 'submitted' | 'verified' | 'rejected';
  proof_object_key: string | null;
  submitted_at: string | null;
  verified_by: number | null;
  verified_at: string | null;
  rejected_by: number | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface LedgerRow {
  id: number;
  kind: 'receipt' | 'refund' | 'payout';
  payment_id: number | null;
  refund_id: number | null;
  payout_id: number | null;
  amount_minor_units: number;
  reference: string;
  idempotency_key: string;
  created_by: number | null;
  created_at: string;
}

export function normalizeReference(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const r = input.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z0-9]{6,24}$/.test(r) ? r : null;
}

export function paymentForEntry(ctx: Ctx, entryId: number): PaymentRow {
  return ctx.db.get<PaymentRow>('SELECT * FROM payments WHERE entry_id = ?', entryId)!;
}

export function receiptFor(ctx: Ctx, paymentId: number): LedgerRow | undefined {
  return ctx.db.get<LedgerRow>(`SELECT * FROM demo_ledger WHERE kind = 'receipt' AND payment_id = ?`, paymentId);
}

export interface SubmitPaymentInput {
  reference: unknown;
  sampleProof: unknown;
  simulateReceipt: unknown;
}

/** Player submits a SIMULATED payment. The server never accepts a client
 *  payment time: receipt time is server time when the demo ledger records it.
 *  Proof images / references alone never move the entry forward. */
export function submitPayment(ctx: Ctx, entryId: number, input: SubmitPaymentInput): { received: boolean } {
  const actor = requireAny(ctx, ['player']);
  expireEntryIfDue(ctx.db, ctx.clock, entryId);
  try {
    return ctx.db.tx(() => {
      const at = ctx.clock.now().toISOString();
      const e = ctx.db.get<EntryRow>('SELECT * FROM entries WHERE id = ? AND user_id = ?', entryId, actor.id);
      if (!e) throw new NotFoundError('Entry not found.');
      const p = ctx.db.get<PaymentRow>('SELECT * FROM payments WHERE entry_id = ?', e.id)!;
      const d = getDraw(ctx.db, e.draw_id)!;
      if (p.trusted_received_at) return { received: true }; // duplicate submit/retry: no second receipt
      if (e.eligibility_status !== 'awaiting_payment') {
        throw new DomainError('ENTRY_NOT_PAYABLE', `This entry is ${e.eligibility_status.replace('_', ' ')}; payment is no longer accepted. You may create a new entry if the draw is still open.`, 409);
      }
      if (d.status === 'cancelled') throw new DomainError('DRAW_CANCELLED', 'This draw was cancelled.', 409);
      if (at >= d.submission_closes_at) throw new DomainError('SUBMISSION_CLOSED', 'Sarado na ang submission. Payment after the submission cutoff is not accepted.', 409);
      if (e.reservation_state !== 'held' || !e.reservation_expires_at || at >= e.reservation_expires_at) {
        throw new DomainError('RESERVATION_EXPIRED', 'Your 5-minute capacity reservation has expired. A late payment cannot restore the slot.', 409);
      }
      let reference = p.reference;
      const supplied = normalizeReference(input.reference);
      if (!reference) {
        if (!supplied) throw new DomainError('INVALID_REFERENCE', 'Enter a reference of 6–24 letters or digits (spaces and dashes are ignored).');
        reference = supplied;
      } else if (supplied && supplied !== reference) {
        throw new DomainError('REFERENCE_LOCKED', 'This payment already has a reference; it cannot be changed.', 409);
      }
      const proofKey = p.proof_object_key ?? (input.sampleProof === 'on' ? `sample_${randomToken(16)}` : null);
      ctx.db.run(
        `UPDATE payments SET reference = ?, proof_object_key = ?, state = 'submitted', submitted_at = coalesce(submitted_at, ?), updated_at = ? WHERE id = ? AND state IN ('unpaid','submitted')`,
        reference, proofKey, at, at, p.id,
      );
      if (p.state === 'unpaid') {
        audit(ctx.db, { actorId: actor.id, action: 'payment.submitted', entityType: 'payment', entityId: p.id, after: { reference, sample_proof: !!proofKey }, requestId: ctx.requestId, at });
      }
      if (input.simulateReceipt !== 'on') return { received: false };
      // Simulated provider confirms the funds: the ledger is the source of truth.
      ctx.db.run(
        `INSERT INTO demo_ledger (kind, payment_id, amount_minor_units, reference, idempotency_key, created_by, created_at) VALUES ('receipt', ?, ?, ?, ?, ?, ?)`,
        p.id, p.expected_minor_units, receiptLedgerRef(), `receipt:payment:${p.id}`, actor.id, at,
      );
      ctx.db.run('UPDATE payments SET received_minor_units = ?, trusted_received_at = ?, updated_at = ? WHERE id = ?', p.expected_minor_units, at, at, p.id);
      // Capacity is now held until verification closure.
      ctx.db.run(
        `UPDATE entries SET eligibility_status = 'pending_verification', reservation_expires_at = ?, updated_at = ? WHERE id = ? AND eligibility_status = 'awaiting_payment'`,
        d.verification_closes_at, at, e.id,
      );
      audit(ctx.db, { actorId: actor.id, action: 'payment.receipt_recorded', entityType: 'payment', entityId: p.id, after: { amount: p.expected_minor_units, trusted_received_at: at }, requestId: ctx.requestId, at });
      return { received: true };
    });
  } catch (err) {
    if (isConstraintError(err, 'payments.provider, payments.reference')) {
      throw new DomainError('REFERENCE_USED', 'That payment reference has already been used. Each payment needs its own reference.', 409);
    }
    throw err;
  }
}

function assertReviewable(ctx: Ctx, e: EntryRow) {
  if (ctx.actor && ctx.actor.id === e.user_id) throw new DomainError('SELF_REVIEW', 'You cannot review a payment for your own entry.', 403);
}

/** Verify receipt, consume the payment, approve the entry, convert capacity and
 *  append audit — atomically. Duplicate clicks/concurrent reviewers: the
 *  guarded UPDATEs let exactly one succeed and the rest observe the result. */
export function approvePayment(ctx: Ctx, paymentId: number): { alreadyApproved: boolean } {
  const actor = requireAny(ctx, ['admin', 'payment_reviewer']);
  const pre = ctx.db.get<{ entry_id: number }>('SELECT entry_id FROM payments WHERE id = ?', paymentId);
  if (!pre) throw new NotFoundError();
  expireEntryIfDue(ctx.db, ctx.clock, pre.entry_id);
  return ctx.db.tx(() => {
    const at = ctx.clock.now().toISOString();
    const p = ctx.db.get<PaymentRow>('SELECT * FROM payments WHERE id = ?', paymentId)!;
    const e = ctx.db.get<EntryRow>('SELECT * FROM entries WHERE id = ?', p.entry_id)!;
    const d = getDraw(ctx.db, e.draw_id)!;
    assertReviewable(ctx, e);
    if (p.state === 'verified' && e.eligibility_status === 'approved') return { alreadyApproved: true };
    if (e.eligibility_status !== 'pending_verification') {
      throw new DomainError('NOT_PENDING', `Entry is ${e.eligibility_status.replace('_', ' ')}; it cannot be approved.`, 409);
    }
    if (d.status === 'cancelled') throw new DomainError('DRAW_CANCELLED', 'The draw was cancelled.', 409);
    const receipt = receiptFor(ctx, p.id);
    if (!receipt || !p.trusted_received_at) {
      throw new DomainError('NO_RECEIPT', 'No ledger-confirmed receipt. A proof image or reference alone is not evidence of payment.', 409);
    }
    if (p.received_minor_units !== p.expected_minor_units || receipt.amount_minor_units !== p.expected_minor_units) {
      throw new DomainError('AMOUNT_MISMATCH', 'Received amount does not equal the exact expected amount.', 409);
    }
    if (p.trusted_received_at >= d.submission_closes_at) throw new DomainError('LATE_RECEIPT', 'Funds were received after the submission cutoff.', 409);
    if (at >= d.verification_closes_at) throw new DomainError('VERIFICATION_CLOSED', 'The verification cutoff has passed. No approvals are possible.', 409);
    if (ctx.db.get(`SELECT 1 FROM result_versions WHERE draw_id = ? AND state IN ('submitted','published','superseded')`, d.id)) {
      throw new DomainError('RESULT_RECORDED', 'A result has been recorded for this draw. No approvals are possible.', 409);
    }
    if (e.reservation_state !== 'held') throw new DomainError('NO_RESERVATION', 'The entry no longer holds a valid capacity reservation.', 409);
    const up = ctx.db.run(`UPDATE payments SET state = 'verified', verified_by = ?, verified_at = ?, updated_at = ? WHERE id = ? AND state = 'submitted'`, actor.id, at, at, p.id);
    const ue = ctx.db.run(
      `UPDATE entries SET eligibility_status = 'approved', approved_at = ?, reviewer_id = ?, updated_at = ? WHERE id = ? AND eligibility_status = 'pending_verification'`,
      at, actor.id, at, e.id,
    );
    if (up.changes !== 1 || ue.changes !== 1) throw new DomainError('CONFLICT', 'This payment was processed by someone else. Refresh to see the current state.', 409);
    convertReservation(ctx.db, e, at);
    audit(ctx.db, { actorId: actor.id, action: 'payment.approved', entityType: 'payment', entityId: p.id, before: { payment: p.state, entry: e.eligibility_status }, after: { payment: 'verified', entry: 'approved', entry_id: e.id }, requestId: ctx.requestId, at });
    return { alreadyApproved: false };
  });
}

export function rejectPayment(ctx: Ctx, paymentId: number, reason: unknown): void {
  const actor = requireAny(ctx, ['admin', 'payment_reviewer']);
  const why = typeof reason === 'string' ? reason.trim() : '';
  if (why.length < 5) throw new DomainError('REASON_REQUIRED', 'Enter a rejection reason (at least 5 characters). The player will see it.');
  const pre = ctx.db.get<{ entry_id: number }>('SELECT entry_id FROM payments WHERE id = ?', paymentId);
  if (!pre) throw new NotFoundError();
  expireEntryIfDue(ctx.db, ctx.clock, pre.entry_id);
  ctx.db.tx(() => {
    const at = ctx.clock.now().toISOString();
    const p = ctx.db.get<PaymentRow>('SELECT * FROM payments WHERE id = ?', paymentId)!;
    const e = ctx.db.get<EntryRow>('SELECT * FROM entries WHERE id = ?', p.entry_id)!;
    const d = getDraw(ctx.db, e.draw_id)!;
    assertReviewable(ctx, e);
    if (p.state === 'rejected' && e.eligibility_status === 'rejected') return;
    if (e.eligibility_status !== 'awaiting_payment' && e.eligibility_status !== 'pending_verification') {
      throw new DomainError('NOT_PENDING', `Entry is ${e.eligibility_status.replace('_', ' ')}; it cannot be rejected.`, 409);
    }
    if (at >= d.verification_closes_at) throw new DomainError('VERIFICATION_CLOSED', 'The verification cutoff has passed.', 409);
    ctx.db.run(`UPDATE payments SET state = 'rejected', rejected_by = ?, rejected_at = ?, rejection_reason = ?, updated_at = ? WHERE id = ? AND state IN ('unpaid','submitted')`, actor.id, at, why, at, p.id);
    ctx.db.run(`UPDATE entries SET eligibility_status = 'rejected', rejected_at = ?, rejection_reason = ?, reviewer_id = ?, updated_at = ? WHERE id = ?`, at, why, actor.id, at, e.id);
    releaseReservation(ctx.db, e, at, actor.id, ctx.requestId);
    createRefundObligation(ctx.db, p.id, 'payment_rejected', at, actor.id, ctx.requestId);
    audit(ctx.db, { actorId: actor.id, action: 'payment.rejected', entityType: 'payment', entityId: p.id, after: { reason: why, entry_id: e.id }, requestId: ctx.requestId, at });
  });
}

export interface PaymentQueueRow extends PaymentRow {
  entry_ref: string;
  entry_status: string;
  selected_digits: string;
  user_email: string;
  draw_id: number;
  draw_label: string;
  submission_closes_at: string;
  verification_closes_at: string;
  has_receipt: number;
}

export function paymentQueue(ctx: Ctx, q: { view?: string; drawId?: number }): PaymentQueueRow[] {
  requireAny(ctx, ['admin', 'payment_reviewer']);
  const where: string[] = [];
  const params: number[] = [];
  switch (q.view ?? 'needs_review') {
    case 'needs_review':
      where.push(`e.eligibility_status = 'pending_verification'`);
      break;
    case 'claims':
      where.push(`p.state = 'submitted' AND p.trusted_received_at IS NULL AND e.eligibility_status = 'awaiting_payment'`);
      break;
    case 'verified':
      where.push(`p.state = 'verified'`);
      break;
    case 'rejected':
      where.push(`p.state = 'rejected'`);
      break;
    case 'all':
      break;
  }
  if (q.drawId) {
    where.push('e.draw_id = ?');
    params.push(q.drawId);
  }
  return ctx.db.all<PaymentQueueRow>(
    `SELECT p.*, e.public_ref AS entry_ref, e.eligibility_status AS entry_status, e.selected_digits, u.email AS user_email,
       d.id AS draw_id, d.reference_label AS draw_label, d.submission_closes_at, d.verification_closes_at,
       EXISTS (SELECT 1 FROM demo_ledger l WHERE l.kind = 'receipt' AND l.payment_id = p.id) AS has_receipt
     FROM payments p JOIN entries e ON e.id = p.entry_id JOIN users u ON u.id = e.user_id JOIN draws d ON d.id = e.draw_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY d.verification_closes_at ASC, p.id ASC LIMIT 300`,
    ...params,
  );
}

export interface PaymentDetail {
  payment: PaymentRow;
  entry: EntryRow;
  draw: DrawRow;
  userEmail: string;
  userName: string;
  receipt: LedgerRow | undefined;
  refund: { id: number; status: string; reference: string | null } | undefined;
}

export function paymentDetail(ctx: Ctx, id: number): PaymentDetail {
  requireAny(ctx, ['admin', 'payment_reviewer']);
  const p = ctx.db.get<PaymentRow>('SELECT * FROM payments WHERE id = ?', id);
  if (!p) throw new NotFoundError();
  expireEntryIfDue(ctx.db, ctx.clock, p.entry_id);
  const payment = ctx.db.get<PaymentRow>('SELECT * FROM payments WHERE id = ?', id)!;
  const entry = ctx.db.get<EntryRow>('SELECT * FROM entries WHERE id = ?', p.entry_id)!;
  const u = ctx.db.get<{ email: string; display_name: string }>('SELECT email, display_name FROM users WHERE id = ?', entry.user_id)!;
  return {
    payment,
    entry,
    draw: getDraw(ctx.db, entry.draw_id)!,
    userEmail: u.email,
    userName: u.display_name,
    receipt: receiptFor(ctx, p.id),
    refund: ctx.db.get('SELECT id, status, reference FROM refunds WHERE payment_id = ?', p.id),
  };
}

/** Proof access: the owning player or payment staff only; others get 404. */
export function proofAccess(ctx: Ctx, key: string): { entryRef: string; reference: string | null } {
  if (!ctx.actor) throw new NotFoundError();
  const row = ctx.db.get<{ user_id: number; public_ref: string; reference: string | null }>(
    'SELECT e.user_id, e.public_ref, p.reference FROM payments p JOIN entries e ON e.id = p.entry_id WHERE p.proof_object_key = ?',
    key,
  );
  if (!row) throw new NotFoundError();
  if (row.user_id !== ctx.actor.id && !hasAny(ctx.actor, ['admin', 'payment_reviewer'])) throw new NotFoundError();
  return { entryRef: row.public_ref, reference: row.reference };
}
