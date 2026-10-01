'use client';
// The event builder wizard (spec §5.3-A.1). Mobile-first, keyboard accessible,
// state kept in sessionStorage so a refresh doesn't lose progress.
import * as React from 'react';
import Link from 'next/link';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { computeEstimate } from '@/lib/estimate';
import { formatCAD } from '@/lib/money';
import { Button, ButtonLink } from '@/components/ui';
import { cn } from '@/lib/cn';
import { submitInquiry } from '../actions';
import {
  ISO_DATE,
  LAST_STEP,
  STEPS,
  WALL_TIME,
  buildPayload,
  effectiveSelection,
  flattenFieldErrors,
  initialState,
  loadState,
  saveState,
  stepForErrorKey,
  validateStep,
} from './state';
import {
  StepAddons,
  StepContact,
  StepDetails,
  StepEventType,
  StepHours,
  StepServices,
  StepVenue,
  StepWhen,
  type AvailabilityInfo,
  type Update,
} from './steps';
import { StepReview } from './review';
import type { Errors, ServiceAvailability, WizardProps, WizardState } from './types';

const subscribeNoop = () => () => {};

export function BuildWizard(props: WizardProps) {
  const [queryClient] = React.useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 60_000 } } }),
  );
  // Render the wizard only in the browser: its initial state comes from
  // sessionStorage, which the server can't see.
  const isClient = React.useSyncExternalStore(subscribeNoop, () => true, () => false);
  return (
    <QueryClientProvider client={queryClient}>
      {isClient ? (
        <Wizard {...props} />
      ) : (
        <div className="rounded-[var(--radius-card)] border border-line bg-white p-6 text-sm text-ink-soft" role="status">
          Loading the builder…
        </div>
      )}
    </QueryClientProvider>
  );
}

async function fetchAvailability(date: string, start: string, end: string, signal: AbortSignal): Promise<ServiceAvailability[]> {
  const qs = new URLSearchParams({ date, start, end });
  const res = await fetch(`/api/public/availability?${qs}`, { signal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`availability ${res.status}`);
  const json = (await res.json()) as { v?: number; data?: { services?: unknown } };
  if (json?.v !== 1 || !Array.isArray(json.data?.services)) throw new Error('unexpected availability response');
  return (json.data.services as ServiceAvailability[]).filter(
    (s) => s && typeof s.service_id === 'string' && ['available', 'limited', 'unavailable'].includes(s.status),
  );
}

function Wizard({ catalog, settings, conceptBoards, policies, prefill, packageDescriptions, today }: WizardProps) {
  const [state, setState] = React.useState<WizardState>(() => loadState(prefill, catalog));
  const [attempted, setAttempted] = React.useState<number | null>(null);
  const [serverErrors, setServerErrors] = React.useState<Errors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [turnstileToken, setTurnstileToken] = React.useState('');
  const [done, setDone] = React.useState<{ email: string; name: string } | null>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const didMount = React.useRef(false);

  // Persist progress (cleared once the request is sent).
  React.useEffect(() => {
    saveState(done ? null : state);
  }, [state, done]);

  // Move focus to the step heading whenever the step changes (not on first load).
  React.useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const el = headingRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }, [state.step, done]);

  const update: Update = React.useCallback((patch) => {
    setServerErrors({});
    setFormError(null);
    setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
  }, []);

  // Live availability per service for the chosen date/time.
  const canCheck =
    ISO_DATE.test(state.event_date) &&
    state.event_date >= today &&
    WALL_TIME.test(state.start_time) &&
    WALL_TIME.test(state.end_time) &&
    state.start_time !== state.end_time;
  const availabilityQuery = useQuery({
    queryKey: ['availability', state.event_date, state.start_time, state.end_time],
    queryFn: ({ signal }) => fetchAvailability(state.event_date, state.start_time, state.end_time, signal),
    enabled: canCheck,
  });
  const byService = React.useMemo(
    () => (availabilityQuery.data ? new Map(availabilityQuery.data.map((a) => [a.service_id, a])) : null),
    [availabilityQuery.data],
  );
  const availability: AvailabilityInfo = !canCheck
    ? { status: 'idle', byService: null }
    : availabilityQuery.isError
      ? { status: 'error', byService: null }
      : byService
        ? { status: 'ready', byService }
        : { status: 'loading', byService: null };

  const vctx = { catalog, today, availability: availability.byService };
  const liveErrors = attempted === state.step ? validateStep(state.step, state, vctx) : {};
  const errors: Errors = { ...serverErrors, ...liveErrors };

  const estimate = React.useMemo(
    () =>
      computeEstimate(effectiveSelection(catalog, state.selection), {
        services: catalog.services,
        packages: catalog.packages,
        addons: catalog.addons,
        zones: catalog.zones,
        zoneId: state.zone_id && state.zone_id !== 'unsure' ? state.zone_id : null,
        taxEnabled: settings.tax_enabled,
        taxRateBp: settings.tax_rate_bp,
        depositPct: settings.deposit_pct,
      }),
    [catalog, state.selection, state.zone_id, settings],
  );

  const goTo = (step: number) => {
    setAttempted(null);
    setState((s) => ({ ...s, step, maxStep: Math.max(s.maxStep, step) }));
  };

  async function send() {
    // Re-check every step before sending.
    for (let i = 0; i < LAST_STEP; i++) {
      if (Object.keys(validateStep(i, state, vctx)).length > 0) {
        setAttempted(i);
        setState((s) => ({ ...s, step: i }));
        return;
      }
    }
    if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !turnstileToken) {
      setFormError('Please complete the verification check above the button.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await submitInquiry(buildPayload(state, catalog, turnstileToken || null));
      if (res.ok) {
        setDone({ email: res.data.email, name: state.contact.full_name.split(' ')[0] ?? '' });
        return;
      }
      setFormError(res.error);
      const fe = flattenFieldErrors(res.fieldErrors);
      setServerErrors(fe);
      const keys = Object.keys(fe);
      if (keys.length > 0) {
        const first = Math.min(...keys.map(stepForErrorKey));
        if (first < LAST_STEP) setState((s) => ({ ...s, step: first }));
      }
    } catch {
      setFormError('We couldn’t reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
      // Turnstile tokens are single-use: get a fresh one for a retry.
      setTurnstileToken('');
      try {
        window.turnstile?.reset();
      } catch {
        /* widget not rendered */
      }
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state.step === LAST_STEP) {
      void send();
      return;
    }
    const errs = validateStep(state.step, state, vctx);
    if (Object.keys(errs).length > 0) {
      setAttempted(state.step);
      return;
    }
    goTo(state.step + 1);
  }

  if (done) {
    return (
      <section aria-labelledby="done-heading" className="rounded-[var(--radius-card)] border border-line bg-white p-6 sm:p-8">
        <h2 id="done-heading" ref={headingRef} tabIndex={-1} className="scroll-mt-24 font-display text-3xl font-semibold text-ink outline-none">
          Thank you{done.name ? `, ${done.name}` : ''}! Your request is on its way.
        </h2>
        <p className="mt-3 text-ink">
          We&rsquo;ve emailed a copy to <strong className="font-semibold">{done.email}</strong>.
        </p>
        <div className="mt-4 rounded-xl bg-blush-soft px-4 py-3 text-sm text-ink">
          <p className="font-semibold">No date is held yet.</p>
          <p className="mt-1">
            {settings.owner_name} will review your request and email you a quote. When you accept it, your date is held for{' '}
            {settings.hold_hours} hours while you send the {settings.deposit_pct}% deposit by Interac e-Transfer. Your date is
            confirmed once the deposit is recorded.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/" variant="secondary">Back to home</ButtonLink>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDone(null);
              setAttempted(null);
              setState(initialState(prefill));
            }}
          >
            Start another request
          </Button>
        </div>
      </section>
    );
  }

  const step = STEPS[state.step];
  const showRunningTotal = state.step >= 3 && state.step < LAST_STEP && estimate.lines.length > 0;

  return (
    <div>
      {/* Progress */}
      <div className="mb-6">
        <p className="text-sm font-medium text-ink-soft">
          Step {state.step + 1} of {STEPS.length} <span aria-hidden>·</span> {step.short}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream-deep" aria-hidden>
          <div className="h-full rounded-full bg-rose-deep transition-all" style={{ width: `${((state.step + 1) / STEPS.length) * 100}%` }} />
        </div>
        <nav aria-label="Builder steps" className="mt-3 hidden md:block">
          <ol className="flex flex-wrap gap-1 text-xs">
            {STEPS.map((s, i) => {
              const reachable = i <= state.maxStep;
              const current = i === state.step;
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    disabled={!reachable || current}
                    onClick={() => goTo(i)}
                    aria-current={current ? 'step' : undefined}
                    className={cn(
                      'rounded-full px-3 py-1',
                      current ? 'bg-rose-deep text-white' : reachable ? 'bg-white text-ink ring-1 ring-line hover:ring-rose-deep' : 'text-ink-soft/70',
                    )}
                  >
                    {i + 1}. {s.short}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      <form noValidate onSubmit={onSubmit} aria-labelledby="step-heading">
        <h2
          id="step-heading"
          ref={headingRef}
          tabIndex={-1}
          className="mb-5 scroll-mt-24 font-display text-3xl font-semibold text-ink outline-none sm:text-4xl"
        >
          {step.title}
        </h2>

        {step.key === 'type' && <StepEventType state={state} update={update} errors={errors} catalog={catalog} />}
        {step.key === 'when' && (
          <StepWhen state={state} update={update} errors={errors} catalog={catalog} today={today} availability={availability} />
        )}
        {step.key === 'where' && <StepVenue state={state} update={update} errors={errors} catalog={catalog} />}
        {step.key === 'services' && (
          <StepServices
            state={state}
            update={update}
            errors={errors}
            catalog={catalog}
            availability={availability}
            packageDescriptions={packageDescriptions}
          />
        )}
        {step.key === 'hours' && <StepHours state={state} update={update} errors={errors} catalog={catalog} />}
        {step.key === 'addons' && <StepAddons state={state} update={update} errors={errors} catalog={catalog} />}
        {step.key === 'details' && (
          <StepDetails state={state} update={update} errors={errors} catalog={catalog} conceptBoards={conceptBoards} />
        )}
        {step.key === 'contact' && <StepContact state={state} update={update} errors={errors} catalog={catalog} />}
        {step.key === 'review' && (
          <StepReview
            state={state}
            catalog={catalog}
            settings={settings}
            estimate={estimate}
            policies={policies}
            errors={serverErrors}
            goTo={goTo}
            onToken={setTurnstileToken}
          />
        )}

        {formError && (
          <p role="alert" className="mt-6 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">
            {formError}
          </p>
        )}

        {state.maxStep === LAST_STEP && state.step < LAST_STEP && (
          <p className="mt-6">
            <button
              type="button"
              className="text-sm font-medium text-rose-deep underline"
              onClick={() => {
                if (Object.keys(validateStep(state.step, state, vctx)).length > 0) setAttempted(state.step);
                else goTo(LAST_STEP);
              }}
            >
              Save and return to review
            </button>
          </p>
        )}

        {showRunningTotal && (
          <p className="mt-6 text-sm text-ink-soft" aria-live="polite">
            Running estimate:{' '}
            <strong className="font-semibold tabular-nums text-ink">
              {estimate.hasVariablePricing ? 'from ' : ''}
              {formatCAD(estimate.totals.totalCents)}
            </strong>
          </p>
        )}

        <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center justify-between gap-3 border-t border-line bg-cream/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
          <Button type="button" variant="secondary" onClick={() => goTo(state.step - 1)} disabled={state.step === 0 || submitting}>
            Back
          </Button>
          {state.step === LAST_STEP ? (
            <Button type="submit" size="lg" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send my request'}
            </Button>
          ) : (
            <Button type="submit" size="lg">
              Next
            </Button>
          )}
        </div>
      </form>

      <p className="mt-8 text-sm text-ink-soft">
        Prefer to talk first? <Link href="/contact" className="text-rose-deep underline">Ask us a question</Link>.
      </p>
    </div>
  );
}
