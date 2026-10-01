import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';

/**
 * Service-role client. BYPASSES RLS. Use only in trusted server code (server
 * actions, route handlers, cron) after validating input. Never import this from
 * a client component; the 'server-only' import above makes that a build error.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin client is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type AdminClient = ReturnType<typeof createAdminClient>;
