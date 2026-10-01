'use client';
// Client-side form plumbing for the owner admin: small inline forms bound to
// server actions that return ActionResult, with field errors and a status line.
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ActionResult } from '@/lib/errors';
import { Label, buttonClass } from '@/components/ui';
import { cn } from '@/lib/cn';

export type FormAction = (prev: ActionResult<unknown> | null, formData: FormData) => Promise<ActionResult<unknown>>;

interface FormCtx {
  state: ActionResult<unknown> | null;
  pending: boolean;
}
const Ctx = React.createContext<FormCtx>({ state: null, pending: false });

/**
 * A form posting to a server action. Submits without React's automatic form
 * reset (so a rejected value stays on screen for fixing), shows the action's
 * error/success line, and exposes field errors to <Fld>.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  confirm,
  showStatus = true,
  'aria-label': ariaLabel,
}: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  /** Ask before submitting (destructive actions). */
  confirm?: string;
  showStatus?: boolean;
  'aria-label'?: string;
}) {
  const [state, formAction, pending] = React.useActionState(action, null);
  const [, startTransition] = React.useTransition();
  const ref = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <Ctx.Provider value={{ state, pending }}>
      <form
        ref={ref}
        action={formAction}
        aria-label={ariaLabel}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          if (confirm && !window.confirm(confirm)) return;
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
          const fd = new FormData(e.currentTarget, submitter);
          startTransition(() => formAction(fd));
        }}
      >
        {children}
        {showStatus && <FormStatus />}
      </form>
    </Ctx.Provider>
  );
}

export function FormStatus({ className }: { className?: string }) {
  const { state } = React.useContext(Ctx);
  if (!state) return <span className="sr-only" aria-live="polite" />;
  return (
    <p
      aria-live="polite"
      role={state.ok ? 'status' : 'alert'}
      className={cn('basis-full text-xs', state.ok ? 'text-ok' : 'text-bad', className)}
    >
      {state.ok ? (state.message ?? 'Saved ✓') : state.error}
    </p>
  );
}

/** Submit button that reflects the enclosing ActionForm's pending state. */
export function Save({
  children = 'Save',
  pendingText = 'Saving…',
  variant = 'primary',
  size = 'sm',
  className,
  name,
  value,
  disabled,
  title,
}: {
  children?: React.ReactNode;
  pendingText?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
  title?: string;
}) {
  const { pending } = React.useContext(Ctx);
  return (
    <button
      type="submit"
      name={name}
      value={value}
      title={title}
      disabled={pending || disabled}
      className={buttonClass(variant, size, className)}
    >
      {pending ? pendingText : children}
    </button>
  );
}

/** Label + control + hint + the field error from the enclosing ActionForm. */
export function Fld({
  label,
  htmlFor,
  name,
  hint,
  className,
  children,
  srOnlyLabel = false,
}: {
  label: React.ReactNode;
  htmlFor: string;
  /** form field name used to look up errors (defaults to htmlFor) */
  name?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  srOnlyLabel?: boolean;
}) {
  const { state } = React.useContext(Ctx);
  const err = state && !state.ok ? state.fieldErrors?.[name ?? htmlFor]?.[0] : undefined;
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <Label htmlFor={htmlFor} className={cn('text-xs', srOnlyLabel && 'sr-only')}>
        {label}
      </Label>
      {children}
      {hint && !err && <p className="text-xs text-ink-soft">{hint}</p>}
      {err && (
        <p role="alert" className="text-xs text-bad">
          {err}
        </p>
      )}
    </div>
  );
}

/** Checkbox with a label, for boolean fields. */
export function Check({
  id,
  name,
  label,
  defaultChecked,
  disabled,
  hint,
}: {
  id: string;
  name: string;
  label: React.ReactNode;
  defaultChecked?: boolean;
  disabled?: boolean;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 py-1">
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 accent-rose-deep"
      />
      <label htmlFor={id} className="text-sm text-ink">
        {label}
        {hint && <span className="block text-xs text-ink-soft">{hint}</span>}
      </label>
    </div>
  );
}

/** Tab strip for sub-routes; highlights the current one. */
export function TabNav({ tabs, label }: { tabs: { href: string; label: string; exact?: boolean }[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="mb-6 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-block border-b-2 px-3 py-2 text-sm font-medium',
                  active ? 'border-rose-deep text-rose-deep' : 'border-transparent text-ink-soft hover:text-ink',
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
