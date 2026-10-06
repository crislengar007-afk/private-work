import type { Db } from '../db/index.js';
import { matchEntry, validateResult } from '../domain/digits.js';
import { GROSS_PAYOUT_MINOR } from '../domain/rules.js';
import type { Clock } from '../lib/clock.js';
import { DomainError, NotFoundError } from '../lib/errors.js';
import { audit } from './audit.js';
import { type Ctx, requireAny } from './context.js';
import { getDraw } from './draws.js';
import { expireDueEntries } from './maintenance.js';

export interface ResultVersionRow {
  id: number;
  draw_id: number;
  version: number;
  six_digit_result: string;
  source_label: string;
  source_url: string | null;
  entered_by: number;
  entered_at: string;
  reviewed_by: number | null;
  reviewed_at: string | null;
  review_note: string | null;
  state: 'submitted' | 'rejected' | 'published' | 'superseded';
  correction_reason: string | null;
  matching_state: 'not_started' | 'processing' | 'complete';
  published_at: string | null;
}

export const SAMPLE_SOURCE_LABEL = 'SAMPLE — demo result, not an official lottery draw';

export function currentPublished(db: Db, drawId: number): ResultVersionRow | undefined {
  return db.get<ResultVersionRow>(`SELECT * FROM result_versions WHERE draw_id = ? AND state = 'published'`, drawId);
}

export interface SubmitResultInput {
  result: unknown;
  sourceLabel: unknown;
  sourceUrl: unknown;
  correctionReason: unknown;
}

export function submitResult(ctx: Ctx, drawId: number, input: SubmitResultInput): number {
  const actor = requireAny(ctx, ['admin', 'result_editor']);
  const result = typeof input.result === 'string' ? input.result.trim() : '';
  const check = validateResult(result);
  if (!check.ok) throw new DomainError(check.code === 'REPEATED' ? 'RESULT_REPEATED_DIGITS' : 'INVALID_RESULT', check.error);
  const label = typeof input.sourceLabel === 'string' && input.sourceLabel.trim() ? input.sourceLabel.trim() : SAMPLE_SOURCE_LABEL;
  if (label.length < 3 || label.length > 120) throw new DomainError('INVALID_SOURCE', 'Source label must be 3–120 characters.');
  const url = typeof input.sourceUrl === 'string' && input.sourceUrl.trim() ? input.sourceUrl.trim() : null;
  if (url && !/^https?:\/\/[^\s<>"]+$/i.test(url)) throw new DomainError('INVALID_URL', 'Source URL must start with http:// or https://');
  const reason = typeof input.correctionReason === 'string' ? input.correctionReason.trim() : '';
  return ctx.db.tx(() => {
    const at = ctx.clock.now().toISOString();
    const d = getDraw(ctx.db, drawId);
    if (!d) throw new NotFoundError();
    if (d.status === 'cancelled') throw new DomainError('DRAW_CANCELLED', 'This draw was cancelled; no result can be recorded.', 409);
    if (d.status === 'draft') throw new DomainError('DRAW_DRAFT', 'This draw never opened.', 409);
    if (at < d.verification_closes_at) throw new DomainError('RESULT_TOO_EARLY', 'Results can be entered only after the verification cutoff.', 409);
    if (ctx.db.get(`SELECT 1 FROM result_versions WHERE draw_id = ? AND state = 'submitted'`, drawId)) {
      throw new DomainError('RESULT_PENDING', 'A result for this draw is already awaiting review.', 409);
    }
    const published = currentPublished(ctx.db, drawId);
    if (published) {
      if (reason.length < 10) throw new DomainError('CORRECTION_REASON', 'A correction to a published result needs a reason (at least 10 characters).');
      if (published.six_digit_result === result) throw new DomainError('SAME_RESULT', 'The correction is identical to the published result.');
    }
    const version = (ctx.db.get<{ v: number | null }>('SELECT max(version) AS v FROM result_versions WHERE draw_id = ?', drawId)!.v ?? 0) + 1;
    const id = ctx.db.run(
      `INSERT INTO result_versions (draw_id, version, six_digit_result, source_label, source_url, entered_by, entered_at, state, correction_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?)`,
      drawId, version, result, label, url, actor.id, at, published ? reason : null,
    ).lastInsertRowid;
    audit(ctx.db, { actorId: actor.id, action: published ? 'result.correction_submitted' : 'result.submitted', entityType: 'result_version', entityId: id, after: { draw_id: drawId, version, result, source: label, reason: reason || undefined }, requestId: ctx.requestId, at });
    return id;
  });
}

export function rejectResult(ctx: Ctx, versionId: number, note: unknown): void {
  const actor = requireAny(ctx, ['admin', 'result_reviewer']);
  const why = typeof note === 'string' ? note.trim() : '';
  if (why.length < 5) throw new DomainError('REASON_REQUIRED', 'Enter a review note (at least 5 characters).');
  ctx.db.tx(() => {
    const at = ctx.clock.now().toISOString();
    const v = ctx.db.get<ResultVersionRow>('SELECT * FROM result_versions WHERE id = ?', versionId);
    if (!v) throw new NotFoundError();
    if (v.entered_by === actor.id) throw new DomainError('SELF_REVIEW', 'You entered this result. A different staff member must review it.', 403);
    if (v.state !== 'submitted') throw new DomainError('RESULT_STATE', `This result is ${v.state}.`, 409);
    ctx.db.run(`UPDATE result_versions SET state = 'rejected', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ? AND state = 'submitted'`, actor.id, at, why, versionId);
    audit(ctx.db, { actorId: actor.id, action: 'result.rejected', entityType: 'result_version', entityId: versionId, after: { note: why }, requestId: ctx.requestId, at });
  });
}

/** Separate-reviewer publication (SPEC §9). Publishing a correction supersedes
 *  — never deletes — the prior version, then outcomes are recomputed once for
 *  the new version. */
export function publishResult(ctx: Ctx, versionId: number, confirm: unknown, opts: { matchingBatches?: number } = {}): { alreadyPublished: boolean } {
  const actor = requireAny(ctx, ['admin', 'result_reviewer']);
  if (confirm !== 'on') throw new DomainError('CONFIRM_REQUIRED', 'Confirm that you independently checked the six digits against the source.');
  const pre = ctx.db.get<ResultVersionRow>('SELECT * FROM result_versions WHERE id = ?', versionId);
  if (!pre) throw new NotFoundError();
  expireDueEntries(ctx.db, ctx.clock, pre.draw_id);
  const out = ctx.db.tx(() => {
    const at = ctx.clock.now().toISOString();
    const v = ctx.db.get<ResultVersionRow>('SELECT * FROM result_versions WHERE id = ?', versionId)!;
    if (v.state === 'published') return { alreadyPublished: true };
    if (v.entered_by === actor.id) throw new DomainError('SELF_PUBLISH', 'You entered this result, so you cannot publish it. A second authorized reviewer is required.', 403);
    if (v.state !== 'submitted') throw new DomainError('RESULT_STATE', `This result is ${v.state}.`, 409);
    const d = getDraw(ctx.db, v.draw_id)!;
    if (d.status === 'cancelled') throw new DomainError('DRAW_CANCELLED', 'This draw was cancelled.', 409);
    if (at < d.verification_closes_at || at < d.scheduled_draw_at) {
      throw new DomainError('PUBLISH_TOO_EARLY', 'A result cannot be published before the scheduled draw time and verification closure.', 409);
    }
    const open = ctx.db.get<{ n: number }>(`SELECT count(*) AS n FROM entries WHERE draw_id = ? AND eligibility_status IN ('awaiting_payment','pending_verification')`, d.id)!.n;
    if (open > 0) throw new DomainError('PENDING_ENTRIES', 'Pending entries have not been closed yet. Try again in a moment.', 409);
    const prev = currentPublished(ctx.db, d.id);
    if (prev) ctx.db.run(`UPDATE result_versions SET state = 'superseded' WHERE id = ? AND state = 'published'`, prev.id);
    ctx.db.run(
      `UPDATE result_versions SET state = 'published', reviewed_by = ?, reviewed_at = ?, published_at = ?, matching_state = 'processing' WHERE id = ? AND state = 'submitted'`,
      actor.id, at, at, v.id,
    );
    audit(ctx.db, { actorId: actor.id, action: prev ? 'result.correction_published' : 'result.published', entityType: 'result_version', entityId: v.id, before: prev ? { version: prev.version, result: prev.six_digit_result } : undefined, after: { draw_id: d.id, version: v.version, result: v.six_digit_result }, requestId: ctx.requestId, at });
    return { alreadyPublished: false };
  });
  if (!out.alreadyPublished) runMatching(ctx.db, ctx.clock, versionId, { maxBatches: opts.matchingBatches });
  return out;
}

/** Resumable, idempotent matching job. Each batch commits on its own; outcome
 *  rows are unique per (entry, version) so an interrupted run never duplicates. */
export function runMatching(db: Db, clock: Clock, versionId: number, opts: { batchSize?: number; maxBatches?: number } = {}): { processed: number; complete: boolean } {
  const batchSize = opts.batchSize ?? 500;
  const maxBatches = opts.maxBatches ?? Number.POSITIVE_INFINITY;
  let processed = 0;
  for (let batch = 0; batch < maxBatches; batch++) {
    const done = db.tx(() => {
      const at = clock.now().toISOString();
      const v = db.get<ResultVersionRow>('SELECT * FROM result_versions WHERE id = ?', versionId);
      if (!v || v.state !== 'published' || v.matching_state === 'complete') return true;
      const rows = db.all<{ id: number; selected_digits: string }>(
        `SELECT e.id, e.selected_digits FROM entries e
         WHERE e.draw_id = ? AND e.eligibility_status = 'approved'
           AND NOT EXISTS (SELECT 1 FROM outcomes o WHERE o.entry_id = e.id AND o.result_version_id = ?)
         ORDER BY e.id LIMIT ?`,
        v.draw_id, v.id, batchSize,
      );
      if (rows.length === 0) {
        db.run(`UPDATE result_versions SET matching_state = 'complete' WHERE id = ?`, v.id);
        reconcilePayouts(db, v, at);
        audit(db, { actorId: null, action: 'result.matching_complete', entityType: 'result_version', entityId: v.id, after: { draw_id: v.draw_id, version: v.version }, at });
        return true;
      }
      for (const e of rows) {
        const m = matchEntry(e.selected_digits, v.six_digit_result);
        db.run(
          `INSERT OR IGNORE INTO outcomes (entry_id, result_version_id, outcome, prize_minor_units, matched_digits, missing_digits, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          e.id, v.id, m.won ? 'won' : 'lost', m.won ? GROSS_PAYOUT_MINOR : 0, m.matched.join(''), m.missing.join(''), at,
        );
      }
      processed += rows.length;
      return false;
    });
    if (done) return { processed, complete: true };
  }
  return { processed, complete: false };
}

/** After a correction: never pay twice, never silently debit. Payouts whose
 *  entry no longer wins are cancelled if not yet completed, and every affected
 *  payout gets a reconciliation flag for human review. */
function reconcilePayouts(db: Db, v: ResultVersionRow, at: string): void {
  const rows = db.all<{ id: number; entry_id: number; state: string; outcome: string | null }>(
    `SELECT p.id, p.entry_id, p.state, o.outcome FROM payouts p JOIN entries e ON e.id = p.entry_id
     LEFT JOIN outcomes o ON o.entry_id = p.entry_id AND o.result_version_id = ?
     WHERE e.draw_id = ? AND p.result_version_id <> ? AND p.state IN ('approved','completed')`,
    v.id, v.draw_id, v.id,
  );
  for (const p of rows) {
    if (p.outcome === 'won') continue;
    if (p.state === 'approved') {
      db.run(`UPDATE payouts SET state = 'cancelled', cancelled_at = ?, cancel_reason = ?, updated_at = ? WHERE id = ? AND state = 'approved'`, at, `Result corrected to version ${v.version}; entry no longer wins`, at, p.id);
    }
    const reason = p.state === 'completed'
      ? `Simulated payout was completed under an earlier result; under corrected version ${v.version} this entry LOST. No automatic debit — manual review required.`
      : `Approved (not completed) payout cancelled because corrected version ${v.version} no longer wins.`;
    const r = db.run(`INSERT OR IGNORE INTO reconciliation_flags (payout_id, entry_id, result_version_id, reason, created_at) VALUES (?, ?, ?, ?, ?)`, p.id, p.entry_id, v.id, reason, at);
    if (r.changes) audit(db, { actorId: null, action: 'payout.reconciliation_flagged', entityType: 'payout', entityId: p.id, after: { version: v.version, reason }, at });
  }
}

// ---- read models -------------------------------------------------------------

export interface ResultListRow extends ResultVersionRow {
  draw_label: string;
  scheduled_draw_at: string;
  entered_email: string;
  reviewed_email: string | null;
}

export function listResultVersions(ctx: Ctx, q: { state?: string } = {}): ResultListRow[] {
  requireAny(ctx, ['admin', 'result_editor', 'result_reviewer']);
  const valid = ['submitted', 'rejected', 'published', 'superseded'].includes(q.state ?? '');
  return ctx.db.all<ResultListRow>(
    `SELECT rv.*, d.reference_label AS draw_label, d.scheduled_draw_at, ue.email AS entered_email, ur.email AS reviewed_email
     FROM result_versions rv JOIN draws d ON d.id = rv.draw_id JOIN users ue ON ue.id = rv.entered_by LEFT JOIN users ur ON ur.id = rv.reviewed_by
     ${valid ? 'WHERE rv.state = ?' : ''} ORDER BY rv.id DESC LIMIT 300`,
    ...(valid ? [q.state!] : []),
  );
}

export function drawResultHistory(db: Db, drawId: number, opts: { includeDrafts: boolean }): ResultListRow[] {
  return db.all<ResultListRow>(
    `SELECT rv.*, d.reference_label AS draw_label, d.scheduled_draw_at, ue.email AS entered_email, ur.email AS reviewed_email
     FROM result_versions rv JOIN draws d ON d.id = rv.draw_id JOIN users ue ON ue.id = rv.entered_by LEFT JOIN users ur ON ur.id = rv.reviewed_by
     WHERE rv.draw_id = ? ${opts.includeDrafts ? '' : `AND rv.state IN ('published','superseded')`} ORDER BY rv.version DESC`,
    drawId,
  );
}

export interface PublishedResultRow {
  draw_id: number;
  draw_label: string;
  scheduled_draw_at: string;
  six_digit_result: string;
  version: number;
  source_label: string;
  source_url: string | null;
  published_at: string;
  corrected: number;
}

/** Published results only — public-safe. */
export function publishedResults(db: Db, limit = 100): PublishedResultRow[] {
  return db.all<PublishedResultRow>(
    `SELECT d.id AS draw_id, d.reference_label AS draw_label, d.scheduled_draw_at, rv.six_digit_result, rv.version, rv.source_label, rv.source_url, rv.published_at,
       (rv.correction_reason IS NOT NULL) AS corrected
     FROM result_versions rv JOIN draws d ON d.id = rv.draw_id WHERE rv.state = 'published' ORDER BY d.scheduled_draw_at DESC LIMIT ?`,
    limit,
  );
}
