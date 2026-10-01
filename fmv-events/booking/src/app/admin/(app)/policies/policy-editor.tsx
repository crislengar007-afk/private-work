'use client';
// Markdown editor with a live preview, rendered with the same escaped renderer
// the public site uses.
import * as React from 'react';
import { renderMarkdown } from '@/lib/markdown';
import { Input, Textarea } from '@/components/ui';
import { ActionForm, Fld, Save, type FormAction } from '@/app/admin/_owner/form';

export function PolicyEditor({
  id,
  action,
  title,
  body,
  saveLabel = 'Save policy',
}: {
  id: string;
  action: FormAction;
  title: string;
  body: string;
  saveLabel?: string;
}) {
  const [text, setText] = React.useState(body);
  const deferred = React.useDeferredValue(text);
  const html = React.useMemo(() => renderMarkdown(deferred), [deferred]);
  const dirty = text !== body;

  return (
    <ActionForm action={action} aria-label={`Edit ${title || 'policy'}`} className="space-y-3">
      <Fld label="Title" htmlFor={`${id}-title`} name="title">
        <Input id={`${id}-title`} name="title" required defaultValue={title} />
      </Fld>
      <div className="grid gap-4 lg:grid-cols-2">
        <Fld label="Text (markdown)" htmlFor={`${id}-body`} name="body_md" hint="**bold**, *italic*, - bullet lists, [link](https://…)">
          <Textarea
            id={`${id}-body`}
            name="body_md"
            required
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="font-mono text-[13px]"
          />
        </Fld>
        <div className="min-w-0">
          <p className="mb-1 text-xs font-medium text-ink">Preview</p>
          <div
            className="prose-fmv min-h-40 rounded-lg border border-line bg-cream/50 px-4 py-2 text-sm"
            aria-live="off"
            dangerouslySetInnerHTML={{ __html: html || '<p><em>Nothing yet.</em></p>' }}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Save size="md">{saveLabel}</Save>
        {dirty && <span className="text-xs text-warn">Unsaved changes</span>}
      </div>
    </ActionForm>
  );
}
