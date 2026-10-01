'use client';
// Uploads straight from the browser to the public `media` bucket as the signed-in
// owner (Storage RLS allows only the MFA-verified owner), reading image/video
// dimensions first, then records the row through a server action. Going direct
// avoids the 1 MB server-action body limit for photos and reels.
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Input, Label, Select, buttonClass } from '@/components/ui';
import { recordUpload } from './actions';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm';
const MAX_BYTES = 50 * 1024 * 1024;

function safeName(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'file';
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) : '';
  return ext ? `${base}.${ext}` : base;
}

function readDimensions(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const done = (w: number | null, h: number | null) => {
      URL.revokeObjectURL(url);
      resolve({ width: w || null, height: h || null });
    };
    if (file.type.startsWith('video/')) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight);
      v.onerror = () => done(null, null);
      v.src = url;
    } else {
      const img = new window.Image();
      img.onload = () => done(img.naturalWidth, img.naturalHeight);
      img.onerror = () => done(null, null);
      img.src = url;
    }
  });
}

type Item = { name: string; status: 'waiting' | 'uploading' | 'done' | 'error'; message?: string };

export function MediaUploader({ categories }: { categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState<Item[]>([]);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const altRef = React.useRef<HTMLInputElement>(null);
  const catRef = React.useRef<HTMLSelectElement>(null);

  async function upload() {
    const files = Array.from(fileRef.current?.files ?? []);
    if (!files.length) return;
    setBusy(true);
    setItems(files.map((f) => ({ name: f.name, status: 'waiting' })));
    const set = (i: number, patch: Partial<Item>) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    const sb = createClient();
    const alt = altRef.current?.value.trim() ?? '';
    const categoryId = catRef.current?.value || null;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!ACCEPT.split(',').includes(f.type)) {
        set(i, { status: 'error', message: 'Only JPEG, PNG, WebP, AVIF, MP4 or WebM files.' });
        continue;
      }
      if (f.size > MAX_BYTES) {
        set(i, { status: 'error', message: 'Files must be 50 MB or smaller.' });
        continue;
      }
      set(i, { status: 'uploading' });
      try {
        const dims = await readDimensions(f);
        const path = `uploads/${crypto.randomUUID()}-${safeName(f.name)}`;
        const { error } = await sb.storage.from('media').upload(path, f, { contentType: f.type, cacheControl: '31536000', upsert: false });
        if (error) {
          set(i, { status: 'error', message: error.message.includes('row-level security') ? 'Not allowed: sign in again with your authenticator code.' : error.message });
          continue;
        }
        const res = await recordUpload({
          storage_path: path,
          kind: f.type.startsWith('video/') ? 'video' : 'photo',
          width: dims.width,
          height: dims.height,
          alt_text: alt,
          category_id: categoryId,
        });
        set(i, res.ok ? { status: 'done' } : { status: 'error', message: res.error });
      } catch (e) {
        set(i, { status: 'error', message: e instanceof Error ? e.message : 'Upload failed' });
      }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="up-files" className="text-xs">Photos or videos</Label>
          <input
            id="up-files"
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            disabled={busy}
            className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-blush file:px-4 file:py-2 file:text-sm file:font-medium file:text-rose-deep"
          />
          <p className="mt-1 text-xs text-ink-soft">JPEG, PNG, WebP, AVIF, MP4 or WebM, up to 50 MB each.</p>
        </div>
        <div>
          <Label htmlFor="up-alt" className="text-xs">Alt text for this batch (optional)</Label>
          <Input id="up-alt" ref={altRef} disabled={busy} placeholder="Describe what’s in the photo" />
        </div>
        <div>
          <Label htmlFor="up-cat" className="text-xs">Category (optional)</Label>
          <Select id="up-cat" ref={catRef} disabled={busy} defaultValue="">
            <option value="">— None —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
      </div>
      <button type="button" onClick={upload} disabled={busy} className={buttonClass('primary', 'md')}>
        {busy ? 'Uploading…' : 'Upload'}
      </button>
      {items.length > 0 && (
        <ul className="space-y-1 text-sm" aria-live="polite">
          {items.map((it, i) => (
            <li key={i} className={it.status === 'error' ? 'text-bad' : it.status === 'done' ? 'text-ok' : 'text-ink-soft'}>
              {it.name}: {it.status === 'done' ? 'uploaded ✓' : it.status === 'error' ? it.message : it.status === 'uploading' ? 'uploading…' : 'waiting'}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-soft">
        New uploads don’t appear on the website until you tick “Show in portfolio” (alt text required) or use them as a cover.
      </p>
    </div>
  );
}
