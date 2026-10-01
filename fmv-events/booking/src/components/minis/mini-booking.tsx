'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, formatTime, monctonDateOf } from '@/lib/time';
import { Button, Field, Input, Notice, Textarea } from '@/components/ui';
import { Turnstile } from '@/components/ui/client';
import type { MiniHoldState } from '@/app/(public)/minis/[slug]/actions';

export interface PickerSlot {
  id: string;
  starts_at: string;
  ends_at: string;
  is_open: boolean;
}

type HoldAction = (prev: MiniHoldState, formData: FormData) => Promise<MiniHoldState>;

const REFRESH_MS = 30_000;
const SLOT_GONE_CODES = new Set(['slot_taken', 'slot_past', 'slot_not_found', 'campaign_closed']);

function groupByDate(slots: PickerSlot[]): { date: string; slots: PickerSlot[] }[] {
  const map = new Map<string, PickerSlot[]>();
  for (const s of slots) {
    const d = monctonDateOf(s.starts_at);
    const list = map.get(d);
    if (list) list.push(s);
    else map.set(d, [s]);
  }
  return [...map.entries()].map(([date, list]) => ({ date, slots: list }));
}

/**
 * Slot picker + contact form for one live mini campaign. The slot list is
 * refreshed every 30 s and whenever the window regains focus, so people see
 * spots disappear as others book them. The database is still the final judge
 * (one active booking per slot); a lost race returns `slot_taken`.
 */
export function MiniBooking({
  slug,
  initialSlots,
  holdHours,
  action,
}: {
  slug: string;
  initialSlots: PickerSlot[];
  holdHours: number;
  action: HoldAction;
}) {
  const [slots, setSlots] = React.useState(initialSlots);
  const [closed, setClosed] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = React.useState(false);
  const [contact, setContact] = React.useState({ full_name: '', email: '', phone: '', notes: '' });

  const selectedRef = React.useRef<string | null>(null);
  const requestSeq = React.useRef(0);

  const pick = (id: string) => {
    selectedRef.current = id;
    setSelected(id);
    setNotice(null);
  };

  const refresh = React.useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const res = await fetch(`/api/public/minis/${encodeURIComponent(slug)}/slots`, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (seq !== requestSeq.current) return; // a newer refresh is in flight
      if (res.status === 404) {
        setClosed(true);
        return;
      }
      if (!res.ok) {
        setRefreshFailed(true);
        return;
      }
      const json = (await res.json()) as { v: number; data?: { slots: PickerSlot[] } };
      if (seq !== requestSeq.current || !json.data) return;
      const next = json.data.slots;
      setSlots(next);
      setRefreshFailed(false);
      const cur = selectedRef.current;
      if (cur && !next.some((s) => s.id === cur && s.is_open)) {
        selectedRef.current = null;
        setSelected(null);
        setNotice('Sorry, someone just booked the time you picked. Please choose another one.');
      }
    } catch {
      if (seq === requestSeq.current) setRefreshFailed(true);
    }
  }, [slug]);

  React.useEffect(() => {
    const onFocus = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, REFRESH_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const [state, formAction, pending] = React.useActionState<MiniHoldState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result && !result.ok) {
      if (result.code && SLOT_GONE_CODES.has(result.code)) {
        selectedRef.current = null;
        setSelected(null);
        await refresh();
      }
      // A Turnstile token can only be used once; get a fresh one for the retry.
      window.turnstile?.reset();
    }
    return result;
  }, null);

  const groups = React.useMemo(() => groupByDate(slots), [slots]);
  const openCount = slots.filter((s) => s.is_open).length;
  const selectedSlot = slots.find((s) => s.id === selected) ?? null;
  const errs = state?.fieldErrors ?? {};

  if (closed) {
    return (
      <Notice tone="neutral" className="mt-4" title="Booking for these mini sessions is closed.">
        Please check the other mini sessions or contact us.
      </Notice>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-8">
      <fieldset>
        <legend className="mb-3 text-lg font-semibold text-ink">1. Choose a time</legend>

        {notice && (
          <Notice tone="warn" className="mb-4">
            {notice}
          </Notice>
        )}
        {refreshFailed && (
          <p className="mb-3 text-xs text-ink-soft" role="status">
            Couldn’t refresh the available times. They’ll update again shortly.
          </p>
        )}

        {groups.length === 0 ? (
          <Notice tone="neutral">There are no upcoming times for this campaign.</Notice>
        ) : openCount === 0 ? (
          <Notice tone="neutral" className="mb-4">
            All spots are booked right now. Unpaid holds are released automatically, so check back soon.
          </Notice>
        ) : null}

        <div className="space-y-5">
          {groups.map((g) => (
            <fieldset key={g.date}>
              <legend className="mb-2 font-display text-xl font-semibold text-ink">{formatDate(g.date)}</legend>
              <div className="flex flex-wrap gap-2">
                {g.slots.map((s) => {
                  const checked = selected === s.id;
                  return (
                    <label
                      key={s.id}
                      className={cn(
                        'inline-flex min-w-24 cursor-pointer items-center justify-center rounded-full border px-4 py-2 text-sm font-medium tabular-nums transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-rose-deep has-[:focus-visible]:ring-offset-2',
                        s.is_open
                          ? checked
                            ? 'border-rose-deep bg-rose-deep text-white'
                            : 'border-line bg-white text-ink hover:border-rose-deep hover:text-rose-deep'
                          : 'cursor-not-allowed border-line bg-cream-deep text-ink-soft line-through',
                      )}
                    >
                      <input
                        type="radio"
                        name="slot_id"
                        value={s.id}
                        checked={checked}
                        disabled={!s.is_open || pending}
                        onChange={() => pick(s.id)}
                        className="sr-only"
                        required
                      />
                      {formatTime(s.starts_at)}
                      {!s.is_open && <span className="sr-only"> (booked)</span>}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
        {errs.slot_id && (
          <p role="alert" className="mt-2 text-xs text-bad">
            Please pick an open time.
          </p>
        )}
      </fieldset>

      {openCount > 0 && (
        <fieldset className="space-y-4">
          <legend className="mb-3 text-lg font-semibold text-ink">2. Your details</legend>

          <p className="text-sm text-ink-soft" aria-live="polite">
            {selectedSlot ? (
              <>
                You picked <strong className="text-ink">{formatDateTime(selectedSlot.starts_at)}</strong>.
              </>
            ) : (
              'Pick a time above to continue.'
            )}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="mini-name" required error={errs['contact.full_name']}>
              <Input
                id="mini-name"
                name="full_name"
                autoComplete="name"
                required
                maxLength={120}
                value={contact.full_name}
                onChange={(e) => setContact((c) => ({ ...c, full_name: e.target.value }))}
                aria-invalid={errs['contact.full_name'] ? true : undefined}
                aria-describedby={errs['contact.full_name'] ? 'mini-name-error' : undefined}
              />
            </Field>
            <Field label="Email" htmlFor="mini-email" required error={errs['contact.email']} hint="We’ll send your invoice and confirmation here.">
              <Input
                id="mini-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={contact.email}
                onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                aria-invalid={errs['contact.email'] ? true : undefined}
                aria-describedby={errs['contact.email'] ? 'mini-email-error' : 'mini-email-hint'}
              />
            </Field>
            <Field label="Phone" htmlFor="mini-phone" required error={errs['contact.phone']}>
              <Input
                id="mini-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                required
                value={contact.phone}
                onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
                aria-invalid={errs['contact.phone'] ? true : undefined}
                aria-describedby={errs['contact.phone'] ? 'mini-phone-error' : undefined}
              />
            </Field>
          </div>
          <Field label="Notes (optional)" htmlFor="mini-notes" error={errs.notes} hint="Who’s in the photos, pets, outfit questions…">
            <Textarea
              id="mini-notes"
              name="notes"
              maxLength={1000}
              value={contact.notes}
              onChange={(e) => setContact((c) => ({ ...c, notes: e.target.value }))}
              aria-describedby={errs.notes ? 'mini-notes-error' : 'mini-notes-hint'}
            />
          </Field>

          <Turnstile />

          {state && !state.ok && (
            <Notice tone="bad">{state.error}</Notice>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" size="lg" disabled={pending || !selected}>
              {pending ? 'Holding your spot…' : 'Hold my spot'}
            </Button>
            <p className="text-xs text-ink-soft">
              Your spot is held for {holdHours} {holdHours === 1 ? 'hour' : 'hours'} until payment is received. You’ll go
              straight to the payment page.
            </p>
          </div>
        </fieldset>
      )}
    </form>
  );
}
