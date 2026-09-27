/**
 * Enquiry form: carries a selected gallery photograph, pre-selects a service,
 * shows optional event questions only for event services, validates inline,
 * filters obvious spam, and submits to a configured endpoint or composes an
 * email. It never reports success unless the endpoint confirms it.
 */

interface Piece {
  id: string;
  label: string;
  collection: string;
  thumb: string;
}

interface ServiceOption {
  id: string;
  label: string;
  questions: 'wedding' | 'hospitality' | null;
}

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const STORAGE_KEY = 'fs-enquiry-piece';
const MIN_FILL_MS = 2500;

const messages: Record<string, (el: Field) => string | null> = {
  name: (el) => (el.value.trim() ? null : 'Please enter your name.'),
  email: (el) => {
    const v = el.value.trim();
    if (!v) return 'Please enter your email address.';
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : 'Please enter an email address like name@example.com.';
  },
  phone: (el) => {
    const v = el.value.trim();
    if (!v) return null;
    return /^[+()\d\s.-]{7,}$/.test(v) ? null : 'Please use digits, spaces and an optional leading +.';
  },
  service: (el) => (el.value ? null : 'Please choose a service.'),
  date: (el) => {
    const input = el as HTMLInputElement;
    if (!input.value) return null;
    return input.min && input.value < input.min ? 'Please choose a date from today onwards.' : null;
  },
  message: (el) => {
    const v = el.value.trim();
    if (!v) return 'Please tell us a little about what you need.';
    return v.length < 10 ? 'Please add a few more words so the studio can help.' : null;
  },
};

function session(action: 'get' | 'set' | 'remove', value?: string) {
  try {
    if (action === 'get') return sessionStorage.getItem(STORAGE_KEY);
    if (action === 'set') sessionStorage.setItem(STORAGE_KEY, value!);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Storage unavailable: the URL still carries the selection. */
  }
  return null;
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function initEnquiry() {
  const form = document.querySelector<HTMLFormElement>('[data-enquiry]');
  if (!form) return;
  const startedAt = Date.now();

  const pieces: Piece[] = JSON.parse(document.getElementById('pieces-data')?.textContent || '[]');
  const serviceOptions: ServiceOption[] = JSON.parse(form.dataset.services || '[]');
  const status = form.querySelector<HTMLElement>('[data-status]')!;
  const submit = form.querySelector<HTMLButtonElement>('[data-submit]')!;
  const submitLabel = form.querySelector<HTMLElement>('[data-submit-label]')!;
  const mode = form.dataset.mode as 'endpoint' | 'email' | 'unavailable';
  const url = new URL(location.href);

  // Service pre-selection and event questions ---------------------------------
  const serviceSelect = form.querySelector<HTMLSelectElement>('select[name="service"]')!;
  const eventFields = form.querySelector<HTMLElement>('[data-event-fields]')!;
  const syncEventFields = () => {
    const kind = serviceOptions.find((s) => s.id === serviceSelect.value)?.questions ?? null;
    eventFields.hidden = !kind;
    eventFields.querySelectorAll<HTMLElement>('[data-q]').forEach((q) => (q.hidden = q.dataset.q !== kind));
  };
  const preset = url.searchParams.get('service');
  if (preset && Array.from(serviceSelect.options).some((o) => o.value === preset)) serviceSelect.value = preset;
  syncEventFields();
  serviceSelect.addEventListener('change', syncEventFields);

  // Gallery selection handoff ------------------------------------------------
  const selection = form.querySelector<HTMLElement>('[data-selection]')!;
  const selectionInput = form.querySelector<HTMLInputElement>('[data-selection-input]')!;
  // A service link without a photograph starts a fresh enquiry: forget any
  // photograph chosen earlier in the session.
  if (preset && !url.searchParams.has('piece')) session('remove');
  const requested = url.searchParams.get('piece') ?? session('get');
  let selected = pieces.find((p) => p.id === requested);

  if (selected) {
    form.querySelector<HTMLImageElement>('[data-selection-thumb]')!.src = selected.thumb;
    form.querySelector('[data-selection-name]')!.textContent = [selected.label, selected.collection]
      .filter(Boolean)
      .join(', ');
    form.querySelector<HTMLAnchorElement>('[data-selection-view]')!.href =
      `/gallery/?view=${encodeURIComponent(selected.id)}`;
    selectionInput.value = selected.id;
    selection.hidden = false;
    session('set', selected.id);
    if (!preset && !serviceSelect.value) serviceSelect.value = 'arrangements';
    syncEventFields();
  }

  // Arriving from a service or a photograph: bring the form into view on
  // small screens, where the contact details come first.
  if ((preset || url.searchParams.has('piece')) && matchMedia('(max-width: 1023px)').matches) {
    requestAnimationFrame(() => form.scrollIntoView({ block: 'start' }));
  }

  form.querySelector('[data-selection-remove]')?.addEventListener('click', () => {
    selected = undefined;
    selection.hidden = true;
    selectionInput.value = '';
    session('remove');
    const clean = new URL(location.href);
    clean.searchParams.delete('piece');
    history.replaceState(history.state, '', clean);
    form.querySelector<HTMLElement>('#f-name')?.focus();
  });

  // Validation ---------------------------------------------------------------
  const fields = Array.from(form.querySelectorAll<Field>('[name]')).filter(
    (el) => el.name in messages,
  );

  function check(el: Field, show: boolean) {
    const error = messages[el.name]?.(el) ?? null;
    if (show || el.getAttribute('aria-invalid') === 'true') {
      const slot = form!.querySelector<HTMLElement>(`[data-error-for="${el.name}"]`);
      if (slot) slot.textContent = error ?? '';
      if (error) el.setAttribute('aria-invalid', 'true');
      else el.removeAttribute('aria-invalid');
    }
    return !error;
  }

  for (const el of fields) {
    el.addEventListener('blur', () => {
      if (el.value) check(el, true);
    });
    el.addEventListener('input', () => check(el, false));
    el.addEventListener('change', () => check(el, false));
  }

  function setStatus(tone: 'info' | 'error' | 'success', html: string) {
    status.dataset.tone = tone;
    status.innerHTML = html;
    status.focus();
  }

  // Only report follow-up answers that are visible for the chosen service.
  function fieldValue(data: FormData, name: string) {
    const el = form!.querySelector<HTMLElement>(`[name="${name}"]`);
    return el && !el.closest('[hidden]') ? String(data.get(name) ?? '').trim() : '';
  }

  function payload() {
    const data = new FormData(form!);
    const service = String(data.get('service') ?? '');
    const serviceLabel = serviceOptions.find((s) => s.id === service)?.label ?? (service === 'other' ? 'Something else' : '');
    return {
      name: String(data.get('name') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      phone: String(data.get('phone') ?? '').trim(),
      service: serviceLabel,
      date: String(data.get('date') ?? ''),
      venue: eventFields.hidden ? '' : String(data.get('venue') ?? '').trim(),
      guests: fieldValue(data, 'guests'),
      frequency: fieldValue(data, 'frequency'),
      message: String(data.get('message') ?? '').trim(),
      piece: selected ? `${selected.id} (${[selected.label, selected.collection].filter(Boolean).join(', ')})` : '',
      pieceUrl: selected ? new URL(`/gallery/?view=${encodeURIComponent(selected.id)}`, location.origin).href : '',
    };
  }

  function emailHref(to: string) {
    const p = payload();
    const details = [
      `Name: ${p.name}`,
      `Email: ${p.email}`,
      p.phone && `Telephone: ${p.phone}`,
      `Service: ${p.service}`,
      p.date && `Date needed: ${p.date}`,
      p.venue && `Venue: ${p.venue}`,
      p.guests && `Approximate guests: ${p.guests}`,
      p.frequency && `One-off or ongoing: ${p.frequency}`,
      p.piece && `Gallery selection: ${p.piece}`,
      p.pieceUrl && `Link: ${p.pieceUrl}`,
    ].filter(Boolean);
    const body = [...details, '', p.message].join('\n');
    const subject = `Flower enquiry: ${p.service}${p.date ? `, ${p.date}` : ''}`;
    return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const results = fields.map((el) => check(el, true));
    const firstInvalid = fields[results.indexOf(false)];
    if (firstInvalid) {
      const n = results.filter((r) => !r).length;
      setStatus('error', `<p>Please check the ${n === 1 ? 'highlighted field' : `${n} highlighted fields`}.</p>`);
      firstInvalid.focus();
      return;
    }

    // Spam checks: the hidden field must be empty and the form must not be
    // submitted faster than a person could fill it. Nothing is sent otherwise.
    const trap = form.querySelector<HTMLInputElement>('input[name="website"]');
    if ((trap && trap.value) || Date.now() - startedAt < MIN_FILL_MS) {
      setStatus('error', '<p>Sorry, that was too quick for us to accept. Please try again in a moment.</p>');
      return;
    }

    const email = form.dataset.email;

    if (mode === 'endpoint' && form.dataset.endpoint) {
      submit.disabled = true;
      const original = submitLabel.textContent;
      submitLabel.textContent = 'Sending';
      try {
        const res = await fetch(form.dataset.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload()),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        form.reset();
        syncEventFields();
        session('remove');
        setStatus('success', '<p><strong>Thank you. Your enquiry has been sent to the studio.</strong></p>');
      } catch {
        const fallback = email ? ` You can also <a href="${escape(emailHref(email))}">send it by email instead</a>.` : '';
        setStatus('error', `<p>Sorry, your enquiry could not be sent just now. Please try again.${fallback}</p>`);
      } finally {
        submit.disabled = false;
        submitLabel.textContent = original;
      }
      return;
    }

    if (mode === 'email' && email) {
      const href = emailHref(email);
      window.location.href = href;
      setStatus(
        'info',
        `<p>Your email app should now open with the enquiry ready to send. Nothing has been sent yet.</p><p>If it did not open, <a href="${escape(href)}">try again</a> or write to <a href="mailto:${escape(email)}">${escape(email)}</a>.</p>`,
      );
      return;
    }

    setStatus('error', '<p>Online enquiries are not connected yet. Please call or email the studio.</p>');
  });
}
