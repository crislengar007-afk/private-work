/** Matching and validation rules (SPEC §4). Shared by server and tests; the
 *  browser script mirrors validateSelection for instant feedback only. */

export type SelectionCheck =
  | { ok: true; digits: string; canonical: string }
  | { ok: false; error: string; code: 'FORMAT' | 'REPEATED' };

export function validateSelection(input: unknown): SelectionCheck {
  if (typeof input !== 'string' || !/^[0-9]{3}$/.test(input)) {
    return { ok: false, code: 'FORMAT', error: 'Pili ng 3 magkakaibang digit (0–9). Exactly three digits are required.' };
  }
  if (new Set(input).size !== 3) {
    return {
      ok: false,
      code: 'REPEATED',
      error: 'Bawal ang umuulit na digit. Entries like 112, 555 or 101 are not valid — choose 3 different digits.',
    };
  }
  return { ok: true, digits: input, canonical: canonicalKey(input) };
}

export function canonicalKey(digits: string): string {
  return [...digits].sort().join('');
}

export type ResultCheck = { ok: true; result: string } | { ok: false; error: string; code: 'FORMAT' | 'REPEATED' };

/** Owner rule (6 Oct 2026): a result is six DIFFERENT digits — no digit repeats. */
export function validateResult(input: unknown): ResultCheck {
  if (typeof input !== 'string' || !/^[0-9]{6}$/.test(input)) {
    return { ok: false, code: 'FORMAT', error: 'The result must be exactly six digits (0–9).' };
  }
  if (new Set(input).size !== 6) {
    return { ok: false, code: 'REPEATED', error: 'Bawal ang umuulit na numero sa result. All six digits must be different (e.g. 847123).' };
  }
  return { ok: true, result: input };
}

export function isValidResult(input: unknown): input is string {
  return validateResult(input).ok;
}

export interface MatchResult {
  won: boolean;
  matched: string[];
  missing: string[];
}

/** Win when ALL three selected digits appear anywhere in the six-digit result.
 *  Order, position and adjacency do not matter. New results must have six
 *  different digits (validateResult); matching itself only needs six digits so
 *  results stored before that rule can still be re-read. */
export function matchEntry(entryDigits: string, result: string): MatchResult {
  const sel = validateSelection(entryDigits);
  if (!sel.ok) throw new Error(`invalid entry: ${sel.error}`);
  if (!/^[0-9]{6}$/.test(result)) throw new Error('result must be exactly six ASCII digits');
  const resultDigits = new Set(result);
  const matched = [...entryDigits].filter((d) => resultDigits.has(d));
  const missing = [...entryDigits].filter((d) => !resultDigits.has(d));
  return { won: missing.length === 0, matched, missing };
}

export function permutations(digits: string): string[] {
  const [a, b, c] = digits;
  return [...new Set([a + b + c, a + c + b, b + a + c, b + c + a, c + a + b, c + b + a])];
}
