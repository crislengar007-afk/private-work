import type { Metadata } from 'next';

// The admin has its own chrome (not the public header/footer). Signed-in pages
// live in the (app) route group, whose layout enforces requireTeam(); the
// sign-in page (/admin/login) stays outside it so it is always reachable.
export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Admin' },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-full flex-1 flex-col bg-cream">{children}</div>;
}
