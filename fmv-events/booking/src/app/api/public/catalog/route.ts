import { getPublicCatalog } from '@/lib/catalog';
import { publicJson } from '../_lib';

export const dynamic = 'force-dynamic';

// Categories, active public services, active packages (with à la carte value),
// active add-ons and service zones.
export async function GET(req: Request) {
  return publicJson(req, 'catalog', () => getPublicCatalog());
}
