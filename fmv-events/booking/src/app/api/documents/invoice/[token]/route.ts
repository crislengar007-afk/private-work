import { loadInvoiceDoc } from '@/lib/documents';
import { renderInvoicePdf } from '@/lib/pdf';
import { isPlausibleToken } from '@/lib/tokens';
import { publicApiRateLimit } from '@/lib/guard';
import { clientIp } from '@/lib/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const notFound = () =>
  new Response('Not found', { status: 404, headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' } });

/** Invoice PDF by its public (pay page) token. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!isPlausibleToken(token)) return notFound();
  if (!(await publicApiRateLimit(await clientIp(), 'pdf'))) {
    return new Response('Too many requests. Please try again in a minute.', { status: 429, headers: { 'retry-after': '60' } });
  }
  let doc: Awaited<ReturnType<typeof loadInvoiceDoc>>;
  let buf: Buffer;
  try {
    doc = await loadInvoiceDoc({ token });
    if (!doc) return notFound();
    buf = await renderInvoicePdf(doc);
  } catch (e) {
    console.error('[documents] invoice pdf failed', e);
    return new Response('We could not generate this PDF right now. Please try again shortly.', {
      status: 503,
      headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex', 'retry-after': '30' },
    });
  }
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${doc.number.replace(/[^A-Za-z0-9_-]/g, '')}.pdf"`,
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
      'referrer-policy': 'no-referrer',
    },
  });
}
