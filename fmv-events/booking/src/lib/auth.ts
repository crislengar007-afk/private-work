import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';

export type AppRole = 'owner' | 'staff' | 'client' | 'anon';

export interface SessionInfo {
  userId: string | null;
  email: string | null;
  /** Role after MFA: owner/staff only with an aal2 session (same rule as auth_role() in SQL). */
  role: AppRole;
  /** Role stored for the user, regardless of MFA (used to route to the MFA step). */
  storedRole: 'owner' | 'staff' | null;
  aal: 'aal1' | 'aal2' | null;
}

export async function getSession(): Promise<SessionInfo> {
  const sb = await createClient();
  const { data: userData } = await sb.auth.getUser();
  const user = userData.user;
  if (!user) return { userId: null, email: null, role: 'anon', storedRole: null, aal: null };

  const [{ data: aalData }, { data: roleRow }, { data: role }] = await Promise.all([
    sb.auth.mfa.getAuthenticatorAssuranceLevel(),
    sb.from('user_roles').select('role').eq('user_id', user.id).maybeSingle(),
    sb.rpc('auth_role'),
  ]);
  return {
    userId: user.id,
    email: user.email ?? null,
    role: (role as AppRole) ?? 'client',
    storedRole: (roleRow?.role as 'owner' | 'staff' | undefined) ?? null,
    aal: (aalData?.currentLevel as 'aal1' | 'aal2' | null) ?? null,
  };
}

/** Owner or staff with MFA. Sends others to the admin sign-in / MFA step. */
export async function requireTeam(): Promise<SessionInfo> {
  const s = await getSession();
  if (s.role === 'owner' || s.role === 'staff') return s;
  if (s.storedRole) redirect('/admin/login?step=mfa');
  redirect('/admin/login');
}

export async function requireOwner(): Promise<SessionInfo> {
  const s = await requireTeam();
  if (s.role !== 'owner') redirect('/admin?denied=1');
  return s;
}

/** For server actions: returns the session or throws (actions are reachable by direct POST). */
export async function assertOwner(): Promise<SessionInfo> {
  const s = await getSession();
  if (s.role !== 'owner') throw new Error('Not authorized');
  return s;
}

export async function assertTeam(): Promise<SessionInfo> {
  const s = await getSession();
  if (s.role !== 'owner' && s.role !== 'staff') throw new Error('Not authorized');
  return s;
}
