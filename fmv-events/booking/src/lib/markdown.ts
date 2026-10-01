import { Marked } from 'marked';

// Owner-authored markdown (policies, descriptions, emails). Raw HTML is escaped so
// nothing typed into the admin can inject markup.
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const safe = /^(https?:|mailto:|tel:|\/)/i.test(href) ? href : '#';
      return `<a href="${escapeHtml(safe)}"${title ? ` title="${escapeHtml(title)}"` : ''}>${text}</a>`;
    },
  },
});

export function renderMarkdown(md: string | null | undefined): string {
  if (!md) return '';
  return marked.parse(md, { async: false }) as string;
}
