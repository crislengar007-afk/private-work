export type DrawPhase =
  | 'draft'
  | 'scheduled'
  | 'open'
  | 'submission_closed'
  | 'verification_closed'
  | 'awaiting_result'
  | 'result_review'
  | 'published'
  | 'cancelled';

export interface DrawTimes {
  status: 'draft' | 'open' | 'cancelled';
  opens_at: string;
  submission_closes_at: string;
  verification_closes_at: string;
  scheduled_draw_at: string;
}

/** Derived lifecycle (SPEC §9). Time phases come from SERVER time only. */
export function drawPhase(
  d: DrawTimes,
  now: Date,
  results: { published: boolean; pendingReview: boolean },
): DrawPhase {
  if (d.status === 'cancelled') return 'cancelled';
  if (d.status === 'draft') return 'draft';
  if (results.published) return 'published';
  if (results.pendingReview) return 'result_review';
  const t = now.toISOString();
  if (t < d.opens_at) return 'scheduled';
  if (t < d.submission_closes_at) return 'open';
  if (t < d.verification_closes_at) return 'submission_closed';
  if (t < d.scheduled_draw_at) return 'verification_closed';
  return 'awaiting_result';
}

export const PHASE_LABEL: Record<DrawPhase, string> = {
  draft: 'Draft',
  scheduled: 'Opening soon',
  open: 'Open',
  submission_closed: 'Submission closed · verification only',
  verification_closed: 'Verification closed',
  awaiting_result: 'Awaiting result',
  result_review: 'Result in review',
  published: 'Published',
  cancelled: 'Cancelled',
};
