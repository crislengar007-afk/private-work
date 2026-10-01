import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;
  // Same-origin form posts only (blocks cross-site sign-out nuisance requests).
  const from = req.headers.get('origin');
  if (from && from !== origin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const sb = await createClient();
  await sb.auth.signOut();
  return NextResponse.redirect(new URL('/portal', origin), 303);
}
