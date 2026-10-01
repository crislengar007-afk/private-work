'use client';
// Subject + markdown body editor with clickable merge tags and a live preview
// rendered on the server with sample values (same merge as real emails).
import * as React from 'react';
import { Input, Textarea } from '@/components/ui';
import { ActionForm, Fld, Save, type FormAction } from '@/app/admin/_owner/form';
import { tagsUsed, type MergeTag } from '../merge-tags';
import { previewTemplate } from '../actions';

export function TemplateEditor({
  templateKey,
  action,
  subject: initialSubject,
  body: initialBody,
  tags,
  initialPreview,
}: {
  templateKey: string;
  action: FormAction;
  subject: string;
  body: string;
  tags: MergeTag[];
  initialPreview: { subject: string; html: string };
}) {
  const [subject, setSubject] = React.useState(initialSubject);
  const [body, setBody] = React.useState(initialBody);
  const [preview, setPreview] = React.useState(initialPreview);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const first = React.useRef(true);

  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      startTransition(async () => {
        const res = await previewTemplate({ key: templateKey, subject, body_md: body });
        if (res.ok) {
          setPreview(res.data);
          setPreviewError(null);
        } else {
          setPreviewError(res.error);
        }
      });
    }, 400);
    return () => clearTimeout(t);
  }, [subject, body, templateKey]);

  const known = new Set(tags.map((t) => t.tag));
  const unknown = tagsUsed(`${subject}\n${body}`).filter((t) => !known.has(t));
  const dirty = subject !== initialSubject || body !== initialBody;

  function insert(tag: string) {
    const el = bodyRef.current;
    const token = `{{${tag}}}`;
    if (!el) {
      setBody((b) => b + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ActionForm action={action} aria-label="Edit template" className="space-y-3">
        <Fld label="Subject" htmlFor="tpl-subject" name="subject">
          <Input id="tpl-subject" name="subject" required value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Fld>
        <Fld label="Body (markdown)" htmlFor="tpl-body" name="body_md">
          <Textarea
            id="tpl-body"
            ref={bodyRef}
            name="body_md"
            required
            rows={16}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="font-mono text-[13px]"
          />
        </Fld>
        {unknown.length > 0 && (
          <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
            Not available in this email, so they’ll be blank: {unknown.map((t) => `{{${t}}}`).join(', ')}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Save size="md">Save template</Save>
          {dirty && <span className="text-xs text-warn">Unsaved changes</span>}
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-ink">Merge tags (click to insert at the cursor)</p>
          <ul className="space-y-1">
            {tags.map((t) => (
              <li key={t.tag} className="flex flex-wrap items-baseline gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => insert(t.tag)}
                  className="rounded bg-blush-soft px-1.5 py-0.5 font-mono text-rose-deep hover:bg-blush"
                >
                  {`{{${t.tag}}}`}
                </button>
                <span className="text-ink-soft">{t.description}</span>
              </li>
            ))}
          </ul>
        </div>
      </ActionForm>

      <div className="min-w-0">
        <p className="mb-1 text-xs font-medium text-ink">Preview with sample values</p>
        <div className="rounded-xl border border-line bg-cream p-4">
          <p className="mb-3 border-b border-line pb-2 text-sm">
            <span className="text-ink-soft">Subject: </span>
            <strong>{preview.subject}</strong>
          </p>
          <div className="prose-fmv rounded-lg border border-line bg-white px-4 py-2 text-sm" dangerouslySetInnerHTML={{ __html: preview.html }} />
        </div>
        {previewError && <p role="alert" className="mt-2 text-xs text-bad">{previewError}</p>}
      </div>
    </div>
  );
}
