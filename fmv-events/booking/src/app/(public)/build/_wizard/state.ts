// Pure helpers for the builder wizard: initial/restored state, per-step
// validation, derived selections and the server-action payload.
import type { PublicCatalog, PublicService } from '@/lib/catalog';
import { emptySelection, type Selection } from '@/lib/estimate';
import { contactSchema, EVENT_TYPES, type InquiryInput } from '@/lib/schemas';
import { formatCAD } from '@/lib/money';
import type { Errors, ServiceAvailability, WizardPrefill, WizardState } from './types';

export const STORAGE_KEY = 'fmv-build-v1';

export const STEPS = [
  { key: 'type', short: 'Event', title: 'What are you celebrating?' },
  { key: 'when', short: 'Date', title: 'When is your event?' },
  { key: 'where', short: 'Venue', title: 'Where is it?' },
  { key: 'services', short: 'Services', title: 'Start from a package or pick services' },
  { key: 'hours', short: 'Hours', title: 'Hours and quantities' },
  { key: 'addons', short: 'Add-ons', title: 'Add-ons' },
  { key: 'details', short: 'Details', title: 'Theme, guests and inspiration' },
  { key: 'contact', short: 'Contact', title: 'Your contact details' },
  { key: 'review', short: 'Review', title: 'Review your estimate' },
] as const;
export const LAST_STEP = STEPS.length - 1;

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const WALL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function initialState(prefill: WizardPrefill): WizardState {
  const sel = emptySelection();
  return {
    v: 1,
    prefillKey: prefill.key,
    step: 0,
    maxStep: 0,
    event_type: prefill.event_type,
    event_date: prefill.event_date,
    start_time: '',
    end_time: '',
    venue_name: '',
    venue_address: '',
    zone_id: '',
    selection: { ...sel, package_id: prefill.package_id, service_ids: [...prefill.service_ids] },
    guest_count: '',
    theme: '',
    notes: '',
    references: [],
    contact: { full_name: '', email: '', phone: '' },
  };
}

const str = (v: unknown, max = 3000) => (typeof v === 'string' ? v.slice(0, max) : '');
const numRecord = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') {
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
      if (typeof n === 'number' && Number.isFinite(n)) out[k] = n;
    }
  }
  return out;
};

/**
 * Restores the wizard from sessionStorage (so a refresh keeps progress). A link
 * with different prefill params starts fresh; a plain /build restores.
 */
export function loadState(prefill: WizardPrefill, catalog: PublicCatalog): WizardState {
  const fresh = initialState(prefill);
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return fresh;
  }
  if (!raw) return fresh;
  try {
    const s = JSON.parse(raw) as Partial<WizardState>;
    if (s.v !== 1) return fresh;
    if (prefill.key && s.prefillKey !== prefill.key) return fresh;
    const serviceIds = new Set(catalog.services.map((x) => x.id));
    const addonIds = new Set(catalog.addons.map((x) => x.id));
    const pkgIds = new Set(catalog.packages.map((x) => x.id));
    const zoneIds = new Set(catalog.zones.map((x) => x.id));
    const sel = (s.selection ?? {}) as Partial<Selection>;
    const step = Math.min(Math.max(Number(s.step) || 0, 0), LAST_STEP);
    const eventType = (EVENT_TYPES as readonly string[]).includes(s.event_type ?? '') ? (s.event_type as WizardState['event_type']) : '';
    return {
      v: 1,
      prefillKey: prefill.key,
      step,
      maxStep: Math.min(Math.max(Number(s.maxStep) || step, step), LAST_STEP),
      event_type: eventType,
      event_date: ISO_DATE.test(str(s.event_date)) ? str(s.event_date) : '',
      start_time: WALL_TIME.test(str(s.start_time)) ? str(s.start_time) : '',
      end_time: WALL_TIME.test(str(s.end_time)) ? str(s.end_time) : '',
      venue_name: str(s.venue_name, 200),
      venue_address: str(s.venue_address, 300),
      zone_id: s.zone_id === 'unsure' || zoneIds.has(str(s.zone_id)) ? str(s.zone_id) : '',
      selection: {
        package_id: sel.package_id && pkgIds.has(sel.package_id) ? sel.package_id : null,
        service_ids: Array.isArray(sel.service_ids) ? sel.service_ids.filter((id) => serviceIds.has(id)) : [],
        addon_ids: Array.isArray(sel.addon_ids) ? sel.addon_ids.filter((id) => addonIds.has(id)) : [],
        hours: numRecord(sel.hours),
        qty: numRecord(sel.qty),
      },
      guest_count: str(s.guest_count, 6),
      theme: str(s.theme, 200),
      notes: str(s.notes, 3000),
      references: Array.isArray(s.references)
        ? s.references
            .filter((r) => r && typeof r.path === 'string' && typeof r.name === 'string')
            .slice(0, 5)
        : [],
      contact: {
        full_name: str(s.contact?.full_name, 120),
        email: str(s.contact?.email, 200),
        phone: str(s.contact?.phone, 40),
      },
    };
  } catch {
    return fresh;
  }
}

export function saveState(state: WizardState | null) {
  try {
    if (state) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage blocked (private mode): the wizard still works, it just won't survive a refresh */
  }
}

// ---------------------------------------------------------------- derived selection

export function packageServiceIds(catalog: PublicCatalog, packageId: string | null | undefined): Set<string> {
  const pkg = packageId ? catalog.packages.find((p) => p.id === packageId) : undefined;
  return new Set(pkg?.items.map((i) => i.service_id) ?? []);
}

/** Category ids of every chosen service (including the package's). */
export function selectedCategoryIds(catalog: PublicCatalog, selection: Selection): Set<string> {
  const ids = new Set([...selection.service_ids, ...packageServiceIds(catalog, selection.package_id)]);
  const cats = new Set<string>();
  for (const s of catalog.services) if (ids.has(s.id)) cats.add(s.category_id);
  return cats;
}

export function eligibleAddons(catalog: PublicCatalog, selection: Selection) {
  const cats = selectedCategoryIds(catalog, selection);
  return catalog.addons.filter(
    (a) => a.applies_to_category_ids.length === 0 || a.applies_to_category_ids.some((c) => cats.has(c)),
  );
}

/** Cleaned selection used for the estimate and the submit payload. */
export function effectiveSelection(catalog: PublicCatalog, selection: Selection): Selection {
  const covered = packageServiceIds(catalog, selection.package_id);
  const serviceIds = [...new Set([...selection.service_ids, ...covered])].filter((id) =>
    catalog.services.some((s) => s.id === id),
  );
  const eligible = new Set(eligibleAddons(catalog, { ...selection, service_ids: serviceIds }).map((a) => a.id));
  const addonIds = selection.addon_ids.filter((id) => eligible.has(id));
  const hours: Record<string, number> = {};
  const qty: Record<string, number> = {};
  for (const id of serviceIds) {
    if (covered.has(id)) continue;
    const s = catalog.services.find((x) => x.id === id)!;
    if (s.price_mode === 'per_hour') hours[id] = selection.hours[id] ?? s.min_hours ?? 1;
    if (s.price_mode === 'per_item') qty[id] = Math.round(selection.qty[id] ?? 1);
  }
  for (const id of addonIds) {
    const a = catalog.addons.find((x) => x.id === id)!;
    if (a.price_mode === 'per_hour') hours[id] = selection.hours[id] ?? 1;
    if (a.price_mode === 'per_item') qty[id] = Math.round(selection.qty[id] ?? 1);
  }
  return {
    package_id: selection.package_id && catalog.packages.some((p) => p.id === selection.package_id) ? selection.package_id : null,
    service_ids: serviceIds,
    addon_ids: addonIds,
    hours,
    qty,
  };
}

export function servicePriceLabel(s: Pick<PublicService, 'price_cents' | 'price_mode' | 'min_hours' | 'included_hours'>): string {
  if (s.price_cents === null) return 'Priced in your quote';
  const p = formatCAD(s.price_cents);
  switch (s.price_mode) {
    case 'per_hour':
      return `${p}/hr${s.min_hours ? ` · min ${s.min_hours} hr` : ''}`;
    case 'per_item':
      return `${p} each`;
    case 'from':
      return `from ${p}`;
    default:
      return s.included_hours ? `${p} · ${s.included_hours} hr included` : p;
  }
}

export function zoneFeeLabel(cents: number | null): string {
  if (cents === null) return 'travel confirmed in your quote';
  if (cents === 0) return 'travel included';
  return `travel ${formatCAD(cents)}`;
}

// ---------------------------------------------------------------- validation

export interface ValidationContext {
  catalog: PublicCatalog;
  today: string;
  availability: Map<string, ServiceAvailability> | null;
}

const isHalfStep = (n: number) => Math.abs(n * 2 - Math.round(n * 2)) < 1e-9;

export function validateStep(step: number, state: WizardState, ctx: ValidationContext): Errors {
  const e: Errors = {};
  const { catalog } = ctx;
  switch (STEPS[step]?.key) {
    case 'type':
      if (!state.event_type) e.event_type = 'Choose the kind of event';
      break;
    case 'when':
      if (!ISO_DATE.test(state.event_date)) e.event_date = 'Pick a date';
      else if (state.event_date < ctx.today) e.event_date = 'Pick a date that hasn’t passed';
      if (!WALL_TIME.test(state.start_time)) e.start_time = 'Pick a start time';
      if (!WALL_TIME.test(state.end_time)) e.end_time = 'Pick an end time';
      else if (state.end_time === state.start_time) e.end_time = 'The end time must differ from the start time';
      break;
    case 'where':
      if (state.venue_name.length > 200) e.venue_name = 'Please shorten the venue name';
      if (state.venue_address.length > 300) e.venue_address = 'Please shorten the address';
      break;
    case 'services': {
      const sel = effectiveSelection(catalog, state.selection);
      if (!sel.package_id && sel.service_ids.length === 0) {
        e.selection = 'Choose a package or at least one service';
        break;
      }
      if (ctx.availability) {
        const blocked = sel.service_ids
          .map((id) => ctx.availability!.get(id))
          .filter((a): a is ServiceAvailability => a?.status === 'unavailable');
        if (blocked.length > 0) {
          const names = blocked.map((b) => catalog.services.find((s) => s.id === b.service_id)?.name ?? b.slug);
          e.selection = `${names.join(', ')} ${names.length === 1 ? 'isn’t' : 'aren’t'} available at that time. Remove ${names.length === 1 ? 'it' : 'them'} or pick another date.`;
        }
      }
      break;
    }
    case 'hours': {
      const sel = effectiveSelection(catalog, state.selection);
      const covered = packageServiceIds(catalog, sel.package_id);
      for (const id of sel.service_ids) {
        if (covered.has(id)) continue;
        const s = catalog.services.find((x) => x.id === id);
        if (!s) continue;
        if (s.price_mode === 'per_hour') {
          const h = sel.hours[id];
          const min = s.min_hours ?? 0.5;
          if (!(h >= min)) e[`selection.hours.${id}`] = `At least ${min} hr`;
          else if (h > 24) e[`selection.hours.${id}`] = 'At most 24 hr';
          else if (!isHalfStep(h)) e[`selection.hours.${id}`] = 'Use half-hour steps';
        }
        if (s.price_mode === 'per_item') {
          const q = sel.qty[id];
          if (!(q >= 1) || q > 500) e[`selection.qty.${id}`] = 'Enter a quantity from 1 to 500';
        }
      }
      break;
    }
    case 'addons': {
      const sel = effectiveSelection(catalog, state.selection);
      for (const id of sel.addon_ids) {
        const a = catalog.addons.find((x) => x.id === id);
        if (a?.price_mode === 'per_hour') {
          const h = sel.hours[id];
          if (!(h >= 0.5) || h > 24 || !isHalfStep(h)) e[`selection.hours.${id}`] = 'Between 0.5 and 24 hr, in half hours';
        }
        if (a?.price_mode === 'per_item') {
          const q = sel.qty[id];
          if (!(q >= 1) || q > 500) e[`selection.qty.${id}`] = 'Enter a quantity from 1 to 500';
        }
      }
      break;
    }
    case 'details':
      if (state.guest_count.trim() !== '') {
        const n = Number(state.guest_count);
        if (!Number.isInteger(n) || n < 0 || n > 5000) e.guest_count = 'Enter a number of guests (0 to 5000)';
      }
      if (state.theme.length > 200) e.theme = 'Please keep the theme under 200 characters';
      if (state.notes.length > 3000) e.notes = 'Please keep notes under 3000 characters';
      break;
    case 'contact': {
      const r = contactSchema.safeParse(state.contact);
      if (!r.success) {
        for (const issue of r.error.issues) {
          const key = `contact.${issue.path.join('.')}`;
          e[key] ??= issue.message;
        }
      }
      break;
    }
  }
  return e;
}

/** First step that has an error, for jumping back after a server rejection. */
export function stepForErrorKey(key: string): number {
  if (key === 'event_type') return 0;
  if (['event_date', 'start_time', 'end_time'].includes(key)) return 1;
  if (key.startsWith('venue_') || key === 'zone_id') return 2;
  if (key === 'selection' || key.startsWith('selection.package_id') || key.startsWith('selection.service_ids')) return 3;
  if (key.startsWith('selection.addon_ids')) return 5;
  if (key.startsWith('selection.')) return 4;
  if (['guest_count', 'theme', 'notes'].includes(key) || key.startsWith('reference_paths')) return 6;
  if (key.startsWith('contact')) return 7;
  return LAST_STEP;
}

/** Flattens server fieldErrors (string[]) to the first message per key. */
export function flattenFieldErrors(fe: Record<string, string[]> | undefined): Errors {
  const out: Errors = {};
  for (const [k, v] of Object.entries(fe ?? {})) if (v?.[0]) out[k] = v[0];
  return out;
}

export function buildPayload(state: WizardState, catalog: PublicCatalog, turnstileToken: string | null): InquiryInput {
  const sel = effectiveSelection(catalog, state.selection);
  const guests = state.guest_count.trim() === '' ? null : Number(state.guest_count);
  return {
    event_type: state.event_type as InquiryInput['event_type'],
    event_date: state.event_date,
    start_time: state.start_time,
    end_time: state.end_time,
    venue_name: state.venue_name,
    venue_address: state.venue_address,
    zone_id: state.zone_id && state.zone_id !== 'unsure' ? state.zone_id : null,
    guest_count: guests,
    theme: state.theme,
    notes: state.notes,
    selection: sel,
    contact: { ...state.contact },
    reference_paths: state.references.map((r) => r.path),
    turnstile_token: turnstileToken,
    source: 'builder',
  };
}
