import type { Metadata } from 'next';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatPhone } from '@/lib/phone';
import { formatDateTime } from '@/lib/time';
import { Badge, Card, EmptyState, Input, Notice, PageHeader, Select, Textarea } from '@/components/ui';
import { ActionForm, Check, Fld, Save } from '@/app/admin/_owner/form';
import { getTeamMembers } from '@/app/admin/_owner/server';
import { SectionTitle } from '@/app/admin/_owner/ui';
import { inviteTeamMember, removeTeamMember, saveSettings, updateTeamMember } from './actions';

export const metadata: Metadata = { title: 'Settings' };

function Group({
  id,
  title,
  description,
  group,
  values,
  children,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  group: string;
  values: unknown;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-20">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      {description && <div className="mb-3 mt-1 text-sm text-ink-soft">{description}</div>}
      <ActionForm action={saveSettings.bind(null, group)} aria-label={title} className="mt-3 grid gap-3 sm:grid-cols-2">
        {/* Re-mount the inputs when the saved values change, so normalized values (phone, postal code) show. */}
        <div key={JSON.stringify(values)} className="contents">
          {children}
        </div>
        <div className="sm:col-span-2">
          <Save size="md">Save {title.toLowerCase()}</Save>
        </div>
      </ActionForm>
    </Card>
  );
}

export default async function SettingsPage() {
  const session = await requireOwner();
  const sb = await createClient();
  const { data: s, error } = await sb.from('settings').select('*').eq('id', 1).single();
  const team = await getTeamMembers();

  if (!s) {
    return (
      <div>
        <PageHeader title="Settings" />
        <Notice tone="bad" title="Settings could not be loaded.">{error?.message}</Notice>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description={<>One place for every public business fact. Last changed {formatDateTime(s.updated_at)}.</>}
      />
      {!s.phone_e164 && (
        <Notice tone="warn" title="Phone number not set — confirm the correct number (FB shows 506-471-4367, Schedulista shows 506-471-6367)">
          Enter the confirmed number under Contact. It appears everywhere on the website once saved.
        </Notice>
      )}
      {!s.etransfer_email && (
        <Notice tone="warn" title="e-Transfer email not set">
          Clients can’t pay invoices until you add the e-Transfer email under Payments.
        </Notice>
      )}

      <nav aria-label="Settings sections" className="flex flex-wrap gap-2 text-sm">
        {[
          ['#business', 'Business'],
          ['#contact', 'Contact'],
          ['#payments', 'Payments'],
          ['#tax', 'Tax'],
          ['#reviews', 'Reviews'],
          ['#team', 'Team'],
        ].map(([href, label]) => (
          <a key={href} href={href} className="rounded-full border border-line bg-white px-3 py-1 hover:border-rose-deep">
            {label}
          </a>
        ))}
      </nav>

      <Group
        id="business"
        title="Business"
        group="business"
        values={[s.business_name, s.owner_name, s.address_line, s.city, s.province, s.postal_code, s.hours_text]}
      >
        <Fld label="Business name" htmlFor="s-bn" name="business_name">
          <Input id="s-bn" name="business_name" required defaultValue={s.business_name} />
        </Fld>
        <Fld label="Owner name" htmlFor="s-on" name="owner_name">
          <Input id="s-on" name="owner_name" required defaultValue={s.owner_name} />
        </Fld>
        <Fld label="Street address" htmlFor="s-addr" name="address_line" className="sm:col-span-2" hint="Leave blank if you don’t want a street address shown.">
          <Input id="s-addr" name="address_line" defaultValue={s.address_line ?? ''} />
        </Fld>
        <Fld label="City" htmlFor="s-city" name="city">
          <Input id="s-city" name="city" required defaultValue={s.city} />
        </Fld>
        <div className="grid grid-cols-2 gap-3">
          <Fld label="Province" htmlFor="s-prov" name="province">
            <Input id="s-prov" name="province" required defaultValue={s.province} />
          </Fld>
          <Fld label="Postal code" htmlFor="s-postal" name="postal_code">
            <Input id="s-postal" name="postal_code" defaultValue={s.postal_code ?? ''} autoCapitalize="characters" />
          </Fld>
        </div>
        <Fld label="Hours" htmlFor="s-hours" name="hours_text" className="sm:col-span-2" hint="Shown on the contact page, e.g. “By appointment, 7 days a week”.">
          <Textarea id="s-hours" name="hours_text" rows={2} className="min-h-0" defaultValue={s.hours_text ?? ''} />
        </Fld>
      </Group>

      <Group
        id="contact"
        title="Contact"
        group="contact"
        description="Shown everywhere on the website and in emails."
        values={[s.phone_e164, s.whatsapp_e164, s.email, s.reply_to_email, s.messenger_url, s.facebook_url, s.instagram_url]}
      >
        <Fld label="Phone" htmlFor="s-phone" name="phone_e164" hint="Saved in international format (+1…).">
          <Input id="s-phone" name="phone_e164" type="tel" autoComplete="off" defaultValue={formatPhone(s.phone_e164)} />
        </Fld>
        <Fld label="WhatsApp number" htmlFor="s-wa" name="whatsapp_e164">
          <Input id="s-wa" name="whatsapp_e164" type="tel" autoComplete="off" defaultValue={formatPhone(s.whatsapp_e164)} />
        </Fld>
        <Fld label="Email (public, and where alerts go)" htmlFor="s-email" name="email">
          <Input id="s-email" name="email" type="email" defaultValue={s.email ?? ''} />
        </Fld>
        <Fld label="Reply-to email" htmlFor="s-reply" name="reply_to_email" hint="Client replies to app emails go here. Defaults to the email above.">
          <Input id="s-reply" name="reply_to_email" type="email" defaultValue={s.reply_to_email ?? ''} />
        </Fld>
        <Fld label="Messenger link" htmlFor="s-msg" name="messenger_url" hint="e.g. https://m.me/yourpage">
          <Input id="s-msg" name="messenger_url" type="url" defaultValue={s.messenger_url ?? ''} />
        </Fld>
        <Fld label="Facebook page" htmlFor="s-fb" name="facebook_url">
          <Input id="s-fb" name="facebook_url" type="url" defaultValue={s.facebook_url ?? ''} />
        </Fld>
        <Fld label="Instagram" htmlFor="s-ig" name="instagram_url">
          <Input id="s-ig" name="instagram_url" type="url" defaultValue={s.instagram_url ?? ''} />
        </Fld>
      </Group>

      <Group
        id="payments"
        title="Payments"
        group="payments"
        description="Interac e-Transfer only. The e-Transfer email is shown to clients only on their private pay page and invoice PDF."
        values={[s.etransfer_email, s.etransfer_autodeposit, s.deposit_pct, s.hold_hours, s.balance_due_days_before_event, s.quote_valid_days]}
      >
        <Fld label="e-Transfer email" htmlFor="s-et" name="etransfer_email">
          <Input id="s-et" name="etransfer_email" type="email" defaultValue={s.etransfer_email ?? ''} />
        </Fld>
        <div className="flex items-end">
          <Check
            id="s-auto"
            name="etransfer_autodeposit"
            label="Autodeposit is on"
            hint="Clients won’t need a security question."
            defaultChecked={s.etransfer_autodeposit}
          />
        </div>
        <Fld label="Deposit (% of quote total)" htmlFor="s-dep" name="deposit_pct">
          <Input id="s-dep" name="deposit_pct" inputMode="numeric" required defaultValue={s.deposit_pct} />
        </Fld>
        <Fld label="Hold hours" htmlFor="s-hold" name="hold_hours" hint="How long an accepted quote holds the date without a deposit.">
          <Input id="s-hold" name="hold_hours" inputMode="numeric" required defaultValue={s.hold_hours} />
        </Fld>
        <Fld label="Balance due (days before event)" htmlFor="s-bal" name="balance_due_days_before_event">
          <Input id="s-bal" name="balance_due_days_before_event" inputMode="numeric" required defaultValue={s.balance_due_days_before_event} />
        </Fld>
        <Fld label="Quotes valid for (days)" htmlFor="s-qv" name="quote_valid_days">
          <Input id="s-qv" name="quote_valid_days" inputMode="numeric" required defaultValue={s.quote_valid_days} />
        </Fld>
      </Group>

      <Group
        id="tax"
        title="Tax"
        group="tax"
        description={
          <>
            Quotes and invoices show HST only when it’s on. Small suppliers under $30k don’t have to register — confirm with your
            accountant.
          </>
        }
        values={[s.tax_enabled, s.tax_rate_bp, s.hst_number]}
      >
        <div className="sm:col-span-2">
          <Check id="s-tax" name="tax_enabled" label="Charge HST" defaultChecked={s.tax_enabled} />
        </div>
        <Fld label="HST rate (%)" htmlFor="s-rate" name="tax_rate_bp">
          <Input id="s-rate" name="tax_rate_bp" inputMode="decimal" required defaultValue={String(s.tax_rate_bp / 100)} />
        </Fld>
        <Fld label="HST number" htmlFor="s-hst" name="hst_number" hint="Printed on quotes and invoices when set.">
          <Input id="s-hst" name="hst_number" defaultValue={s.hst_number ?? ''} />
        </Fld>
      </Group>

      <Group id="reviews" title="Reviews" group="reviews" description="Used in the thank-you email after each event." values={[s.google_review_url, s.facebook_review_url]}>
        <Fld label="Google review link" htmlFor="s-gr" name="google_review_url">
          <Input id="s-gr" name="google_review_url" type="url" defaultValue={s.google_review_url ?? ''} />
        </Fld>
        <Fld label="Facebook review link" htmlFor="s-fr" name="facebook_review_url">
          <Input id="s-fr" name="facebook_review_url" type="url" defaultValue={s.facebook_review_url ?? ''} />
        </Fld>
      </Group>

      <section id="team" aria-labelledby="team-title" className="scroll-mt-20">
        <SectionTitle id="team-title">Team</SectionTitle>
        <Notice tone="neutral" className="mb-4">
          Owners see everything. Staff see bookings, the calendar and inventory, but not payments, invoice amounts or settings.
          Every team member must set up an authenticator app (two-step sign-in) the first time they sign in.
        </Notice>
        {team.length === 0 && <EmptyState>No team members found.</EmptyState>}
        <div className="space-y-3">
          {team.map((m) => {
            const self = m.user_id === session.userId;
            return (
              <Card key={m.user_id} className="p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="mr-auto font-medium">
                    {m.display_name || m.email || m.user_id}
                    {m.display_name && m.email && <span className="ml-2 text-sm font-normal text-ink-soft">{m.email}</span>}
                  </p>
                  {self && <Badge tone="rose">you</Badge>}
                  <Badge tone={m.role === 'owner' ? 'gold' : 'neutral'}>{m.role}</Badge>
                  {m.invited && <Badge tone="warn">invite pending</Badge>}
                  <span className="text-xs text-ink-soft">
                    {m.last_sign_in_at ? `Last sign-in ${formatDateTime(m.last_sign_in_at)}` : 'Never signed in'}
                  </span>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <ActionForm action={updateTeamMember.bind(null, m.user_id)} aria-label={`Edit ${m.email ?? 'member'}`} className="flex flex-wrap items-end gap-3">
                    <Fld label="Name" htmlFor={`tm-n-${m.user_id}`} name="display_name">
                      <Input id={`tm-n-${m.user_id}`} name="display_name" defaultValue={m.display_name ?? ''} />
                    </Fld>
                    <Fld label="Role" htmlFor={`tm-r-${m.user_id}`} name="role">
                      <Select id={`tm-r-${m.user_id}`} name="role" defaultValue={m.role} disabled={self}>
                        <option value="owner">Owner</option>
                        <option value="staff">Staff</option>
                      </Select>
                    </Fld>
                    {self && <input type="hidden" name="role" value={m.role} />}
                    <Save variant="secondary">Save</Save>
                  </ActionForm>
                  {!self && (
                    <ActionForm
                      action={removeTeamMember.bind(null, m.user_id)}
                      confirm={`Remove ${m.email ?? 'this person'} from the team? Their account stays, without admin access.`}
                      aria-label="Remove team member"
                      className="ml-auto"
                    >
                      <Save variant="ghost" pendingText="Removing…" className="text-bad">Remove</Save>
                    </ActionForm>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="mt-4">
          <h3 className="mb-3 font-semibold">Invite someone</h3>
          <ActionForm action={inviteTeamMember} resetOnSuccess aria-label="Invite team member" className="grid gap-3 sm:grid-cols-4">
            <Fld label="Email" htmlFor="inv-email" name="email" className="sm:col-span-2">
              <Input id="inv-email" name="email" type="email" required />
            </Fld>
            <Fld label="Name" htmlFor="inv-name" name="display_name">
              <Input id="inv-name" name="display_name" />
            </Fld>
            <Fld label="Role" htmlFor="inv-role" name="role">
              <Select id="inv-role" name="role" defaultValue="staff">
                <option value="staff">Staff</option>
                <option value="owner">Owner</option>
              </Select>
            </Fld>
            <div className="sm:col-span-4">
              <Save size="md" pendingText="Sending…">Send invite</Save>
            </div>
          </ActionForm>
        </Card>
      </section>
    </div>
  );
}
