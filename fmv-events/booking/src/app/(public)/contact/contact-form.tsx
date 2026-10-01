'use client';
import * as React from 'react';
import Link from 'next/link';
import { Field, Input, Textarea } from '@/components/ui';
import { SubmitButton, Turnstile } from '@/components/ui/client';
import { sendMessageAction, type MessageState } from './actions';

export function ContactForm() {
  const [state, action] = React.useActionState<MessageState, FormData>(sendMessageAction, null);
  const failed = state && !state.ok ? state : null;
  const err = (k: string) => failed?.fieldErrors?.[k]?.[0];
  const v = failed?.values;
  const describe = (id: string, hint = false) => (err(id) ? `${id}-error` : hint ? `${id}-hint` : undefined);

  // Turnstile tokens are single-use: after a failed send, fetch a fresh one.
  React.useEffect(() => {
    if (!failed) return;
    try {
      window.turnstile?.reset();
    } catch {
      /* widget not rendered (no site key) */
    }
  }, [failed]);

  if (state?.ok) {
    return (
      <div role="status" className="rounded-xl bg-ok-soft px-5 py-4 text-ok">
        <p className="font-semibold">Thanks, your question is on its way!</p>
        <p className="mt-1 text-sm">We&rsquo;ll reply by email (or phone, if you left a number) as soon as we can.</p>
        <p className="mt-3 text-sm text-ink">
          Planning an event? <Link href="/build" className="font-semibold text-rose-deep underline">Build it and get an estimate</Link>.
        </p>
      </div>
    );
  }

  return (
    <form action={action} noValidate className="space-y-4">
      <Field label="Your name" htmlFor="full_name" required error={err('full_name')}>
        <Input
          id="full_name"
          name="full_name"
          autoComplete="name"
          maxLength={120}
          required
          defaultValue={v?.full_name}
          aria-invalid={Boolean(err('full_name'))}
          aria-describedby={describe('full_name')}
        />
      </Field>
      <Field label="Email" htmlFor="email" required error={err('email')}>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={200}
          required
          defaultValue={v?.email}
          aria-invalid={Boolean(err('email'))}
          aria-describedby={describe('email')}
        />
      </Field>
      <Field label="Phone (optional)" htmlFor="phone" hint="If you’d like a call back." error={err('phone')}>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          maxLength={40}
          defaultValue={v?.phone}
          aria-invalid={Boolean(err('phone'))}
          aria-describedby={describe('phone', true)}
        />
      </Field>
      <Field label="Your question" htmlFor="body" required error={err('body')}>
        <Textarea
          id="body"
          name="body"
          rows={5}
          maxLength={3000}
          required
          defaultValue={v?.body}
          aria-invalid={Boolean(err('body'))}
          aria-describedby={describe('body')}
        />
      </Field>
      <Turnstile />
      {failed && !failed.fieldErrors && (
        <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">
          {failed.error}
        </p>
      )}
      <SubmitButton pendingText="Sending…">Send question</SubmitButton>
    </form>
  );
}
