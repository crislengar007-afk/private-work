/**
 * Enquiry form: carries a selected gallery photograph, validates inline,
 * and submits to a configured endpoint or composes an email. It never
 * reports success unless the endpoint confirms it.
 */

interface Piece {
  id: string;
  label: string;
  collection: string;
  thumb: string | null;
  ratio: number;
}

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const STORAGE_KEY = 'fs-enquiry-piece';

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
  occasion: (el) => (el.value ? null : 'Please choose the occasion.'),
  date: (el) => {
    const input = el as HTMLInputElement;
    if (!input.value) return null;
    return input.min && input.value < input.min ? 'Please choose a date from today onwards.' : null;
  },
  message: (el) => {
    const v = el.value.trim();
    if (!v) return 'Please tell us a little about the occasion.';
    return v.length < 10 ? 'Please add a few more words so the studio can help.' : null;
  },
};

function safeSession(action: 'get' | 'set' | 'remove', value?: string) {
  try {
    if (action === 'get') return sessionStorage.getItem(STORAGE_KEY);
    if (action === 'set') sessionStorage.setItem(STORAGE_KEY, value!);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Storage unavailable: the URL still carries the selection. */
  }
  return null;
}

export function initEnquiry() {
  const form = document.querySelector<HTMLFormElement>('[data-enquiry]');
  if (!form) return;

  const pieces: Piece[] = JSON.parse(document.getElementById('pieces-data')?.textContent || '[]');
  const status = form.querySelector<HTMLElement>('[data-status]')!;
  const submit = form.querySelector<HTMLButtonElement>('[data-submit]')!;
  const mode = form.dataset.mode as 'endpoint' | 'email' | 'unavailable';

  // Selection handoff ----------------------------------------------------------
  const selection = form.querySelector<HTMLElement>('[data-selection]')!;
  const selectionInput = form.querySelector<HTMLInputElement>('[data-selection-input]')!;
  let selected: Piece | undefined;

  const url = new URL(location.href);
  const requested = url.searchParams.get('piece') ?? safeSession('get');
  selected = pieces.find((p) => p.id === requested);

  if (selected) {
    const thumb = form.querySelector<HTMLElement>('[data-selection-thumb]')!;
    if (selected.thumb) {
      const img = document.createElement('img');
      img.src = selected.thumb;
      img.alt = '';
      img.width = 88;
      img.height = 110;
      thumb.replaceChildren(img);
    } else {
      thumb.innerHTML = '<div class="pending" aria-hidden="true"></div>';
    }
    const name = [selected.label, selected.collection].filter(Boolean).join(', ');
    form.querySelector('[data-selection-name]')!.textContent = name;
    form.querySelector<HTMLAnchorElement>('[data-selection-view]')!.href =
      `/gallery/?view=${encodeURIComponent(selected.id)}`;
    selectionInput.value = selected.id;
    selection.hidden = false;
    safeSession('set', selected.id);
  }

  // Pre-select the occasion when arriving from a service.
  const occasion = url.searchParams.get('occasion');
  const occasionSelect = form.querySelector<HTMLSelectElement>('select[name="occasion"]');
  if (occasion && occasionSelect && Array.from(occasionSelect.options).some((o) => o.value === occasion)) {
    occasionSelect.value = occasion;
  }

  form.querySelector('[data-selection-remove]')?.addEventListener('click', () => {
    selected = undefined;
    selection.hidden = true;
    selectionInput.value = '';
    safeSession('remove');
    const clean = new URL(location.href);
    clean.searchParams.delete('piece');
    history.replaceState(history.state, '', clean);
    form.querySelector<HTMLElement>('#f-name')?.focus();
  });

  // Validation ---------------------------------------------------------------
  const fields = Array.from(form.querySelectorAll<Field>('input[name]:not([type="hidden"]), select, textarea'));

  function check(el: Field, show: boolean) {
    const rule = messages[el.name];
    const error = rule ? rule(el) : null;
    if (show || el.getAttribute('aria-invalid') === 'true') {
      const slot = form!.querySelector<HTMLElement>(`[data-error-for="${el.name}"]`);
      if (slot) slot.textContent = error ?? '';
      if (error) el.setAttribute('aria-invalid', 'true');
      else el.removeAttribute('aria-invalid');
    }
    return !error;
  }

  for (const el of fields) {
    // Validate after the visitor leaves a field, then live once it is flagged.
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

  function payload() {
    const data = new FormData(form!);
    return {
      name: String(data.get('name') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      phone: String(data.get('phone') ?? '').trim(),
      occasion: String(data.get('occasion') ?? ''),
      date: String(data.get('date') ?? ''),
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
      `Occasion: ${p.occasion}`,
      p.date && `Date: ${p.date}`,
      p.piece && `Gallery selection: ${p.piece}`,
      p.pieceUrl && `Link: ${p.pieceUrl}`,
    ].filter(Boolean);
    const body = [...details, '', p.message].join('\n');
    const subject = `Enquiry: ${p.occasion}${p.date ? `, ${p.date}` : ''}`;
    return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  const escape = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

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

    const email = form.dataset.email;

    if (mode === 'endpoint' && form.dataset.endpoint) {
      submit.disabled = true;
      const label = submit.firstChild!;
      const original = label.textContent;
      label.textContent = 'Sending ';
      try {
        const res = await fetch(form.dataset.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload()),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        form.reset();
        safeSession('remove');
        setStatus(
          'success',
          '<p><strong>Thank you. Your enquiry has been sent to the studio.</strong></p>',
        );
      } catch {
        const fallback = email
          ? ` You can also <a href="${escape(emailHref(email))}">send it by email instead</a>.`
          : '';
        setStatus('error', `<p>Sorry, your enquiry could not be sent just now. Please try again.${fallback}</p>`);
      } finally {
        submit.disabled = false;
        label.textContent = original;
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

    setStatus('error', '<p>Online enquiries are not connected yet.</p>');
  });
}
