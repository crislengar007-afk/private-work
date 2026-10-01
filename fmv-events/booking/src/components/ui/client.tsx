'use client';
// Interactive primitives (need browser APIs).
import * as React from 'react';
import Script from 'next/script';
import { useFormStatus } from 'react-dom';
import { buttonClass } from './index';
import { cn } from '@/lib/cn';

export function CopyButton({ value, label = 'Copy', className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      className={buttonClass('secondary', 'sm', className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard blocked: the value is visible to copy by hand */
        }
      }}
      aria-label={`${label}: ${value}`}
    >
      <span aria-live="polite">{copied ? 'Copied ✓' : label}</span>
    </button>
  );
}

/** Submit button that disables itself while its form's server action runs. */
export function SubmitButton({
  children,
  pendingText = 'Saving…',
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingText?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
  size?: 'sm' | 'md' | 'lg';
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || props.disabled} className={buttonClass(variant, size, className)} {...props}>
      {pending ? pendingText : children}
    </button>
  );
}

/** Live countdown to a deadline (e.g. hold expiry). */
export function Countdown({ to, className }: { to: string; className?: string }) {
  const target = React.useMemo(() => new Date(to).getTime(), [to]);
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    // First tick after mount (not during render) so server and client HTML match.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  if (now === null) return null;
  const ms = target - now;
  if (ms <= 0) return <span className={cn('font-semibold text-bad', className)}>Deadline passed</span>;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const d = Math.floor(h / 24);
  const text = d >= 2 ? `${d} days left` : `${h}h ${String(m).padStart(2, '0')}m left`;
  return <span className={cn('font-semibold', h < 6 ? 'text-bad' : 'text-warn', className)}>{text}</span>;
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
    };
  }
}

/**
 * Cloudflare Turnstile widget. Writes the token into a hidden input named
 * `cf-turnstile-response` (inside forms) and reports it via onToken.
 * Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (local dev).
 */
export function Turnstile({ onToken, className }: { onToken?: (token: string) => void; className?: string }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const ref = React.useRef<HTMLDivElement>(null);
  const rendered = React.useRef(false);
  const [token, setToken] = React.useState('');
  const onTokenRef = React.useRef(onToken);
  React.useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const renderWidget = React.useCallback(() => {
    if (!siteKey || !ref.current || !window.turnstile || rendered.current) return;
    rendered.current = true;
    window.turnstile.render(ref.current, {
      sitekey: siteKey,
      callback: (t: string) => {
        setToken(t);
        onTokenRef.current?.(t);
      },
      'expired-callback': () => setToken(''),
    });
  }, [siteKey]);

  React.useEffect(() => {
    renderWidget();
  }, [renderWidget]);

  if (!siteKey) return null;
  return (
    <div className={className}>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={renderWidget} />
      <div ref={ref} />
      <input type="hidden" name="cf-turnstile-response" value={token} readOnly />
    </div>
  );
}
