'use client';
// Optional reference photos (max 5, 10 MB each, JPEG/PNG/WebP/HEIC). The server
// action validates and rate-limits, then hands back a one-time signed upload URL
// for the private `references` bucket; the file goes straight to Storage.
import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { requestReferenceUpload } from '../actions';
import type { UploadedReference } from './types';

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

function looksLikeImage(f: File): boolean {
  if (OK_TYPES.includes(f.type)) return true;
  return (f.type === '' || f.type === 'application/octet-stream') && /\.(heic|heif)$/i.test(f.name);
}

export function ReferenceUploads({
  references,
  onChange,
  error,
}: {
  references: UploadedReference[];
  onChange: (refs: UploadedReference[]) => void;
  error?: string;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const remaining = MAX_FILES - references.length;

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setProblem(null);
    const files = Array.from(list);
    const problems: string[] = [];
    if (files.length > remaining) problems.push(`You can add ${remaining} more photo${remaining === 1 ? '' : 's'} (5 in total).`);
    let current = references;
    for (const file of files.slice(0, Math.max(remaining, 0))) {
      if (!looksLikeImage(file)) {
        problems.push(`${file.name}: please use JPEG, PNG, WebP or HEIC.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        problems.push(`${file.name} is larger than 10 MB.`);
        continue;
      }
      setBusy(file.name);
      try {
        const res = await requestReferenceUpload({ name: file.name, type: file.type, size: file.size });
        if (!res.ok) {
          problems.push(`${file.name}: ${res.error}`);
          continue;
        }
        const sb = createClient();
        const { error: upErr } = await sb.storage
          .from('references')
          .uploadToSignedUrl(res.data.path, res.data.token, file, { contentType: res.data.contentType });
        if (upErr) {
          problems.push(`${file.name}: the upload didn’t finish. Please try again.`);
          continue;
        }
        current = [...current, { path: res.data.path, name: file.name.slice(0, 120) }];
        onChange(current);
      } catch {
        problems.push(`${file.name}: the upload didn’t finish. Please try again.`);
      }
    }
    setBusy(null);
    if (problems.length) setProblem(problems.join(' '));
    if (inputRef.current) inputRef.current.value = '';
  }

  const shownError = problem ?? error ?? null;
  return (
    <div className="space-y-2">
      <label htmlFor="reference_photos" className="mb-1 block text-sm font-medium text-ink">
        Reference photos <span className="font-normal text-ink-soft">(optional)</span>
      </label>
      <p id="reference_photos-hint" className="text-xs text-ink-soft">
        Up to 5 images, 10 MB each (JPEG, PNG, WebP or HEIC). Only our team can see them.
      </p>
      <input
        ref={inputRef}
        id="reference_photos"
        type="file"
        accept={ACCEPT}
        multiple
        disabled={remaining <= 0 || busy !== null}
        onChange={(e) => handleFiles(e.target.files)}
        aria-describedby={shownError ? 'reference_photos-hint reference_photos-error' : 'reference_photos-hint'}
        className="block w-full text-sm text-ink file:mr-3 file:rounded-full file:border-0 file:bg-blush file:px-4 file:py-2 file:text-sm file:font-medium file:text-rose-deep hover:file:bg-blush-soft disabled:opacity-50"
      />
      {busy && (
        <p role="status" className="text-sm text-ink-soft">
          Uploading {busy}…
        </p>
      )}
      {shownError && (
        <p id="reference_photos-error" role="alert" className="text-sm text-bad">
          {shownError}
        </p>
      )}
      {references.length > 0 && (
        <ul className="space-y-1 text-sm" aria-label="Uploaded photos">
          {references.map((r) => (
            <li key={r.path} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-line">
              <span className="min-w-0 truncate">
                <span aria-hidden className="mr-1 text-ok">✓</span>
                {r.name}
              </span>
              <button
                type="button"
                className="shrink-0 rounded-full px-2 py-1 text-xs text-rose-deep underline hover:bg-blush-soft"
                onClick={() => onChange(references.filter((x) => x.path !== r.path))}
                aria-label={`Remove ${r.name}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
