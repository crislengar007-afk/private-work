'use client';
// Admin chrome: sidebar navigation (off-canvas on small screens) + sign-out.
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { navFor } from '../_lib/nav';
import { signOut } from '../_lib/session-actions';

function isActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({
  role,
  email,
  businessName,
  children,
}: {
  role: 'owner' | 'staff';
  email: string | null;
  businessName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLButtonElement>(null);
  const wasOpen = React.useRef(false);
  const items = navFor(role);

  // Move focus into the drawer when it opens and back to the Menu button when it closes.
  React.useEffect(() => {
    if (open) closeRef.current?.focus();
    else if (wasOpen.current) menuRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const nav = (
    <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 py-4">
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'block rounded-lg px-3 py-2 text-sm transition-colors',
                  active ? 'bg-blush font-semibold text-rose-deep' : 'text-ink hover:bg-blush-soft',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const footer = (
    <div className="border-t border-line px-4 py-4 text-xs text-ink-soft">
      <p className="truncate" title={email ?? undefined}>{email}</p>
      <p className="mb-2 capitalize">{role}</p>
      <form action={signOut}>
        <button type="submit" className="rounded-full border border-ink/20 bg-white px-3 py-1.5 text-sm text-ink hover:border-rose-deep hover:text-rose-deep">
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <div className="flex min-h-full flex-1 bg-cream">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-white lg:flex">
        <div className="px-5 pb-2 pt-5">
          <Link href="/admin" className="font-display text-xl font-semibold text-rose-deep">{businessName}</Link>
          <p className="text-xs text-ink-soft">Admin</p>
        </div>
        {nav}
        {footer}
      </aside>

      {/* Mobile drawer */}
      <div
        id="admin-drawer"
        className={cn('fixed inset-0 z-40 lg:hidden', open ? 'block' : 'hidden')}
        role="dialog"
        aria-modal="true"
        aria-label="Admin menu"
      >
        <button type="button" aria-label="Close menu" className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
        <div className="relative flex h-full w-72 max-w-[85%] flex-col bg-white shadow-xl">
          <div className="flex items-center justify-between px-5 pb-2 pt-5">
            <span className="font-display text-xl font-semibold text-rose-deep">{businessName}</span>
            <button ref={closeRef} type="button" onClick={() => setOpen(false)} className="rounded-full px-2 py-1 text-sm text-ink-soft hover:bg-blush-soft">
              Close
            </button>
          </div>
          {nav}
          {footer}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <button
            ref={menuRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-controls="admin-drawer"
            className="rounded-full border border-ink/20 px-3 py-1.5 text-sm text-ink"
          >
            Menu
          </button>
          <Link href="/admin" className="font-display text-lg font-semibold text-rose-deep">{businessName}</Link>
          <span className="w-14" aria-hidden />
        </header>
        <main id="admin-main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
