// Small shadcn-style primitives styled with the FMV tokens. Server-safe (no hooks).
import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap';
const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-rose-deep text-white hover:bg-ink',
  secondary: 'border border-ink/20 bg-white text-ink hover:border-rose-deep hover:text-rose-deep',
  ghost: 'text-ink hover:bg-blush-soft',
  danger: 'bg-bad text-white hover:bg-ink',
  gold: 'bg-gold-deep text-white hover:bg-ink',
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-5 text-sm',
  lg: 'h-12 px-7 text-base',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}

const fieldBase =
  'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-rose-deep focus:outline-none focus:ring-2 focus:ring-rose/20 disabled:bg-cream-deep';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldBase, 'h-10', className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(fieldBase, 'min-h-24', className)} {...props} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return <select ref={ref} className={cn(fieldBase, 'h-10', className)} {...props} />;
  },
);

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1 block text-sm font-medium text-ink', className)} {...props} />;
}

/** Label + control + hint/error, with the error wired to aria-describedby by id. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: string | string[] | null;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const err = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-rose-deep" aria-hidden> *</span>}
      </Label>
      {children}
      {hint && !err && <p id={`${htmlFor}-hint`} className="text-xs text-ink-soft">{hint}</p>}
      {err && <p id={`${htmlFor}-error`} role="alert" className="text-xs text-bad">{err}</p>}
    </div>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-sm', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('font-display text-2xl font-semibold text-ink', className)} {...props} />;
}

type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'rose' | 'gold';
const tones: Record<Tone, string> = {
  neutral: 'bg-cream-deep text-ink-soft',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  rose: 'bg-blush text-rose-deep',
  gold: 'bg-cream-deep text-gold-deep',
};

export function Badge({ tone = 'neutral', className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone], className)} {...props} />;
}

const statusTone: Record<string, Tone> = {
  new: 'rose', quoted: 'gold', won: 'ok', lost: 'neutral', spam: 'neutral',
  draft: 'neutral', sent: 'gold', accepted: 'ok', declined: 'bad', expired: 'neutral', superseded: 'neutral',
  held: 'warn', confirmed: 'ok', completed: 'neutral', cancelled: 'bad', no_show: 'bad',
  unpaid: 'warn', reported: 'gold', paid: 'ok', void: 'neutral',
  live: 'ok', closed: 'neutral', active: 'ok', needs_price: 'warn', archived: 'neutral',
  available: 'ok', limited: 'warn', unavailable: 'bad',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={statusTone[status] ?? 'neutral'} className={className}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

export function Notice({
  tone = 'neutral',
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cn('rounded-xl px-4 py-3 text-sm', tones[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className={cn('w-full text-left text-sm', className)} {...props} />
    </div>
  );
}
export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('border-b border-line bg-cream-deep/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-soft', className)} {...props} />;
}
export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-line/70 px-3 py-2 align-top', className)} {...props} />;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line bg-white/60 px-4 py-8 text-center text-sm text-ink-soft">{children}</p>;
}

export function Money({ cents, className }: { cents: number | null | undefined; className?: string }) {
  const v = cents === null || cents === undefined ? '—' : new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);
  return <span className={cn('tabular-nums', className)}>{v}</span>;
}
