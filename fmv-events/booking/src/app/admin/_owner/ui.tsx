// Server-safe building blocks shared by the owner admin pages.
import * as React from 'react';
import { Select } from '@/components/ui';

export interface MediaOption {
  id: string;
  storage_path: string;
  alt_text: string;
  caption: string | null;
  kind: string;
  is_ai_generated: boolean;
}

export function mediaLabel(m: MediaOption): string {
  const base = m.alt_text || m.caption || m.storage_path.split('/').pop() || m.id;
  const name = base.length > 60 ? `${base.slice(0, 57)}…` : base;
  return `${name}${m.kind === 'video' ? ' (video)' : ''}${m.is_ai_generated ? ' [AI concept]' : ''}`;
}

/** Picks a cover image from the media library (blank = none). */
export function MediaSelect({
  id,
  name = 'cover_media_id',
  media,
  defaultValue,
}: {
  id: string;
  name?: string;
  media: MediaOption[];
  defaultValue?: string | null;
}) {
  return (
    <Select id={id} name={name} defaultValue={defaultValue ?? ''}>
      <option value="">— No cover —</option>
      {media.map((m) => (
        <option key={m.id} value={m.id}>
          {mediaLabel(m)}
        </option>
      ))}
    </Select>
  );
}

export function SectionTitle({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mb-3 mt-8 font-display text-2xl font-semibold text-ink first:mt-0">
      {children}
    </h2>
  );
}

export const MEDIA_OPTION_COLUMNS = 'id, storage_path, alt_text, caption, kind, is_ai_generated';
