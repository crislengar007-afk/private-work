'use client';
import * as React from 'react';
import Link from 'next/link';
import { Field, Input } from '@/components/ui';
import { SubmitButton } from '@/components/ui/client';
import { acceptQuoteAction, type AcceptState } from './actions';

export function AcceptForm({ token, depositLabel, holdHours }: { token: string; depositLabel: string; holdHours: number | null }) {
  const [state, action] = React.useActionState<AcceptState, FormData>(acceptQuoteAction, null);
  const nameErr = state?.fieldErrors?.accepted_name?.[0];
  const agreeErr = state?.fieldErrors?.agree?.[0];
  const dateGone = state?.code === 'item_unavailable' || state?.code === 'date_unavailable' || state?.code === '23P01';

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <Field label="Type your full name to sign" htmlFor="accepted_name" required error={nameErr}>
        <Input
          id="accepted_name"
          name="accepted_name"
          autoComplete="name"
          maxLength={120}
          required
          defaultValue={state?.name}
          aria-invalid={Boolean(nameErr)}
          aria-describedby={nameErr ? 'accepted_name-error' : undefined}
          className="font-display text-lg"
        />
      </Field>
      <div>
        <label className="flex items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            name="agree"
            required
            aria-invalid={Boolean(agreeErr)}
            aria-describedby={agreeErr ? 'agree-error' : undefined}
            className="mt-0.5 h-4 w-4 accent-rose-deep"
          />
          <span>I agree to the policies above</span>
        </label>
        {agreeErr && (
          <p id="agree-error" role="alert" className="mt-1 text-xs text-bad">
            {agreeErr}
          </p>
        )}
      </div>

      {state?.error && !state.fieldErrors && (
        <div role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">
          <p>{state.error}</p>
          {dateGone && (
            <p className="mt-2">
              <Link href="/build" className="font-semibold underline">
                Pick another date in the builder
              </Link>{' '}
              or reply to your quote email and we&rsquo;ll suggest alternatives.
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-ink-soft">
        Accepting {holdHours ? `holds your date for ${holdHours} hours and ` : ''}creates your deposit invoice for {depositLabel}. Your date is
        confirmed once the deposit is recorded.
      </p>
      <SubmitButton size="lg" pendingText="Accepting…">
        Accept quote
      </SubmitButton>
    </form>
  );
}
