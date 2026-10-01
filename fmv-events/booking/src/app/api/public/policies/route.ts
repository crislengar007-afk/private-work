import { getPublicPolicies } from '@/lib/catalog';
import { publicJson } from '../_lib';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return publicJson(req, 'policies', () => getPublicPolicies());
}
