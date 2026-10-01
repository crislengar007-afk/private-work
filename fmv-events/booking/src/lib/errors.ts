// Turns Supabase/Postgres errors into messages a client or the owner can act on.

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

interface PgLikeError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

/** Codes raised by our SQL functions (message = code, detail = friendly text). */
const KNOWN_CODES = new Set([
  'quote_not_found', 'quote_not_open', 'quote_expired', 'name_required', 'date_unavailable',
  'item_unavailable', 'invoice_not_found', 'invoice_void', 'invalid_amount', 'booking_cancelled',
  'slot_not_found', 'campaign_closed', 'slot_past', 'slot_taken',
]);

export function friendlyDbError(err: PgLikeError | null | undefined, fallback = 'Something went wrong. Please try again.'): string {
  if (!err) return fallback;
  if (err.message && KNOWN_CODES.has(err.message)) return err.details || fallback;
  switch (err.code) {
    case '23P01': // exclusion_violation
      return 'That date/time is no longer available.';
    case '23505': // unique_violation
      return 'That already exists.';
    case '23514': // check_violation
      if (err.message?.includes('media_ai_never_portfolio')) return 'AI-generated media can never be shown in the portfolio.';
      if (err.message?.includes('media_ai_never_featured')) return 'AI-generated media can never be featured.';
      if (err.message?.includes('media_mood_board_is_ai')) return 'Only AI-generated concept boards can have a mood theme.';
      if (err.message?.includes('active_needs_price') || err.message?.includes('live_needs_price')) return 'Set a price before making this public.';
      if (err.message?.includes('testimonials_publish_needs_consent')) return 'A testimonial needs the client’s consent before it can be published.';
      return 'Some values are not allowed. Please check the form.';
    case '23503': // foreign_key_violation
      return 'This is still used elsewhere, so it can’t be removed.';
    case '42501':
      return 'You do not have permission to do that.';
    default:
      return fallback;
  }
}

export function errorCode(err: PgLikeError | null | undefined): string | undefined {
  return err?.message && KNOWN_CODES.has(err.message) ? err.message : err?.code;
}
