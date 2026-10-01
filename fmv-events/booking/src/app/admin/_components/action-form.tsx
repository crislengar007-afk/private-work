'use client';
// A form bound to a server action that returns ActionResult. Submits without
// React's automatic form reset (so rejected values stay on screen), shows the
// action's error/success line and exposes the pending state to <FormButton>.
import * as React from 'react';
import { buttonClass } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { FormAction, FormState } from '../_lib/form-state';

interface Ctx {
  pending: boolean;
  state: FormState;
}
const FormCtx = React.createContext<Ctx>({ pending: false, state: null });

export function useActionFormState() {
  return React.useContext(FormCtx);
}

export function ActionForm({
  action,
  children,
  className,
  confirm,
  resetOnSuccess = false,
  showSuccess = true,
  statusClassName,
  'aria-label': ariaLabel,
}: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
  /** Ask the user to confirm before submitting. */
  confirm?: string;
  resetOnSuccess?: boolean;
  showSuccess?: boolean;
  statusClassName?: string;
  'aria-label'?: string;
}) {
  const [state, dispatch, pending] = React.useActionState(action, null);
  const ref = React.useRef<HTMLFormElement>(null);
  const [, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(e.currentTarget, submitter ?? undefined);
    startTransition(() => dispatch(fd));
  };

  const fieldErrs = state && !state.ok ? Object.entries(state.fieldErrors ?? {}) : [];

  return (
    <FormCtx.Provider value={{ pending, state }}>
      <form ref={ref} onSubmit={onSubmit} className={className} aria-label={ariaLabel} aria-busy={pending}>
        {children}
        <div aria-live="polite" className={cn('text-xs', statusClassName)}>
          {state && !state.ok && (
            <div role="alert" className="mt-1 text-bad">
              <p>{state.error}</p>
              {fieldErrs.length > 1 && (
                <ul className="mt-1 list-disc pl-4">
                  {fieldErrs.slice(1, 6).map(([k, msgs]) => (
                    <li key={k}>{msgs[0]}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {state?.ok && showSuccess && state.message && <p className="mt-1 text-ok">{state.message}</p>}
        </div>
      </form>
    </FormCtx.Provider>
  );
}

/** Submit button that shows the pending state of its ActionForm. */
export function FormButton({
  children,
  pendingText = 'Saving…',
  variant = 'primary',
  size = 'sm',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingText?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
  size?: 'sm' | 'md' | 'lg';
}) {
  const { pending } = useActionFormState();
  return (
    <button type="submit" {...props} disabled={pending || props.disabled} className={buttonClass(variant, size, className)}>
      {pending ? pendingText : children}
    </button>
  );
}

/** First field error for a name, from the surrounding ActionForm's last result. */
export function FieldError({ name, id }: { name: string; id?: string }) {
  const { state } = useActionFormState();
  const msg = state && !state.ok ? state.fieldErrors?.[name]?.[0] : undefined;
  if (!msg) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-bad">
      {msg}
    </p>
  );
}
