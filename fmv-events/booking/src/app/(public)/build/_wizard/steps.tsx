'use client';
// Steps 1–8 of the builder. Pure presentational components driven by the
// wizard's state; every input has a label and inline error.
import * as React from 'react';
import type { PublicCatalog, PublicPackage, PublicService } from '@/lib/catalog';
import { EVENT_TYPES, eventTypeLabels } from '@/lib/schemas';
import { formatCAD } from '@/lib/money';
import { durationHours, formatDate, formatWallTime } from '@/lib/time';
import { Badge, Field, Input, Notice, Select, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import { eligibleAddons, packageServiceIds, servicePriceLabel, zoneFeeLabel } from './state';
import { ReferenceUploads } from './uploads';
import type { ConceptBoard, Errors, ServiceAvailability, WizardState } from './types';

export type Update = (patch: Partial<WizardState> | ((s: WizardState) => Partial<WizardState>)) => void;

export interface AvailabilityInfo {
  status: 'idle' | 'loading' | 'error' | 'ready';
  byService: Map<string, ServiceAvailability> | null;
}

interface StepProps {
  state: WizardState;
  update: Update;
  errors: Errors;
  catalog: PublicCatalog;
}

const describedBy = (id: string, errors: Errors, key: string, hint = false) =>
  errors[key] ? `${id}-error` : hint ? `${id}-hint` : undefined;

// ---------------------------------------------------------------- 1. event type
export function StepEventType({ state, update, errors }: StepProps) {
  return (
    <fieldset aria-describedby={errors.event_type ? 'event_type-error' : undefined}>
      <legend className="sr-only">Event type</legend>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3">
        {EVENT_TYPES.map((t) => {
          const checked = state.event_type === t;
          return (
            <label
              key={t}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl border bg-white px-4 py-4 text-base transition-colors focus-within:ring-2 focus-within:ring-rose-deep',
                checked ? 'border-rose-deep bg-blush-soft font-semibold' : 'border-line hover:border-rose',
              )}
            >
              <input
                type="radio"
                name="event_type"
                value={t}
                checked={checked}
                onChange={() => update({ event_type: t })}
                className="h-4 w-4 accent-rose-deep"
              />
              {eventTypeLabels[t]}
            </label>
          );
        })}
      </div>
      {errors.event_type && (
        <p id="event_type-error" role="alert" className="mt-2 text-sm text-bad">{errors.event_type}</p>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------- 2. date + time + availability
export function StepWhen({
  state,
  update,
  errors,
  catalog,
  today,
  availability,
}: StepProps & { today: string; availability: AvailabilityInfo }) {
  const hasTimes = /^\d\d:\d\d$/.test(state.start_time) && /^\d\d:\d\d$/.test(state.end_time) && state.start_time !== state.end_time;
  const hours = hasTimes ? durationHours(state.start_time, state.end_time) : null;
  const overnight = hasTimes && state.end_time < state.start_time;
  return (
    <div className="space-y-5">
      <Field label="Event date" htmlFor="event_date" required error={errors.event_date}>
        <Input
          id="event_date"
          type="date"
          min={today}
          value={state.event_date}
          onChange={(e) => update({ event_date: e.target.value })}
          aria-invalid={Boolean(errors.event_date)}
          aria-describedby={describedBy('event_date', errors, 'event_date')}
          required
          className="max-w-xs"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <Field label="Start time" htmlFor="start_time" required error={errors.start_time}>
          <Input
            id="start_time"
            type="time"
            step={900}
            value={state.start_time}
            onChange={(e) => update({ start_time: e.target.value.slice(0, 5) })}
            aria-invalid={Boolean(errors.start_time)}
            aria-describedby={describedBy('start_time', errors, 'start_time')}
            required
          />
        </Field>
        <Field label="End time" htmlFor="end_time" required error={errors.end_time}>
          <Input
            id="end_time"
            type="time"
            step={900}
            value={state.end_time}
            onChange={(e) => update({ end_time: e.target.value.slice(0, 5) })}
            aria-invalid={Boolean(errors.end_time)}
            aria-describedby={describedBy('end_time', errors, 'end_time')}
            required
          />
        </Field>
      </div>
      {hours !== null && (
        <p className="text-sm text-ink-soft">
          {formatWallTime(state.start_time)} to {formatWallTime(state.end_time)}
          {overnight ? ' (ends the next day)' : ''} · {hours} {hours === 1 ? 'hour' : 'hours'}
        </p>
      )}
      <AvailabilitySummary state={state} catalog={catalog} availability={availability} />
    </div>
  );
}

function AvailabilitySummary({
  state,
  catalog,
  availability,
}: {
  state: WizardState;
  catalog: PublicCatalog;
  availability: AvailabilityInfo;
}) {
  if (availability.status === 'idle') {
    return <p className="text-sm text-ink-soft">Pick a date and times to check availability.</p>;
  }
  if (availability.status === 'loading') {
    return (
      <p role="status" className="text-sm text-ink-soft">
        Checking availability…
      </p>
    );
  }
  if (availability.status === 'error' || !availability.byService) {
    return (
      <Notice tone="warn" title="We couldn’t check availability just now">
        You can keep going. We&rsquo;ll confirm availability for {state.event_date ? formatDate(state.event_date) : 'your date'} in your quote.
      </Notice>
    );
  }
  const list = catalog.services
    .map((s) => ({ s, a: availability.byService!.get(s.id) }))
    .filter((x): x is { s: PublicService; a: ServiceAvailability } => Boolean(x.a));
  const notAvailable = list.filter((x) => x.a.status !== 'available');
  return (
    <section aria-live="polite" aria-label="Availability" className="rounded-xl border border-line bg-white p-4">
      <h3 className="font-display text-lg font-semibold text-ink">Availability on {formatDate(state.event_date)}</h3>
      {notAvailable.length === 0 ? (
        <p className="mt-1 text-sm text-ok">Good news: everything is available at that time.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-soft">Most things are free. A few need a note:</p>
          <ul className="mt-2 space-y-2 text-sm">
            {notAvailable.map(({ s, a }) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={a.status === 'unavailable' ? 'bad' : 'warn'}>{a.status === 'unavailable' ? 'Unavailable' : 'Limited'}</Badge>
                <span className={cn(a.status === 'unavailable' && 'text-ink-soft line-through decoration-ink-soft/50')}>{s.name}</span>
                {a.reason && <span className="text-ink-soft">· {a.reason}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-2 text-xs text-ink-soft">Nothing is reserved until you accept your quote.</p>
    </section>
  );
}

// ---------------------------------------------------------------- 3. venue + zone
export function StepVenue({ state, update, errors, catalog }: StepProps) {
  const zone = catalog.zones.find((z) => z.id === state.zone_id);
  return (
    <div className="space-y-5">
      <Field label="Venue name" htmlFor="venue_name" hint="Leave blank if you haven’t chosen one yet." error={errors.venue_name}>
        <Input
          id="venue_name"
          value={state.venue_name}
          maxLength={200}
          autoComplete="organization"
          onChange={(e) => update({ venue_name: e.target.value })}
          aria-describedby={describedBy('venue_name', errors, 'venue_name', true)}
        />
      </Field>
      <Field label="Venue address" htmlFor="venue_address" error={errors.venue_address}>
        <Input
          id="venue_address"
          value={state.venue_address}
          maxLength={300}
          autoComplete="street-address"
          onChange={(e) => update({ venue_address: e.target.value })}
          aria-describedby={describedBy('venue_address', errors, 'venue_address')}
        />
      </Field>
      {catalog.zones.length > 0 && (
        <Field label="Area" htmlFor="zone_id" hint="Used for travel. Pick the closest match." error={errors.zone_id}>
          <Select
            id="zone_id"
            value={state.zone_id}
            onChange={(e) => update({ zone_id: e.target.value })}
            aria-describedby={describedBy('zone_id', errors, 'zone_id', true)}
          >
            <option value="">Choose an area…</option>
            {catalog.zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name} ({zoneFeeLabel(z.travel_fee_cents)})
              </option>
            ))}
            <option value="unsure">Not sure yet</option>
          </Select>
        </Field>
      )}
      {zone && (
        <p className="rounded-xl bg-cream-deep px-4 py-3 text-sm text-ink">
          <strong className="font-semibold">{zone.name}:</strong>{' '}
          {zone.travel_fee_cents === null
            ? 'the travel fee is confirmed in your quote.'
            : zone.travel_fee_cents === 0
              ? 'travel is included.'
              : `travel fee ${formatCAD(zone.travel_fee_cents)}.`}
          {zone.description && <span className="mt-1 block text-ink-soft">{zone.description}</span>}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 4. package or services
function packageBlocked(pkg: PublicPackage, availability: AvailabilityInfo, catalog: PublicCatalog): string | null {
  if (!availability.byService) return null;
  for (const item of pkg.items) {
    const a = availability.byService.get(item.service_id);
    if (a?.status === 'unavailable') {
      const name = catalog.services.find((s) => s.id === item.service_id)?.name ?? 'An included item';
      return `${name} is unavailable${a.reason ? `: ${a.reason}` : ''}`;
    }
  }
  return null;
}

export function StepServices({
  state,
  update,
  errors,
  catalog,
  availability,
  packageDescriptions,
}: StepProps & { availability: AvailabilityInfo; packageDescriptions: Record<string, string> }) {
  const covered = packageServiceIds(catalog, state.selection.package_id);
  const serviceName = (id: string) => catalog.services.find((s) => s.id === id)?.name ?? 'Service';
  const packages = [...catalog.packages].sort(
    (a, b) => Number(b.event_type === state.event_type) - Number(a.event_type === state.event_type) || a.sort - b.sort,
  );

  const setPackage = (id: string | null) => update((s) => ({ selection: { ...s.selection, package_id: id } }));
  const toggleService = (svc: PublicService, on: boolean) =>
    update((s) => {
      const ids = new Set(s.selection.service_ids);
      const hours = { ...s.selection.hours };
      const qty = { ...s.selection.qty };
      if (on) {
        ids.add(svc.id);
        if (svc.price_mode === 'per_hour' && hours[svc.id] === undefined) hours[svc.id] = svc.min_hours ?? 1;
        if (svc.price_mode === 'per_item' && qty[svc.id] === undefined) qty[svc.id] = 1;
      } else ids.delete(svc.id);
      return { selection: { ...s.selection, service_ids: [...ids], hours, qty } };
    });

  return (
    <div className="space-y-8">
      {errors.selection && (
        <p id="selection-error" role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">
          {errors.selection}
        </p>
      )}
      {availability.status === 'error' && (
        <Notice tone="warn">We couldn&rsquo;t check availability. We&rsquo;ll confirm it in your quote.</Notice>
      )}

      {packages.length > 0 && (
        <fieldset>
          <legend className="font-display text-xl font-semibold text-ink">Packages</legend>
          <p className="text-sm text-ink-soft">Bundles of our most-booked services. You can add more services below.</p>
          <div className="mt-3 grid gap-3">
            <label
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 focus-within:ring-2 focus-within:ring-rose-deep',
                !state.selection.package_id ? 'border-rose-deep bg-blush-soft' : 'border-line',
              )}
            >
              <input
                type="radio"
                name="package"
                checked={!state.selection.package_id}
                onChange={() => setPackage(null)}
                className="mt-1 h-4 w-4 accent-rose-deep"
              />
              <span className="font-medium">No package: I&rsquo;ll pick services one by one</span>
            </label>
            {packages.map((p) => {
              const blocked = packageBlocked(p, availability, catalog);
              const checked = state.selection.package_id === p.id;
              const descId = `pkg-${p.id}-desc`;
              return (
                <label
                  key={p.id}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border bg-white p-4 focus-within:ring-2 focus-within:ring-rose-deep',
                    checked ? 'border-rose-deep bg-blush-soft' : 'border-line',
                    blocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                  )}
                >
                  <input
                    type="radio"
                    name="package"
                    checked={checked}
                    disabled={Boolean(blocked) && !checked}
                    onChange={() => setPackage(p.id)}
                    aria-describedby={descId}
                    className="mt-1 h-4 w-4 accent-rose-deep"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-semibold text-ink">{p.name}</span>
                      <span className="font-semibold tabular-nums text-rose-deep">
                        {p.price_cents === null ? 'Priced in your quote' : formatCAD(p.price_cents)}
                      </span>
                    </span>
                    <span id={descId} className="block text-sm text-ink-soft">
                      {p.ala_carte_cents > 0 && (
                        <span className="block">
                          À la carte value {p.ala_carte_is_from ? 'from ' : ''}
                          <span className="tabular-nums">{formatCAD(p.ala_carte_cents)}</span>
                        </span>
                      )}
                      <span className="block">Includes: {p.items.map((i) => serviceName(i.service_id)).join(' · ')}</span>
                      {p.event_type === state.event_type && state.event_type && (
                        <Badge tone="rose" className="mt-1">Suggested for your event</Badge>
                      )}
                      {blocked && <span className="mt-1 block font-medium text-bad">{blocked}</span>}
                    </span>
                    {packageDescriptions[p.id] && (
                      <span
                        className="prose-fmv mt-1 block text-sm text-ink-soft"
                        dangerouslySetInnerHTML={{ __html: packageDescriptions[p.id] }}
                      />
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {catalog.categories.map((cat) => {
        const services = catalog.services.filter((s) => s.category_id === cat.id);
        if (services.length === 0) return null;
        return (
          <fieldset key={cat.id}>
            <legend className="font-display text-xl font-semibold text-ink">{cat.name}</legend>
            <div className="mt-3 grid gap-3">
              {services.map((s) => {
                const a = availability.byService?.get(s.id);
                const inPackage = covered.has(s.id);
                const checked = inPackage || state.selection.service_ids.includes(s.id);
                const unavailable = a?.status === 'unavailable';
                const disabled = inPackage || (unavailable && !checked);
                const descId = `svc-${s.id}-desc`;
                return (
                  <label
                    key={s.id}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border bg-white p-4 focus-within:ring-2 focus-within:ring-rose-deep',
                      checked && !unavailable ? 'border-rose-deep bg-blush-soft' : 'border-line',
                      unavailable && 'border-bad/40',
                      disabled ? 'cursor-not-allowed' : 'cursor-pointer',
                      unavailable && 'opacity-60',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={(e) => toggleService(s, e.target.checked)}
                      aria-describedby={descId}
                      className="mt-1 h-4 w-4 accent-rose-deep"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-semibold text-ink">{s.name}</span>
                        <span className="text-sm tabular-nums text-rose-deep">{servicePriceLabel(s)}</span>
                      </span>
                      <span id={descId} className="block text-sm text-ink-soft">
                        {s.short_desc && <span className="block">{s.short_desc}</span>}
                        {inPackage && <span className="block font-medium text-ok">Included in your package</span>}
                        {a && a.status !== 'available' && (
                          <span className={cn('mt-1 flex flex-wrap items-center gap-2', unavailable ? 'text-bad' : 'text-warn')}>
                            <Badge tone={unavailable ? 'bad' : 'warn'}>{unavailable ? 'Unavailable' : 'Limited'}</Badge>
                            {a.reason ?? (unavailable ? 'Booked at that time' : 'Only a little left at that time')}
                          </span>
                        )}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      <p className="text-sm text-ink-soft">Digital photos are included with every photography service. Prints and albums are add-ons.</p>
    </div>
  );
}

// ---------------------------------------------------------------- 5. hours / quantities
export function NumberStepper({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  error,
  hint,
  onChange,
}: {
  id: string;
  label: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  error?: string;
  hint?: React.ReactNode;
  onChange: (n: number) => void;
}) {
  const [text, setText] = React.useState(String(value));
  const set = (n: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round(n / step) * step));
    setText(String(clamped));
    onChange(clamped);
  };
  const btn =
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-white text-lg text-ink hover:border-rose-deep disabled:opacity-40';
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} onClick={() => set(value - step)} disabled={value <= min} aria-label={`Decrease ${unit ?? 'amount'}`}>
          −
        </button>
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== '' && Number.isFinite(n)) onChange(n);
          }}
          onBlur={() => set(Number.isFinite(Number(text)) && text !== '' ? Number(text) : value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className="w-24 text-center"
        />
        <button type="button" className={btn} onClick={() => set(value + step)} disabled={value >= max} aria-label={`Increase ${unit ?? 'amount'}`}>
          +
        </button>
        {unit && <span className="text-sm text-ink-soft">{unit}</span>}
      </div>
    </Field>
  );
}

export function StepHours({ state, update, errors, catalog }: StepProps) {
  const covered = packageServiceIds(catalog, state.selection.package_id);
  const pkg = catalog.packages.find((p) => p.id === state.selection.package_id);
  const chosen = state.selection.service_ids
    .filter((id) => !covered.has(id))
    .map((id) => catalog.services.find((s) => s.id === id))
    .filter((s): s is PublicService => Boolean(s));
  const eventHours =
    /^\d\d:\d\d$/.test(state.start_time) && /^\d\d:\d\d$/.test(state.end_time) && state.start_time !== state.end_time
      ? durationHours(state.start_time, state.end_time)
      : null;
  const setHours = (id: string, n: number) => update((s) => ({ selection: { ...s.selection, hours: { ...s.selection.hours, [id]: n } } }));
  const setQty = (id: string, n: number) => update((s) => ({ selection: { ...s.selection, qty: { ...s.selection.qty, [id]: n } } }));

  return (
    <div className="space-y-6">
      {eventHours !== null && (
        <p className="text-sm text-ink-soft">
          Your event runs {eventHours} {eventHours === 1 ? 'hour' : 'hours'}.
        </p>
      )}
      {pkg && (
        <div className="rounded-xl border border-line bg-white p-4">
          <h3 className="font-semibold text-ink">Included in {pkg.name}</h3>
          <ul className="mt-1 list-disc pl-5 text-sm text-ink-soft">
            {pkg.items.map((i) => {
              const s = catalog.services.find((x) => x.id === i.service_id);
              if (!s) return null;
              const amount =
                s.price_mode === 'per_hour'
                  ? ` (${i.qty} hr)`
                  : s.price_mode === 'per_item'
                    ? ` (×${i.qty})`
                    : s.included_hours
                      ? ` (${s.included_hours} hr included)`
                      : '';
              return <li key={i.service_id}>{s.name}{amount}</li>;
            })}
          </ul>
          <p className="mt-2 text-xs text-ink-soft">Need more time? Add an extra hour on the next step.</p>
        </div>
      )}
      {chosen.length === 0 && !pkg && <p className="text-sm text-ink-soft">Nothing to adjust here.</p>}
      {chosen.map((s) => {
        if (s.price_mode === 'per_hour') {
          const min = s.min_hours ?? 0.5;
          const v = state.selection.hours[s.id] ?? min;
          return (
            <NumberStepper
              key={s.id}
              id={`hours-${s.id}`}
              label={s.name}
              value={v}
              min={min}
              max={24}
              step={0.5}
              unit="hours"
              hint={`${servicePriceLabel(s)} · ${formatCAD(Math.round(v * (s.price_cents ?? 0)))} for ${v} hr`}
              error={errors[`selection.hours.${s.id}`]}
              onChange={(n) => setHours(s.id, n)}
            />
          );
        }
        if (s.price_mode === 'per_item') {
          const v = state.selection.qty[s.id] ?? 1;
          return (
            <NumberStepper
              key={s.id}
              id={`qty-${s.id}`}
              label={s.name}
              value={v}
              min={1}
              max={500}
              step={1}
              unit="items"
              hint={servicePriceLabel(s)}
              error={errors[`selection.qty.${s.id}`]}
              onChange={(n) => setQty(s.id, n)}
            />
          );
        }
        return (
          <div key={s.id} className="rounded-xl border border-line bg-white p-4 text-sm">
            <p className="font-semibold text-ink">{s.name}</p>
            <p className="text-ink-soft">
              {s.included_hours
                ? `${s.included_hours} ${s.included_hours === 1 ? 'hour' : 'hours'} included · ${servicePriceLabel(s)}`
                : s.price_mode === 'from'
                  ? `${servicePriceLabel(s)}. The final price depends on your details and is confirmed in your quote.`
                  : `${servicePriceLabel(s)} flat rate`}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- 6. add-ons
export function StepAddons({ state, update, errors, catalog }: StepProps) {
  const addons = eligibleAddons(catalog, state.selection);
  const toggle = (id: string, mode: string, on: boolean) =>
    update((s) => {
      const ids = new Set(s.selection.addon_ids);
      const hours = { ...s.selection.hours };
      const qty = { ...s.selection.qty };
      if (on) {
        ids.add(id);
        if (mode === 'per_hour' && hours[id] === undefined) hours[id] = 1;
        if (mode === 'per_item' && qty[id] === undefined) qty[id] = 1;
      } else ids.delete(id);
      return { selection: { ...s.selection, addon_ids: [...ids], hours, qty } };
    });
  if (addons.length === 0) {
    return <p className="text-sm text-ink-soft">No add-ons for these services right now. You can mention extras in your notes on the next step.</p>;
  }
  return (
    <fieldset className="grid gap-3">
      <legend className="sr-only">Add-ons</legend>
      {addons.map((a) => {
        const checked = state.selection.addon_ids.includes(a.id);
        return (
          <div
            key={a.id}
            className={cn('rounded-xl border bg-white p-4', checked ? 'border-rose-deep bg-blush-soft' : 'border-line')}
          >
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => toggle(a.id, a.price_mode, e.target.checked)}
                aria-describedby={a.description ? `addon-${a.id}-desc` : undefined}
                className="mt-1 h-4 w-4 accent-rose-deep"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-semibold text-ink">{a.name}</span>
                  <span className="text-sm tabular-nums text-rose-deep">
                    {servicePriceLabel({ price_cents: a.price_cents, price_mode: a.price_mode, min_hours: null, included_hours: null })}
                  </span>
                </span>
                {a.description && (
                  <span id={`addon-${a.id}-desc`} className="block text-sm text-ink-soft">
                    {a.description}
                  </span>
                )}
              </span>
            </label>
            {checked && a.price_mode === 'per_hour' && (
              <div className="mt-3 pl-7">
                <NumberStepper
                  id={`hours-${a.id}`}
                  label="Hours"
                  value={state.selection.hours[a.id] ?? 1}
                  min={0.5}
                  max={24}
                  step={0.5}
                  unit="hours"
                  error={errors[`selection.hours.${a.id}`]}
                  onChange={(n) => update((s) => ({ selection: { ...s.selection, hours: { ...s.selection.hours, [a.id]: n } } }))}
                />
              </div>
            )}
            {checked && a.price_mode === 'per_item' && (
              <div className="mt-3 pl-7">
                <NumberStepper
                  id={`qty-${a.id}`}
                  label="Quantity"
                  value={state.selection.qty[a.id] ?? 1}
                  min={1}
                  max={500}
                  step={1}
                  unit="items"
                  error={errors[`selection.qty.${a.id}`]}
                  onChange={(n) => update((s) => ({ selection: { ...s.selection, qty: { ...s.selection.qty, [a.id]: n } } }))}
                />
              </div>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}

// ---------------------------------------------------------------- 7. theme / notes / guests / photos
export function StepDetails({ state, update, errors, conceptBoards }: StepProps & { conceptBoards: ConceptBoard[] }) {
  return (
    <div className="space-y-5">
      <Field label="Approximate number of guests" htmlFor="guest_count" error={errors.guest_count}>
        <Input
          id="guest_count"
          inputMode="numeric"
          pattern="[0-9]*"
          value={state.guest_count}
          maxLength={5}
          onChange={(e) => update({ guest_count: e.target.value.replace(/[^\d]/g, '') })}
          aria-invalid={Boolean(errors.guest_count)}
          aria-describedby={describedBy('guest_count', errors, 'guest_count')}
          className="max-w-[10rem]"
        />
      </Field>
      <Field label="Theme or colours" htmlFor="theme" hint="For example: blush and gold, rustic fall, under the sea." error={errors.theme}>
        <Input
          id="theme"
          value={state.theme}
          maxLength={200}
          onChange={(e) => update({ theme: e.target.value })}
          aria-describedby={describedBy('theme', errors, 'theme', true)}
        />
      </Field>
      <Field label="Anything else we should know?" htmlFor="notes" hint="Timeline, must-have shots, rentals for the tables, questions…" error={errors.notes}>
        <Textarea
          id="notes"
          value={state.notes}
          maxLength={3000}
          rows={5}
          onChange={(e) => update({ notes: e.target.value })}
          aria-describedby={describedBy('notes', errors, 'notes', true)}
        />
      </Field>
      <ReferenceUploads
        references={state.references}
        onChange={(references) => update({ references })}
        error={errors.reference_paths}
      />
      {conceptBoards.length > 0 && (
        <section aria-labelledby="concepts-heading" className="pt-2">
          <h3 id="concepts-heading" className="font-display text-xl font-semibold text-ink">Need ideas?</h3>
          <p className="text-sm text-ink-soft">A few mood boards to spark your theme.</p>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {conceptBoards.map((b) => (
              <li key={b.id}>
                <figure className="overflow-hidden rounded-xl border border-line bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element -- storage URLs may be on any host */}
                  <img src={b.url} alt={b.alt || `${b.theme} concept board`} loading="lazy" className="aspect-square w-full object-cover" />
                  <figcaption className="px-3 py-2 text-xs">
                    <span className="block font-semibold text-ink">{b.theme}</span>
                    <span className="block text-ink-soft">Concept inspiration, not a past FMV event</span>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 8. contact
export function StepContact({ state, update, errors }: StepProps) {
  const set = (k: keyof WizardState['contact'], v: string) => update((s) => ({ contact: { ...s.contact, [k]: v } }));
  return (
    <div className="space-y-5 sm:max-w-md">
      <Field label="Full name" htmlFor="full_name" required error={errors['contact.full_name']}>
        <Input
          id="full_name"
          autoComplete="name"
          value={state.contact.full_name}
          maxLength={120}
          onChange={(e) => set('full_name', e.target.value)}
          aria-invalid={Boolean(errors['contact.full_name'])}
          aria-describedby={errors['contact.full_name'] ? 'full_name-error' : undefined}
          required
        />
      </Field>
      <Field label="Email" htmlFor="email" required hint="We’ll send your quote here." error={errors['contact.email']}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={state.contact.email}
          maxLength={200}
          onChange={(e) => set('email', e.target.value)}
          aria-invalid={Boolean(errors['contact.email'])}
          aria-describedby={errors['contact.email'] ? 'email-error' : 'email-hint'}
          required
        />
      </Field>
      <Field label="Phone" htmlFor="phone" required hint="For example 506-555-0123." error={errors['contact.phone']}>
        <Input
          id="phone"
          type="tel"
          autoComplete="tel"
          value={state.contact.phone}
          maxLength={40}
          onChange={(e) => set('phone', e.target.value)}
          aria-invalid={Boolean(errors['contact.phone'])}
          aria-describedby={errors['contact.phone'] ? 'phone-error' : 'phone-hint'}
          required
        />
      </Field>
    </div>
  );
}
