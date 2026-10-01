// Small server-safe building blocks for the admin pages.
import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

/** Pill links used as filters (?status=…). The current one is marked aria-current. */
export function FilterTabs({
  items,
  current,
  label,
}: {
  items: { value: string; label: string; href: string; count?: number }[];
  current: string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="mb-4 flex flex-wrap gap-2">
      {items.map((i) => {
        const active = i.value === current;
        return (
          <Link
            key={i.value}
            href={i.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              active ? 'border-rose-deep bg-rose-deep text-white' : 'border-line bg-white text-ink hover:border-rose-deep hover:text-rose-deep',
            )}
          >
            {i.label}
            {typeof i.count === 'number' && <span className="ml-1 tabular-nums opacity-80">({i.count})</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Builds a query-string href from the current params with some overridden (empty → removed). */
export function hrefWith(base: string, params: Record<string, string | undefined>, overrides: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...overrides })) {
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

export function Section({ title, actions, children, className }: { title: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-sm sm:p-5', className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold text-ink sm:text-2xl">{title}</h2>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function DefList({ items }: { items: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr]">
      {items.map(([k, v], i) => (
        <React.Fragment key={i}>
          <dt className="font-medium text-ink-soft">{k}</dt>
          <dd className="mb-2 break-words text-ink sm:mb-0">{v || <span className="text-ink-soft">—</span>}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/** First value of a searchParams entry. */
export function sp1(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
