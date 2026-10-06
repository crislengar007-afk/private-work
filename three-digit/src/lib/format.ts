const manilaFull = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  weekday: 'short',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const manilaDate = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' });

export const MANILA_OFFSET_MS = 8 * 3600_000; // Asia/Manila has no DST

/** "Tue, Oct 6, 2026, 8:00 PM PHT (Asia/Manila)" */
export function fmtManila(iso: string | null | undefined, opts: { tz?: boolean } = {}): string {
  if (!iso) return '—';
  const s = manilaFull.format(new Date(iso));
  return opts.tz === false ? `${s} PHT` : `${s} PHT (Asia/Manila)`;
}

export function fmtManilaShort(iso: string | null | undefined): string {
  return iso ? `${manilaFull.format(new Date(iso))} PHT` : '—';
}

export function fmtManilaDate(iso: string | null | undefined): string {
  return iso ? manilaDate.format(new Date(iso)) : '—';
}

/** <input type="datetime-local"> value, interpreted as Asia/Manila wall time. */
export function toManilaInput(iso: string): string {
  return new Date(new Date(iso).getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 16);
}

export function fromManilaInput(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value ?? '');
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const t = Date.UTC(y, mo - 1, d, h, mi) - MANILA_OFFSET_MS;
  const dt = new Date(t);
  if (Number.isNaN(t) || toManilaInput(dt.toISOString()) !== value) return null;
  return dt.toISOString();
}

/** Integer centavos -> "₱3,100.00". Never uses floating point for storage. */
export function peso(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return '—';
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = (abs % 100).toString().padStart(2, '0');
  return `${sign}₱${whole}.${cents}`;
}

/** Short peso without centavos when whole: ₱10, ₱3,100. */
export function pesoShort(minor: number): string {
  return minor % 100 === 0 ? peso(minor).slice(0, -3) : peso(minor);
}

export function durationText(ms: number): string {
  if (ms <= 0) return 'now';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
