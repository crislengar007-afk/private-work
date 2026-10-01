import { getPublicSettings } from '@/lib/catalog';
import { publicJson } from '../_lib';

export const dynamic = 'force-dynamic';

// Public contact fields only. getPublicSettings() never returns the e-Transfer email.
export async function GET(req: Request) {
  return publicJson(req, 'settings', () => getPublicSettings());
}
