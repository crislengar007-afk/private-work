import { renderMarkdown } from '@/lib/markdown';
import { cn } from '@/lib/cn';

/** Owner-authored markdown (escaped by renderMarkdown), styled with .prose-fmv. */
export function Markdown({ md, className }: { md: string | null | undefined; className?: string }) {
  const html = renderMarkdown(md);
  if (!html) return null;
  return <div className={cn('prose-fmv text-sm text-ink', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
