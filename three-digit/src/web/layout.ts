import type { Request } from 'express';
import { type SafeHtml, html, raw } from '../lib/html.js';
import { type Role, ROLE_LABEL, hasAny } from '../services/context.js';
import { csrfField, icon } from './ui.js';

export type Area = 'public' | 'player' | 'admin' | 'team' | 'agent';

export const STAFF: Role[] = ['admin', 'payment_reviewer', 'result_editor', 'result_reviewer'];

/** Single source of truth for staff page access; routes and nav both use it. */
export const ADMIN_PAGES: { href: string; label: string; roles: Role[]; group: string }[] = [
  { href: '/admin', label: 'Overview', roles: STAFF, group: 'Operations' },
  { href: '/admin/draws', label: 'Draws', roles: STAFF, group: 'Operations' },
  { href: '/admin/payments', label: 'Payments', roles: ['admin', 'payment_reviewer'], group: 'Operations' },
  { href: '/admin/entries', label: 'Entries', roles: ['admin', 'payment_reviewer'], group: 'Operations' },
  { href: '/admin/results', label: 'Results', roles: ['admin', 'result_editor', 'result_reviewer'], group: 'Operations' },
  { href: '/admin/refunds', label: 'Refunds', roles: ['admin', 'payment_reviewer'], group: 'Money (simulated)' },
  { href: '/admin/payouts', label: 'Payouts', roles: ['admin', 'payment_reviewer'], group: 'Money (simulated)' },
  { href: '/admin/support', label: 'Support', roles: ['admin'], group: 'Administration' },
  { href: '/admin/users', label: 'Users & roles', roles: ['admin'], group: 'Administration' },
  { href: '/admin/teams', label: 'Teams', roles: ['admin'], group: 'Administration' },
  { href: '/admin/agents', label: 'Agents', roles: ['admin'], group: 'Administration' },
  { href: '/admin/audit', label: 'Audit log', roles: ['admin'], group: 'Administration' },
  { href: '/admin/settings', label: 'Settings', roles: ['admin'], group: 'Administration' },
];

export const adminRoles = (href: string): Role[] => ADMIN_PAGES.find((p) => p.href === href)?.roles ?? ['admin'];

const PLAYER_NAV = [
  { href: '/app', label: 'Dashboard' },
  { href: '/app/entries/new', label: 'New entry' },
  { href: '/app/entries', label: 'My entries' },
  { href: '/app/results', label: 'Results' },
  { href: '/app/support', label: 'Support' },
  { href: '/app/account', label: 'Account' },
];
const TEAM_NAV = [
  { href: '/team', label: 'Team dashboard' },
  { href: '/team/agents', label: 'My agents' },
  { href: '/team/reports', label: 'Team report' },
];

/** Role-aware landing route after login. */
export function landingFor(roles: ReadonlySet<Role>): string {
  if ([...roles].some((r) => STAFF.includes(r))) return '/admin';
  if (roles.has('team_leader')) return '/team';
  if (roles.has('agent')) return '/agent';
  return '/app';
}

function areas(roles: ReadonlySet<Role>): { area: Area; href: string; label: string }[] {
  const out: { area: Area; href: string; label: string }[] = [];
  if (roles.has('player')) out.push({ area: 'player', href: '/app', label: 'Player' });
  if ([...roles].some((r) => STAFF.includes(r))) out.push({ area: 'admin', href: '/admin', label: 'Staff console' });
  if (roles.has('team_leader')) out.push({ area: 'team', href: '/team', label: 'Team' });
  if (roles.has('agent')) out.push({ area: 'agent', href: '/agent', label: 'Agent' });
  return out;
}

function isActive(current: string, href: string): boolean {
  if (href === '/app' || href === '/admin' || href === '/team' || href === '/') return current === href;
  if (href === '/app/entries') return current === '/app/entries' || (/^\/app\/entries\/\d+/.test(current));
  return current === href || current.startsWith(href + '/');
}

function navLinks(links: { href: string; label: string }[], current: string): SafeHtml {
  return html`${links.map((l) => html`<li><a href="${l.href}" ${isActive(current, l.href) ? raw('aria-current="page"') : ''}>${l.label}</a></li>`)}`;
}

export interface PageOpts {
  title: string;
  area: Area;
  body: SafeHtml;
  description?: string;
}

export function page(req: Request, o: PageOpts): string {
  const { actor, csrf, flash, clock } = req.td;
  const current = req.path.replace(/\/$/, '') || '/';
  let nav: SafeHtml;
  if (o.area === 'player') nav = navLinks(PLAYER_NAV, current);
  else if (o.area === 'team') nav = navLinks(TEAM_NAV, current);
  else if (o.area === 'agent') nav = navLinks([{ href: '/agent', label: 'Agent dashboard' }], current);
  else if (o.area === 'admin') nav = html``;
  else
    nav = navLinks(
      [
        { href: '/', label: 'Home' },
        { href: '/rules', label: 'Rules' },
        ...(actor ? [] : [{ href: '/login', label: 'Log in' }, { href: '/register', label: 'Register' }]),
      ],
      current,
    );

  const adminNav =
    o.area === 'admin' && actor
      ? (() => {
          const visible = ADMIN_PAGES.filter((p) => hasAny(actor, p.roles));
          const groups = [...new Set(visible.map((p) => p.group))];
          return html`<nav class="sidenav" aria-label="Staff console">
            <details class="sidenav__details" open data-sidenav>
              <summary>${icon('menu')} Staff menu</summary>
              ${groups.map((g) => html`<p class="sidenav__group">${g}</p><ul>${navLinks(visible.filter((p) => p.group === g), current)}</ul>`)}
            </details></nav>`;
        })()
      : html``;

  const switcher = actor ? areas(actor.roles).filter((a) => a.area !== o.area) : [];

  const body = html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="server-now" content="${clock.now().toISOString()}">
<meta name="description" content="${o.description ?? 'Three-digit entry platform — local DEMO with simulated payments only.'}">
<title>${o.title} · 3Digit Demo</title>
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/app.css">
<script src="/static/app.js" defer></script>
</head>
<body class="area-${o.area}">
<a class="skip" href="#main">Skip to content</a>
<div class="demo-banner" role="note"><strong>DEMO — Walang totoong bayad o cash prize.</strong> <span>Simulated payments · sample results only · not an official lottery.</span></div>
<header class="topbar">
  <div class="topbar__inner">
    <a class="brand" href="${actor ? (o.area === 'public' ? '/' : (areas(actor.roles).find((a) => a.area === o.area)?.href ?? '/')) : '/'}"><span class="brand__mark" aria-hidden="true">3</span><span>3Digit <span class="brand__demo">Demo</span></span></a>
    <nav class="mainnav" aria-label="Main"><ul>${nav}</ul></nav>
    <div class="account">
      ${actor
        ? html`${switcher.length ? html`<details class="switcher"><summary>Switch area</summary><ul>${switcher.map((a) => html`<li><a href="${a.href}">${a.label}</a></li>`)}</ul></details>` : ''}
          <span class="account__who" title="${[...actor.roles].map((r) => ROLE_LABEL[r]).join(', ')}">${icon('user')} <span class="account__name">${actor.displayName}</span></span>
          <form method="post" action="/logout" class="inline">${csrfField(csrf)}<button class="btn btn--ghost btn--sm" type="submit">Sign out</button></form>`
        : html`<a class="btn btn--sm btn--secondary" href="/login">Log in</a>`}
    </div>
  </div>
</header>
<div class="shell ${o.area === 'admin' ? 'shell--admin' : ''}">
  ${adminNav}
  <main id="main" tabindex="-1">
    ${flash.map((f) => html`<div class="alert alert--${f.kind === 'error' ? 'error' : f.kind === 'success' ? 'success' : 'info'}" role="${f.kind === 'error' ? 'alert' : 'status'}">${icon(f.kind === 'success' ? 'check' : f.kind === 'error' ? 'alert' : 'info')}<div>${f.message}</div></div>`)}
    ${o.body}
  </main>
</div>
<footer class="footer"><div class="footer__inner">
  <p><strong>Software demo.</strong> Not a licensed lottery, not an offer of gaming and not legal authorization. Sample six-digit results are not attributed to any official draw. All times are server time shown in Asia/Manila (PHT, UTC+8).</p>
  <p><a href="/rules">Rules &amp; demo terms</a></p>
</div></footer>
</body>
</html>`;
  return body.value;
}
