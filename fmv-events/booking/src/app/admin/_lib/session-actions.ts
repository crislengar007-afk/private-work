'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** Signs the current user out (only ever affects the caller's own session). */
export async function signOut(): Promise<void> {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect('/admin/login');
}
