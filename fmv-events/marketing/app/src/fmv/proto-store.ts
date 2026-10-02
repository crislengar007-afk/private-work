// Prototype only: booking requests and questions are kept in this browser's
// localStorage so the owner preview can show what would arrive. Nothing leaves
// the device. The real booking app stores these in its database instead.

export interface ProtoLine {
  label: string;
  detail?: string;
  cents: number | null;
  from?: boolean;
}

export interface ProtoRequest {
  ref: string;
  created_at: string;
  event_type: string;
  date: string;
  start: string;
  end: string;
  venue_name: string;
  venue_address: string;
  zone: string;
  km: number | null;
  guests: number | null;
  theme: string;
  notes: string;
  lines: ProtoLine[];
  total_cents: number;
  total_is_from: boolean;
  deposit_cents: number;
  customer: { full_name: string; email: string; phone: string; contact_pref: string; heard: string };
}

export interface ProtoInquiry {
  ref: string;
  created_at: string;
  full_name: string;
  email: string;
  phone: string;
  event_date: string;
  interest: string;
  message: string;
}

const KEYS = { requests: "fmv-proto-requests", inquiries: "fmv-proto-inquiries" } as const;

function read<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, items: T[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(items.slice(0, 50)));
  } catch {
    // Private mode or storage blocked: the confirmation still shows, the preview just stays empty.
  }
}

export const protoStore = {
  requests: () => read<ProtoRequest>(KEYS.requests),
  inquiries: () => read<ProtoInquiry>(KEYS.inquiries),
  addRequest: (r: ProtoRequest) => write(KEYS.requests, [r, ...read<ProtoRequest>(KEYS.requests)]),
  addInquiry: (q: ProtoInquiry) => write(KEYS.inquiries, [q, ...read<ProtoInquiry>(KEYS.inquiries)]),
  clear: () => {
    write(KEYS.requests, []);
    write(KEYS.inquiries, []);
  },
};

export function protoRef(prefix: "Q" | "M"): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `FMV-${prefix}-${new Date().getFullYear()}-${n}`;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Accepts 506-555-0123, (506) 555 0123, +1 506 555 0123. */
export function validPhone(v: string): boolean {
  const d = v.replace(/\D/g, "");
  return d.length === 10 || (d.length === 11 && d.startsWith("1"));
}
