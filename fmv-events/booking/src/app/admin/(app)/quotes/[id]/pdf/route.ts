import { getSession } from '@/lib/auth';
import { loadQuoteDoc } from '@/lib/documents';
import { renderQuotePdf } from '@/lib/pdf';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Owner-only PDF preview/download of a quote (any status, including drafts). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session.role !== 'owner') return new Response('Owner access required.', { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return new Response('Not found.', { status: 404 });

  const doc = await loadQuoteDoc({ id });
  if (!doc) return new Response('Quote not found.', { status: 404 });
  const pdf = await renderQuotePdf(doc);
  const download = new URL(request.url).searchParams.get('download') === '1';
  const filename = `${doc.number === 'DRAFT' ? `quote-draft-${id.slice(0, 8)}` : doc.number}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
