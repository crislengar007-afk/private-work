import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [session, sp] = await Promise.all([getSession(), searchParams]);
  if (session.role === 'owner' || session.role === 'staff') redirect('/admin');

  const wantsMfa = sp.step === 'mfa';
  // Signed in with a team account but not yet MFA-verified: go straight to the code step.
  const startAtMfa = Boolean(session.userId && (wantsMfa || session.storedRole));

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <h1 className="mb-1 text-center font-display text-4xl font-semibold text-ink">Admin sign in</h1>
        <p className="mb-6 text-center text-sm text-ink-soft">For the owner and staff. Two-step verification is required.</p>
        <LoginForm startAtMfa={startAtMfa} signedInEmail={session.email} mfaRequested={wantsMfa && !session.userId} />
      </div>
    </main>
  );
}
