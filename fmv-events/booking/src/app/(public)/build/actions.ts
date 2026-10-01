'use server';
// Anonymous server actions for the event builder. Every input is re-validated
// here; nothing from the browser (prices, totals, paths) is trusted.

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guardAnonymousWrite } from '@/lib/guard';
import { clientIp } from '@/lib/request';
import { fieldErrors, inquirySchema } from '@/lib/schemas';
import { createInquiry } from '@/lib/workflows';
import { createAdminClient } from '@/lib/supabase/admin';
import { fail, ok, type ActionResult } from '@/lib/errors';
import { monctonToday } from '@/lib/time';
import { rateLimitOnly } from '@/components/booking/rate-limit';

const MAX_BYTES = 10 * 1024 * 1024;
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};
const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};
/** Only paths this action hands out are accepted back on submit. */
const REFERENCE_PATH = /^inquiries\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z0-9_-]{1,60}\.(jpg|png|webp|heic|heif)$/;

const uploadRequestSchema = z.object({
  name: z.string().trim().min(1, 'That file has no name').max(255),
  type: z.string().max(100),
  size: z
    .number()
    .int()
    .positive('That file is empty')
    .max(MAX_BYTES, 'Each photo must be 10 MB or smaller'),
});

function resolveMime(name: string, type: string): string | null {
  const t = type.toLowerCase();
  if (MIME_EXT[t]) return t;
  // Some browsers report HEIC as '' or octet-stream: fall back to the extension.
  if (t === '' || t === 'application/octet-stream') {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    return EXT_MIME[ext] ?? null;
  }
  return null;
}

function safeFileName(name: string, mime: string): string {
  const base =
    name
      .replace(/\.[^.]*$/, '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'photo';
  return `${base}.${MIME_EXT[mime]}`;
}

/**
 * Step 7 reference photos. Validates the declared type/size, rate-limits the IP
 * (15 per 10 min), then creates a one-time signed upload URL in the PRIVATE
 * `references` bucket under inquiries/<random-uuid>/<safe-name>. The browser
 * uploads straight to Storage, where the bucket itself enforces the 10 MB limit
 * and the image MIME allowlist (server-function bodies are capped far below
 * 10 MB on Vercel, so the bytes cannot go through this action).
 */
export async function requestReferenceUpload(input: {
  name: string;
  type: string;
  size: number;
}): Promise<ActionResult<{ path: string; token: string; contentType: string }>> {
  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'That file cannot be uploaded.');
  const mime = resolveMime(parsed.data.name, parsed.data.type);
  if (!mime) return fail('Photos must be JPEG, PNG, WebP or HEIC images.');

  const ip = await clientIp();
  const limit = await rateLimitOnly({ action: 'upload', ip, max: 15 });
  if (!limit.ok) return fail(limit.error);

  const path = `inquiries/${randomUUID()}/${safeFileName(parsed.data.name, mime)}`;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from('references').createSignedUploadUrl(path);
    if (error || !data) {
      console.error('[build] signed upload url failed', error?.message);
      return fail('We could not prepare that upload. Please try again.');
    }
    return ok({ path, token: data.token, contentType: mime });
  } catch (e) {
    console.error('[build] upload unavailable', e);
    return fail('Uploads are unavailable right now. You can skip photos and send them later.');
  }
}

/** Keeps only reference paths that we issued and that were actually uploaded. */
async function existingReferences(paths: string[]): Promise<string[]> {
  const valid = [...new Set(paths)].filter((p) => REFERENCE_PATH.test(p)).slice(0, 5);
  if (valid.length === 0) return [];
  const admin = createAdminClient();
  const found: string[] = [];
  for (const p of valid) {
    const slash = p.lastIndexOf('/');
    const dir = p.slice(0, slash);
    const name = p.slice(slash + 1);
    const { data } = await admin.storage.from('references').list(dir, { limit: 5, search: name });
    if (data?.some((o) => o.name === name)) found.push(p);
  }
  return found;
}

/** Step 9 submit: validate → Turnstile + rate limit → create the inquiry (no date is held). */
export async function submitInquiry(input: unknown): Promise<ActionResult<{ email: string }>> {
  // Validate first (no side effects) so a typo doesn't burn the single-use Turnstile token.
  const parsed = inquirySchema.safeParse(input);
  if (!parsed.success) return fail('Please check the highlighted details.', fieldErrors(parsed.error));
  if (parsed.data.event_date < monctonToday()) {
    return fail('Please check the highlighted details.', { event_date: ['Pick a date that hasn’t passed'] });
  }

  const ip = await clientIp();
  const guard = await guardAnonymousWrite({ action: 'inquiry', ip, turnstileToken: parsed.data.turnstile_token });
  if (!guard.ok) return fail(guard.error);

  try {
    const referencePaths = await existingReferences(parsed.data.reference_paths);
    await createInquiry({ ...parsed.data, reference_paths: referencePaths, source: 'builder', turnstile_token: null });
  } catch (e) {
    console.error('[build] inquiry failed', e);
    return fail('We could not send your request right now. Please try again in a moment, or contact us directly.');
  }
  revalidatePath('/admin/inquiries');
  return ok({ email: parsed.data.contact.email });
}
