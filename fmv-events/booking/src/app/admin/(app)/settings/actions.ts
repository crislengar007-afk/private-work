'use server';
import { z } from 'zod';
import { assertOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fail, ok, type ActionResult } from '@/lib/errors';
import { normalizePhone } from '@/lib/phone';
import { appUrl } from '@/lib/request';
import { checkbox, dbFail, formFields, intField, invalid, optEmail, optText, optUrl, refresh, reqText, uuidField } from '@/app/admin/_owner/server';
import { APP_ROLES } from '@/app/admin/_owner/labels';

type R = ActionResult<unknown>;
const PATH = '/admin/settings';

const optPhone = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number, e.g. 506-555-0123' });
      return z.NEVER;
    }
    return n;
  });

const postal = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const m = /^([A-Za-z]\d[A-Za-z])[ -]?(\d[A-Za-z]\d)$/.exec(v);
    if (!m) {
      ctx.addIssue({ code: 'custom', message: 'Enter a Canadian postal code, e.g. E3B 1A1' });
      return z.NEVER;
    }
    return `${m[1]} ${m[2]}`.toUpperCase();
  });

const percentToBp = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(v) || Number(v) > 50) {
      ctx.addIssue({ code: 'custom', message: 'Enter a rate between 0 and 50, e.g. 15' });
      return z.NEVER;
    }
    return Math.round(Number(v) * 100);
  });

const groups = {
  business: z.object({
    business_name: reqText('Business name', 120),
    owner_name: reqText('Owner name', 120),
    address_line: optText(200),
    city: reqText('City', 80),
    province: reqText('Province', 40),
    postal_code: postal,
    hours_text: optText(500),
  }),
  contact: z.object({
    phone_e164: optPhone,
    whatsapp_e164: optPhone,
    email: optEmail,
    reply_to_email: optEmail,
    messenger_url: optUrl,
    facebook_url: optUrl,
    instagram_url: optUrl,
  }),
  payments: z.object({
    etransfer_email: optEmail,
    etransfer_autodeposit: checkbox,
    deposit_pct: intField('Deposit %', 0, 100),
    hold_hours: intField('Hold hours', 1, 720),
    balance_due_days_before_event: intField('Balance due days', 0, 365),
    quote_valid_days: intField('Quote valid days', 1, 90),
  }),
  tax: z.object({
    tax_enabled: checkbox,
    tax_rate_bp: percentToBp,
    hst_number: optText(40),
  }),
  reviews: z.object({
    google_review_url: optUrl,
    facebook_review_url: optUrl,
  }),
} as const;

export type SettingsGroup = keyof typeof groups;

export async function saveSettings(group: string, _prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  if (!(group in groups)) return fail('Unknown settings group.');
  const schema = groups[group as SettingsGroup];
  const p = schema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  const sb = await createClient();
  const { error } = await sb.from('settings').update(p.data).eq('id', 1);
  if (error) return dbFail(error);
  refresh(PATH, { public: true });
  return ok(null);
}

// ------------------------------------------------------------------ team
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  role: z.enum(APP_ROLES),
  display_name: optText(80),
});

async function findUserIdByEmail(admin: ReturnType<typeof createAdminClient>, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** Invites a team member (or grants a role to an existing account). */
export async function inviteTeamMember(_prev: R | null, fd: FormData): Promise<R> {
  await assertOwner();
  const p = inviteSchema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return fail('Inviting needs the Supabase service key to be configured on the server.');
  }

  let userId: string | null = null;
  let invited = false;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(p.data.email, {
    redirectTo: appUrl('/admin/login'),
    data: p.data.display_name ? { display_name: p.data.display_name } : undefined,
  });
  if (data?.user) {
    userId = data.user.id;
    invited = true;
  } else if (error) {
    // Existing accounts can't be re-invited: give them the role instead.
    userId = await findUserIdByEmail(admin, p.data.email);
    if (!userId) {
      console.error('[admin] invite failed', error.message);
      return fail(`Could not send the invite: ${error.message}`);
    }
  }
  if (!userId) return fail('Could not send the invite.');

  const sb = await createClient();
  const { error: rErr } = await sb
    .from('user_roles')
    .upsert({ user_id: userId, role: p.data.role, display_name: p.data.display_name }, { onConflict: 'user_id' });
  if (rErr) return dbFail(rErr);
  refresh(PATH);
  return ok(
    null,
    invited
      ? `Invite sent to ${p.data.email} ✓ They’ll set a password and an authenticator app at first sign-in.`
      : `${p.data.email} already had an account: they now have the ${p.data.role} role ✓`,
  );
}

async function ownerCount(sb: Awaited<ReturnType<typeof createClient>>): Promise<number> {
  const { count } = await sb.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role', 'owner');
  return count ?? 0;
}

const roleSchema = z.object({ role: z.enum(APP_ROLES), display_name: optText(80) });

export async function updateTeamMember(userId: string, _prev: R | null, fd: FormData): Promise<R> {
  const me = await assertOwner();
  if (!uuidField.safeParse(userId).success) return fail('Unknown team member.');
  const p = roleSchema.safeParse(formFields(fd));
  if (!p.success) return invalid(p.error);
  const sb = await createClient();
  const { data: cur } = await sb.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
  if (!cur) return fail('Unknown team member.');
  if (cur.role === 'owner' && p.data.role !== 'owner') {
    if (userId === me.userId) return fail('You can’t remove your own owner role. Ask another owner to do it.');
    if ((await ownerCount(sb)) <= 1) return fail('There must always be at least one owner.');
  }
  const { error } = await sb.from('user_roles').update(p.data).eq('user_id', userId);
  if (error) return dbFail(error);
  refresh(PATH);
  return ok(null);
}

export async function removeTeamMember(userId: string, _prev: R | null, _fd: FormData): Promise<R> {
  void _fd;
  const me = await assertOwner();
  if (!uuidField.safeParse(userId).success) return fail('Unknown team member.');
  if (userId === me.userId) return fail('You can’t remove yourself.');
  const sb = await createClient();
  const { data: cur } = await sb.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
  if (!cur) return fail('Unknown team member.');
  if (cur.role === 'owner' && (await ownerCount(sb)) <= 1) return fail('There must always be at least one owner.');
  const { error } = await sb.from('user_roles').delete().eq('user_id', userId);
  if (error) return dbFail(error);
  refresh(PATH);
  return ok(null, 'Removed from the team. Their account remains, without admin access.');
}
