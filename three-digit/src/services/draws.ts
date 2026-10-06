import type { Db } from '../db/index.js';
import { type DrawPhase, drawPhase } from '../domain/draw-phase.js';
import { CUTOFF_POLICY, COMBINATION_CAP_MINOR, DEFAULT_RESERVATION_MINUTES, GROSS_PAYOUT_MINOR, MATCHING_DEFINITION, STAKE_MINOR } from '../domain/rules.js';
import { DomainError, NotFoundError } from '../lib/errors.js';
import { fromManilaInput } from '../lib/format.js';
import { audit } from './audit.js';
import { releaseReservation } from './capacity.js';
import { type Ctx, requireAny, nowIso } from './context.js';
import { createRefundObligation } from './refunds.js';

export interface DrawRow {
  id: number;
  reference_label: string;
  timezone: string;
  opens_at: string;
  submission_closes_at: string;
  verification_closes_at: string;
  scheduled_draw_at: string;
  status: 'draft' | 'open' | 'cancelled';
  rule_version_id: number;
  frozen_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  cancelled_by: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface RuleVersionRow {
  id: number;
  label: string;
  matching_definition: string;
  cutoff_policy: string;
  stake_minor: number;
  gross_payout_minor: number;
  includes_stake: number;
  combination_cap_minor: number;
  reservation_minutes: number;
  created_at: string;
}

export interface DrawWithPhase extends DrawRow {
  phase: DrawPhase;
  published_result: string | null;
  published_version: number | null;
}

export function ensureDefaultRuleVersion(db: Db, at: string): number {
  const row = db.get<{ id: number }>('SELECT id FROM rule_versions ORDER BY id LIMIT 1');
  if (row) return row.id;
  return db.run(
    `INSERT INTO rule_versions (label, matching_definition, cutoff_policy, stake_minor, gross_payout_minor, includes_stake, combination_cap_minor, reservation_minutes, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    'Rules v1 — fixed ₱10 stake, ₱3,100 total payout (demo)', MATCHING_DEFINITION, CUTOFF_POLICY, STAKE_MINOR, GROSS_PAYOUT_MINOR, COMBINATION_CAP_MINOR, DEFAULT_RESERVATION_MINUTES, at,
  ).lastInsertRowid;
}

export function getRule(db: Db, id: number): RuleVersionRow {
  return db.get<RuleVersionRow>('SELECT * FROM rule_versions WHERE id = ?', id)!;
}

export function getDraw(db: Db, id: number): DrawRow | undefined {
  return db.get<DrawRow>('SELECT * FROM draws WHERE id = ?', id);
}

export function resultFlags(db: Db, drawId: number): { published: boolean; pendingReview: boolean } {
  const r = db.get<{ p: number; s: number }>(
    `SELECT sum(state = 'published') AS p, sum(state = 'submitted') AS s FROM result_versions WHERE draw_id = ?`,
    drawId,
  );
  return { published: !!r?.p, pendingReview: !!r?.s };
}

export function withPhase(db: Db, d: DrawRow, now: Date): DrawWithPhase {
  const pub = db.get<{ six_digit_result: string; version: number }>(`SELECT six_digit_result, version FROM result_versions WHERE draw_id = ? AND state = 'published'`, d.id);
  return { ...d, phase: drawPhase(d, now, resultFlags(db, d.id)), published_result: pub?.six_digit_result ?? null, published_version: pub?.version ?? null };
}

export function listDraws(db: Db, now: Date, opts: { includeDrafts?: boolean } = {}): DrawWithPhase[] {
  const rows = db.all<DrawRow>(`SELECT * FROM draws ${opts.includeDrafts ? '' : "WHERE status <> 'draft'"} ORDER BY scheduled_draw_at DESC`);
  return rows.map((d) => withPhase(db, d, now));
}

/** Draws currently accepting entries (server time). */
export function openDraws(db: Db, now: Date): DrawRow[] {
  const t = now.toISOString();
  return db.all<DrawRow>(`SELECT * FROM draws WHERE status = 'open' AND opens_at <= ? AND submission_closes_at > ? ORDER BY submission_closes_at`, t, t);
}

/** Public-safe upcoming draws (not draft, not cancelled, draw time ahead). */
export function upcomingDraws(db: Db, now: Date): DrawWithPhase[] {
  const t = now.toISOString();
  return db.all<DrawRow>(`SELECT * FROM draws WHERE status = 'open' AND scheduled_draw_at > ? ORDER BY scheduled_draw_at LIMIT 5`, t).map((d) => withPhase(db, d, now));
}

export function assertAcceptingEntries(d: DrawRow, now: Date): void {
  const t = now.toISOString();
  if (d.status === 'cancelled') throw new DomainError('DRAW_CANCELLED', 'This draw was cancelled. No new entries are accepted.', 409);
  if (d.status !== 'open' || t < d.opens_at) throw new DomainError('DRAW_NOT_OPEN', 'Hindi pa bukas ang draw na ito. This draw is not open for entries yet.', 409);
  if (t >= d.submission_closes_at) throw new DomainError('SUBMISSION_CLOSED', 'Sarado na ang submission para sa draw na ito. The submission cutoff has passed.', 409);
}

// ---- admin lifecycle --------------------------------------------------------

export interface DrawInput {
  reference_label: unknown;
  opens_at: unknown;
  submission_closes_at: unknown;
  verification_closes_at: unknown;
  scheduled_draw_at: unknown;
}

function parseDrawInput(input: DrawInput): { label: string; times: [string, string, string, string] } {
  const label = typeof input.reference_label === 'string' ? input.reference_label.trim() : '';
  if (label.length < 3 || label.length > 80) throw new DomainError('INVALID_LABEL', 'Reference label must be 3–80 characters.');
  const keys = ['opens_at', 'submission_closes_at', 'verification_closes_at', 'scheduled_draw_at'] as const;
  const times = keys.map((k) => {
    const iso = fromManilaInput(String(input[k] ?? ''));
    if (!iso) throw new DomainError('INVALID_TIME', `Enter a valid date and time for ${k.replace(/_/g, ' ')} (Asia/Manila).`);
    return iso;
  }) as [string, string, string, string];
  if (!(times[0] < times[1] && times[1] < times[2] && times[2] < times[3])) {
    throw new DomainError('INVALID_SCHEDULE', 'Schedule must satisfy: opens < submission cutoff < verification cutoff < draw time.');
  }
  return { label, times };
}

export function createDraftDraw(ctx: Ctx, input: DrawInput): number {
  const actor = requireAny(ctx, ['admin']);
  const { label, times } = parseDrawInput(input);
  const at = nowIso(ctx);
  return ctx.db.tx(() => {
    const ruleId = ensureDefaultRuleVersion(ctx.db, at);
    const id = ctx.db.run(
      `INSERT INTO draws (reference_label, opens_at, submission_closes_at, verification_closes_at, scheduled_draw_at, status, rule_version_id, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
      label, ...times, ruleId, actor.id, at, at,
    ).lastInsertRowid;
    audit(ctx.db, { actorId: actor.id, action: 'draw.draft_created', entityType: 'draw', entityId: id, after: { label, times }, requestId: ctx.requestId, at });
    return id;
  });
}

export function updateDraftDraw(ctx: Ctx, id: number, input: DrawInput): void {
  const actor = requireAny(ctx, ['admin']);
  const { label, times } = parseDrawInput(input);
  const at = nowIso(ctx);
  ctx.db.tx(() => {
    const d = getDraw(ctx.db, id);
    if (!d) throw new NotFoundError();
    if (d.status !== 'draft') throw new DomainError('DRAW_FROZEN', 'This draw has opened; its schedule and rules are frozen. Use cancellation instead.', 409);
    ctx.db.run(
      `UPDATE draws SET reference_label = ?, opens_at = ?, submission_closes_at = ?, verification_closes_at = ?, scheduled_draw_at = ?, updated_at = ? WHERE id = ? AND status = 'draft'`,
      label, ...times, at, id,
    );
    audit(ctx.db, { actorId: actor.id, action: 'draw.draft_updated', entityType: 'draw', entityId: id, before: { label: d.reference_label, times: [d.opens_at, d.submission_closes_at, d.verification_closes_at, d.scheduled_draw_at] }, after: { label, times }, requestId: ctx.requestId, at });
  });
}

/** Opening freezes the schedule and the rule version snapshot. */
export function openDraw(ctx: Ctx, id: number): void {
  const actor = requireAny(ctx, ['admin']);
  ctx.db.tx(() => {
    const at = nowIso(ctx);
    const d = getDraw(ctx.db, id);
    if (!d) throw new NotFoundError();
    if (d.status === 'open') return;
    if (d.status !== 'draft') throw new DomainError('DRAW_STATE', 'Only a draft can be opened.', 409);
    if (at >= d.submission_closes_at) throw new DomainError('SCHEDULE_PASSED', 'The submission cutoff is already in the past. Edit the draft schedule first.', 409);
    ctx.db.run(`UPDATE draws SET status = 'open', frozen_at = ?, updated_at = ? WHERE id = ? AND status = 'draft'`, at, at, id);
    audit(ctx.db, { actorId: actor.id, action: 'draw.opened', entityType: 'draw', entityId: id, after: { rule_version_id: d.rule_version_id, frozen_at: at }, requestId: ctx.requestId, at });
  });
}

/** Audited cancellation before publication: voids eligible entries, releases
 *  held reservations and creates one refund obligation per received payment. */
export function cancelDraw(ctx: Ctx, id: number, reason: unknown): { voided: number; refunds: number } {
  const actor = requireAny(ctx, ['admin']);
  const why = typeof reason === 'string' ? reason.trim() : '';
  if (why.length < 5) throw new DomainError('REASON_REQUIRED', 'Enter a cancellation reason (at least 5 characters).');
  return ctx.db.tx(() => {
    const at = nowIso(ctx);
    const d = getDraw(ctx.db, id);
    if (!d) throw new NotFoundError();
    if (d.status === 'cancelled') return { voided: 0, refunds: 0 };
    if (resultFlags(ctx.db, id).published) throw new DomainError('ALREADY_PUBLISHED', 'A published draw cannot be cancelled. Use the result correction process.', 409);
    ctx.db.run(`UPDATE draws SET status = 'cancelled', frozen_at = coalesce(frozen_at, ?), cancelled_at = ?, cancel_reason = ?, cancelled_by = ?, updated_at = ? WHERE id = ?`, at, at, why, actor.id, at, id);
    ctx.db.run(`UPDATE result_versions SET state = 'rejected', review_note = 'Draw cancelled' WHERE draw_id = ? AND state = 'submitted'`, id);
    const active = ctx.db.all<{ id: number; draw_id: number; canonical_key: string; stake_minor_units: number }>(
      `SELECT id, draw_id, canonical_key, stake_minor_units FROM entries WHERE draw_id = ? AND eligibility_status IN ('awaiting_payment','pending_verification','approved')`,
      id,
    );
    for (const e of active) {
      ctx.db.run(`UPDATE entries SET eligibility_status = 'voided', voided_at = ?, void_reason = ?, updated_at = ? WHERE id = ?`, at, 'Draw cancelled', at, e.id);
      releaseReservation(ctx.db, e, at, actor.id, ctx.requestId);
    }
    // Every payment with a ledger receipt in this draw that has no refund yet.
    const paid = ctx.db.all<{ id: number }>(
      `SELECT p.id FROM payments p JOIN entries e ON e.id = p.entry_id
       WHERE e.draw_id = ? AND EXISTS (SELECT 1 FROM demo_ledger l WHERE l.kind = 'receipt' AND l.payment_id = p.id)`,
      id,
    );
    let refunds = 0;
    for (const p of paid) if (createRefundObligation(ctx.db, p.id, 'draw_cancelled', at, actor.id, ctx.requestId)) refunds++;
    audit(ctx.db, { actorId: actor.id, action: 'draw.cancelled', entityType: 'draw', entityId: id, before: { status: d.status }, after: { status: 'cancelled', reason: why, voided: active.length, refunds }, requestId: ctx.requestId, at });
    return { voided: active.length, refunds };
  });
}
