'use client';
import * as React from 'react';
import { SubmitButton } from '@/components/ui/client';
import { reportPaymentAction, type ReportState } from './actions';
import { REPORTED_MESSAGE } from './messages';

export function ReportPaymentButton({ token }: { token: string }) {
  const [state, action] = React.useActionState<ReportState, FormData>(reportPaymentAction, null);
  if (state?.ok) {
    return (
      <p role="status" className="rounded-xl bg-ok-soft px-4 py-3 text-sm text-ok">
        {REPORTED_MESSAGE}
      </p>
    );
  }
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="token" value={token} />
      <SubmitButton size="lg" pendingText="Letting us know…" className="w-full sm:w-auto">
        I&rsquo;ve sent it
      </SubmitButton>
      <p className="text-xs text-ink-soft">Tap this after you send the e-Transfer so we know to look for it.</p>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
    </form>
  );
}
