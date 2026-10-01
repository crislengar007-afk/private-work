import type { ActionResult } from '@/lib/errors';

/** State shape for admin forms bound to server actions with useActionState. */
export type FormState = ActionResult<unknown> | null;

export type FormAction = (prev: FormState, formData: FormData) => Promise<FormState>;

/** FormData -> plain object of string values (drops React's $ACTION_ keys). */
export function formFields(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === 'string' && !k.startsWith('$ACTION')) out[k] = v;
  });
  return out;
}

/** What the quote editor sends to saveQuoteDraft (prices as typed, in dollars). */
export interface QuoteEditorInput {
  quote_id: string;
  lines: { kind: string; ref_id: string | null; description: string; qty: string; unit_price: string }[];
  discount: string;
  valid_until: string;
  deposit_pct: string;
  notes_md: string;
}

