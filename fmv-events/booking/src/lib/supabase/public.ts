import 'server-only';
import { createClient as createSbClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';

/**
 * Anonymous, sessionless client for public reads (catalog, portfolio, policies).
 * Uses the anon key so RLS decides what is public, exactly as for a visitor.
 */
export function createPublicClient() {
  return createSbClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
