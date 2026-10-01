'use client';
// Email + password, then Supabase TOTP (enrol on first sign-in, verify after).
// Owner/staff powers only exist in an aal2 session (enforced in SQL by auth_role()).
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, Card, Field, Input, Notice } from '@/components/ui';

type Step = 'password' | 'loading' | 'enroll' | 'verify';

interface Enrollment {
  factorId: string;
  qr: string;
  secret: string;
}

function qrSrc(qr: string): string {
  if (qr.startsWith('data:')) return qr;
  return `data:image/svg+xml;utf-8,${encodeURIComponent(qr)}`;
}

function authMessage(msg: string | undefined, fallback: string): string {
  if (!msg) return fallback;
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'That email and password don’t match an admin account.';
  if (m.includes('email not confirmed')) return 'This account’s email address hasn’t been confirmed yet.';
  if (m.includes('invalid totp') || m.includes('invalid code') || m.includes('expired')) return 'That code didn’t work. Check your authenticator app and enter the current 6-digit code.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a minute and try again.';
  return fallback;
}

export function LoginForm({
  startAtMfa,
  signedInEmail,
  mfaRequested,
}: {
  startAtMfa: boolean;
  signedInEmail: string | null;
  mfaRequested: boolean;
}) {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const [step, setStep] = React.useState<Step>(startAtMfa ? 'loading' : 'password');
  const [error, setError] = React.useState<string | null>(mfaRequested ? 'Please sign in with your email and password first.' : null);
  const [busy, setBusy] = React.useState(false);
  const [enrollment, setEnrollment] = React.useState<Enrollment | null>(null);
  const [factorId, setFactorId] = React.useState<string | null>(null);
  const [code, setCode] = React.useState('');
  const [email, setEmail] = React.useState(signedInEmail ?? '');
  const codeRef = React.useRef<HTMLInputElement>(null);

  const finishIfAal2 = React.useCallback(async (): Promise<boolean> => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.currentLevel === 'aal2') {
      router.replace('/admin');
      router.refresh();
      return true;
    }
    return false;
  }, [router, supabase]);

  /** Decide between enrolling a new TOTP factor and verifying an existing one. */
  const beginMfa = React.useCallback(async () => {
    setStep('loading');
    setError(null);
    if (await finishIfAal2()) return;

    const { data, error: listErr } = await supabase.auth.mfa.listFactors();
    if (listErr || !data) {
      setStep('password');
      setError(authMessage(listErr?.message, 'We couldn’t load your two-step verification settings. Please sign in again.'));
      return;
    }
    const verified = data.totp[0];
    if (verified) {
      setFactorId(verified.id);
      setEnrollment(null);
      setStep('verify');
      return;
    }

    // No verified authenticator yet: clear half-finished enrolments, then enrol.
    for (const f of data.all) {
      if (f.factor_type === 'totp' && f.status !== 'verified') {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }
    const { data: enrolled, error: enrollErr } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Admin ${new Date().toISOString().slice(0, 16)}`,
    });
    if (enrollErr || !enrolled) {
      setStep('password');
      setError(authMessage(enrollErr?.message, 'We couldn’t start two-step verification setup. Please try again.'));
      return;
    }
    setFactorId(enrolled.id);
    setEnrollment({ factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret });
    setStep('enroll');
  }, [finishIfAal2, supabase]);

  React.useEffect(() => {
    if (!startAtMfa) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        setStep('password');
        setError('Your session ended. Please sign in again.');
        return;
      }
      await beginMfa();
    })();
    return () => {
      cancelled = true;
    };
  }, [startAtMfa, supabase, beginMfa]);

  React.useEffect(() => {
    if (step === 'verify' || step === 'enroll') codeRef.current?.focus();
  }, [step]);

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const em = String(fd.get('email') ?? '').trim();
    const password = String(fd.get('password') ?? '');
    if (!em || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: signErr } = await supabase.auth.signInWithPassword({ email: em, password });
    if (signErr || !data.user) {
      setBusy(false);
      setError(authMessage(signErr?.message, 'Sign-in failed. Please try again.'));
      return;
    }
    // Only owner/staff accounts may use the admin.
    const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', data.user.id).maybeSingle();
    if (!roleRow) {
      await supabase.auth.signOut();
      setBusy(false);
      setError('This account doesn’t have admin access. Clients can sign in from the client portal.');
      return;
    }
    setBusy(false);
    await beginMfa();
  }

  async function onCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const clean = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(clean)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (chErr || !ch) {
      setBusy(false);
      setError(authMessage(chErr?.message, 'We couldn’t start the verification. Please try again.'));
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: clean });
    if (vErr) {
      setBusy(false);
      setCode('');
      setError(authMessage(vErr.message, 'That code didn’t work. Please try again.'));
      return;
    }
    if (!(await finishIfAal2())) {
      setBusy(false);
      setError('Verification succeeded but the session did not upgrade. Please sign in again.');
    }
  }

  async function startOver() {
    await supabase.auth.signOut();
    setEnrollment(null);
    setFactorId(null);
    setCode('');
    setError(null);
    setStep('password');
    router.refresh();
  }

  return (
    <Card className="space-y-4">
      {error && <Notice tone="bad">{error}</Notice>}

      {step === 'loading' && <p className="text-sm text-ink-soft" role="status">Checking two-step verification…</p>}

      {step === 'password' && (
        <form onSubmit={onPassword} className="space-y-4" noValidate>
          <Field label="Email" htmlFor="login-email" required>
            <Input id="login-email" name="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password" htmlFor="login-password" required>
            <Input id="login-password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Continue'}
          </Button>
          <p className="text-xs text-ink-soft">Admin accounts are created by the owner. There is no self sign-up.</p>
        </form>
      )}

      {(step === 'enroll' || step === 'verify') && (
        <form onSubmit={onCode} className="space-y-4" noValidate>
          {step === 'enroll' && enrollment && (
            <div className="space-y-3">
              <h2 className="font-display text-2xl font-semibold">Set up two-step verification</h2>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
                <li>Open an authenticator app (Google Authenticator, 1Password, Authy…).</li>
                <li>Scan this QR code, or enter the setup key by hand.</li>
                <li>Type the 6-digit code the app shows.</li>
              </ol>
              <div className="flex justify-center rounded-xl border border-line bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data URL from Supabase */}
                <img src={qrSrc(enrollment.qr)} alt="QR code for your authenticator app" width={192} height={192} className="h-48 w-48" />
              </div>
              <div>
                <p className="text-xs font-medium text-ink-soft">Setup key</p>
                <code className="block break-all rounded-lg bg-cream-deep px-3 py-2 text-sm tracking-wider">{enrollment.secret}</code>
              </div>
            </div>
          )}
          {step === 'verify' && (
            <div>
              <h2 className="font-display text-2xl font-semibold">Enter your code</h2>
              <p className="text-sm text-ink-soft">Open your authenticator app and enter the current 6-digit code.</p>
            </div>
          )}
          <Field label="6-digit code" htmlFor="login-code" required>
            <Input
              ref={codeRef}
              id="login-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="text-center text-lg tracking-[0.4em]"
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Verifying…' : step === 'enroll' ? 'Verify and finish setup' : 'Verify'}
          </Button>
          <button type="button" onClick={startOver} className="w-full text-center text-sm text-ink-soft underline hover:text-rose-deep">
            Use a different account
          </button>
        </form>
      )}
    </Card>
  );
}
