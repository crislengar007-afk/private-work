import { getSession } from '@/lib/auth';
import { loadInvoiceDoc } from '@/lib/documents';
import { renderInvoicePdf } from '@/lib/pdf';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Owner-only PDF of an invoice (with the QR to its Pay page). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session.role !== 'owner') return new Response('Owner access required.', { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return new Response('Not found.', { status: 404 });

  const doc = await loadInvoiceDoc({ id });
  if (!doc) return new Response('Invoice not found.', { status: 404 });
  const pdf = await renderInvoicePdf(doc);
  const download = new URL(request.url).searchParams.get('download') === '1';
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${doc.number}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
