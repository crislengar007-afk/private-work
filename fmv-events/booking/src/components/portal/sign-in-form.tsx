'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button, Field, Input, Notice } from '@/components/ui';

/**
 * Magic-link sign-in for clients. The link lands on /auth/callback, which
 * links the verified email to the client's bookings, quotes and invoices.
 */
export function PortalSignInForm({ redirectTo }: { redirectTo: string }) {
  const [email, setEmail] = React.useState('');
  const [status, setStatus] = React.useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setStatus('error');
      setError('Enter a valid email address.');
      return;
    }
    setStatus('sending');
    setError(null);
    try {
      const sb = createClient();
      const { error: err } = await sb.auth.signInWithOtp({
        email: value,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
      });
      if (err) {
        setStatus('error');
        setError(
          err.status === 429
            ? 'Too many sign-in emails were requested. Please wait a few minutes and try again.'
            : 'We couldn’t send the sign-in link. Please check the address and try again.',
        );
        return;
      }
      setStatus('sent');
    } catch {
      setStatus('error');
      setError('We couldn’t send the sign-in link. Please try again.');
    }
  }

  if (status === 'sent') {
    return (
      <Notice tone="ok" title="Check your email">
        <p className="mt-1">
          We sent a sign-in link to <strong>{email.trim()}</strong>. Open it on this device to see your bookings. The link
          expires after a short while.
        </p>
        <button
          type="button"
          className="mt-3 text-sm font-medium underline"
          onClick={() => {
            setStatus('idle');
            setError(null);
          }}
        >
          Use a different email
        </button>
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field
        label="Email"
        htmlFor="portal-email"
        required
        error={status === 'error' ? error : null}
        hint="Use the email you booked or requested a quote with."
      >
        <Input
          id="portal-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={status === 'error' ? true : undefined}
          aria-describedby={status === 'error' ? 'portal-email-error' : 'portal-email-hint'}
        />
      </Field>
      <Button type="submit" size="lg" disabled={status === 'sending'} className="w-full sm:w-auto">
        {status === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
      </Button>
    </form>
  );
}
