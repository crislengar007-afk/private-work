import 'server-only';
import { Resend } from 'resend';
import { createAdminClient } from './supabase/admin';
import { renderMarkdown } from './markdown';

export type TemplateKey =
  | 'inquiry_received_client' | 'inquiry_received_owner' | 'quote_sent' | 'quote_accepted'
  | 'payment_reported_owner' | 'booking_confirmed' | 'hold_expired' | 'balance_reminder'
  | 'mini_held' | 'mini_confirmed' | 'mini_reminder' | 'mini_hold_expired' | 'thank_you'
  | 'message_received_owner';

export interface Attachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

/** Replaces {{tag}} with values (escaped for the markdown/HTML body). Unknown tags become ''. */
export function mergeTags(text: string, vars: Record<string, string | number | null | undefined>, escape = false): string {
  return text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key: string) => {
    const v = vars[key];
    if (v === null || v === undefined) return '';
    const s = String(v);
    return escape ? s.replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;')) : s;
  });
}

function wrapHtml(bodyHtml: string, businessName: string): string {
  return `<!doctype html><html><body style="margin:0;background:#fbf7f2;font-family:Inter,Segoe UI,Arial,sans-serif;color:#2b2527">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="font-family:Georgia,serif;font-size:22px;color:#8e4f57;margin:0 0 20px">${businessName}</p>
<div style="background:#ffffff;border:1px solid #e7dcd3;border-radius:14px;padding:24px;font-size:15px;line-height:1.6">${bodyHtml}</div>
<p style="font-size:12px;color:#5a5054;margin-top:16px">Fredericton, New Brunswick</p>
</div></body></html>`;
}

/**
 * Sends a templated email via Resend and records it in email_log.
 * Without RESEND_API_KEY (local dev) the email is logged as 'skipped' and printed.
 * Never throws: email failures must not undo a booking.
 */
export async function sendTemplatedEmail(opts: {
  template: TemplateKey;
  to: string;
  vars: Record<string, string | number | null | undefined>;
  attachments?: Attachment[];
  entity?: { type: string; id: string };
}): Promise<{ ok: boolean; status: 'sent' | 'failed' | 'skipped' }> {
  const admin = createAdminClient();
  const [{ data: tpl }, { data: settings }] = await Promise.all([
    admin.from('email_templates').select('subject, body_md').eq('key', opts.template).maybeSingle(),
    admin.from('settings').select('business_name, owner_name, email, reply_to_email').eq('id', 1).single(),
  ]);
  const businessName = settings?.business_name ?? 'FMV Events & Photography';
  const vars = { business_name: businessName, owner_name: settings?.owner_name ?? '', ...opts.vars };

  const log = async (status: 'sent' | 'failed' | 'skipped', providerId?: string | null, error?: string) => {
    await admin.from('email_log').insert({
      to_email: opts.to,
      template: opts.template,
      entity_type: opts.entity?.type ?? null,
      entity_id: opts.entity?.id ?? null,
      status,
      provider_id: providerId ?? null,
      error: error ?? null,
    });
  };

  if (!tpl) {
    await log('failed', null, 'template missing');
    return { ok: false, status: 'failed' };
  }

  const subject = mergeTags(tpl.subject, vars);
  const html = wrapHtml(renderMarkdown(mergeTags(tpl.body_md, vars, true)), businessName);

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM; // e.g. "FMV Events & Photography <bookings@yourdomain.ca>"
  if (!apiKey || !from) {
    console.info(`[email:skipped] ${opts.template} -> ${opts.to}: ${subject}`);
    await log('skipped', null, 'RESEND_API_KEY / EMAIL_FROM not configured');
    return { ok: true, status: 'skipped' };
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: opts.to,
      replyTo: settings?.reply_to_email || settings?.email || undefined,
      subject,
      html,
      attachments: opts.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
    });
    if (error) {
      await log('failed', null, error.message);
      return { ok: false, status: 'failed' };
    }
    await log('sent', data?.id);
    return { ok: true, status: 'sent' };
  } catch (e) {
    await log('failed', null, e instanceof Error ? e.message : String(e));
    return { ok: false, status: 'failed' };
  }
}

/** The owner's alert address (settings.email, falling back to OWNER_ALERT_EMAIL). */
export async function ownerAlertEmail(): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from('settings').select('email').eq('id', 1).single();
  return data?.email || process.env.OWNER_ALERT_EMAIL || null;
}
