import { requireTeam } from '@/lib/auth';
import { getPublicSettings } from '@/lib/catalog';
import { AdminShell } from '../_components/admin-shell';

// Every signed-in admin page is under this layout: owner or staff with an MFA
// (aal2) session, otherwise redirected to /admin/login. Owner-only pages also
// call requireOwner() themselves (layouts don't re-run on client navigation).
export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireTeam();
  let businessName = 'Admin';
  try {
    businessName = (await getPublicSettings()).business_name;
  } catch {
    /* keep the generic label */
  }
  return (
    <AdminShell role={session.role === 'owner' ? 'owner' : 'staff'} email={session.email} businessName={businessName}>
      {children}
    </AdminShell>
  );
}
