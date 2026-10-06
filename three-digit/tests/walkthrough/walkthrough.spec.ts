import { type Browser, type BrowserContext, type Page, expect, test } from '@playwright/test';

const PASSWORD = 'Demo-Pass-2026';
const DIR = 'docs/screenshots';

class Device {
  user: string | null = null;
  constructor(readonly tag: 'desktop' | 'mobile', readonly ctx: BrowserContext, readonly page: Page) {}
  static async open(browser: Browser, tag: 'desktop' | 'mobile') {
    const ctx = await browser.newContext(tag === 'desktop' ? { viewport: { width: 1280, height: 860 } } : { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    return new Device(tag, ctx, await ctx.newPage());
  }
  async as(email: string | null) {
    if (this.user === email) return;
    await this.ctx.clearCookies();
    this.user = null;
    if (!email) return;
    await this.page.goto('/login');
    await this.page.locator('#f-email').fill(email);
    await this.page.locator('#f-password').fill(PASSWORD);
    await this.page.getByRole('button', { name: 'Log in' }).click();
    await this.page.waitForURL((u) => !u.pathname.startsWith('/login'));
    this.user = email;
  }
  async shot(name: string) {
    await this.page.waitForLoadState('networkidle');
    const overflow = await this.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${this.page.url()} (${this.tag})`).toBeLessThanOrEqual(0);
    await this.page.screenshot({ path: `${DIR}/${name}-${this.tag}.jpg`, fullPage: true, type: 'jpeg', quality: 70 });
  }
}

async function pickDraw(page: Page, re: RegExp) {
  const select = page.locator('select[name="draw_id"]');
  const value = await select.locator('option').filter({ hasText: re }).first().getAttribute('value');
  await select.selectOption(value!);
}

test('documented demo walkthrough with screenshots', async ({ browser }) => {
  const d = await Device.open(browser, 'desktop');
  const m = await Device.open(browser, 'mobile');
  const both = async (name: string, email: string | null, path: string) => {
    for (const dev of [d, m]) {
      await dev.as(email);
      await dev.page.goto(path);
      await dev.shot(name);
    }
  };

  // 01 Home and 02 login
  await both('01-home', null, '/');
  await d.page.goto('/login');
  await d.page.locator('.demo-accounts summary').click();
  await d.shot('02-login');

  // 03 Player dashboard
  await both('03-player-dashboard', 'juan@demo.local', '/app');

  // 04 Digit picker with live capacity (0-4-7 desktop; full 6-5-4 on mobile)
  await d.page.goto('/app/entries/new');
  await pickDraw(d.page, /Sample Draw A/);
  for (const k of ['0', '4', '7']) await d.page.locator(`[data-key="${k}"]`).click();
  await expect(d.page.locator('[data-capacity]')).toContainText('Available: ₱500');
  await d.shot('04-pick-digits');
  await m.page.goto('/app/entries/new');
  for (const k of ['6', '5', '4']) await m.page.locator(`[data-key="${k}"]`).click();
  await expect(m.page.locator('[data-capacity]')).toContainText('Naabot na');
  await m.shot('04-pick-digits-full-combination');
  await m.page.locator('[data-clear]').click();
  for (const k of ['0', '4', '7']) await m.page.locator(`[data-key="${k}"]`).click();
  await expect(m.page.locator('[data-capacity]')).toContainText('Available: ₱500');
  await m.shot('04-pick-digits');

  // 05 Review (mobile shows the review only; desktop confirms)
  await m.page.getByRole('button', { name: /Review entry/ }).click();
  await m.shot('05-review');
  await d.page.getByRole('button', { name: /Review entry/ }).click();
  await expect(d.page.getByText('047 · 074 · 407 · 470 · 704 · 740')).toBeVisible();
  await d.shot('05-review');
  await d.page.getByLabel(/I understand/).check();
  await d.page.getByRole('button', { name: /Confirm & reserve slot/ }).click();

  // 06 Simulated payment
  await expect(d.page).toHaveURL(/\/payment$/);
  const payUrl = new URL(d.page.url()).pathname;
  const entryUrl = payUrl.replace(/\/payment$/, '');
  await d.shot('06-payment');
  await m.page.goto(payUrl);
  await m.shot('06-payment');
  await d.page.getByRole('button', { name: 'Submit simulated payment' }).click();
  await expect(d.page.getByText('Pending verification').first()).toBeVisible();
  const ref = (await d.page.locator('.receipt .mono').first().textContent())!.trim();
  await both('07-pending-verification', 'juan@demo.local', entryUrl);

  // 08 Payment reviewer approves
  await both('08-payment-queue', 'payments@demo.local', '/admin/payments');
  await d.page.getByRole('link', { name: ref }).click();
  const paymentUrl = new URL(d.page.url()).pathname;
  await d.shot('09-payment-review');
  await m.page.goto(paymentUrl);
  await m.shot('09-payment-review');
  await d.page.getByLabel('I verified the ledger receipt').check();
  await d.page.getByRole('button', { name: 'Approve entry' }).click();
  await expect(d.page.getByText('Payment verified and entry approved.')).toBeVisible();
  await d.shot('10-payment-approved');

  // 11 Admin: money breakdown, then move the demo clock past the draw time
  const drawA = await (async () => {
    await d.as('admin@demo.local');
    await d.page.goto('/admin/draws');
    await d.page.getByRole('link', { name: 'Sample Draw A — open' }).click();
    return new URL(d.page.url()).pathname;
  })();
  await both('11-draw-money-and-capacity', 'admin@demo.local', drawA);
  await both('12-admin-overview', 'admin@demo.local', '/admin');
  await d.page.goto('/admin/settings');
  await d.page.getByLabel('Advance by minutes').fill(String(3 * 24 * 60));
  await d.page.getByRole('button', { name: 'Advance', exact: true }).click();
  await expect(d.page.getByText('Demo clock advanced.')).toBeVisible();
  await d.shot('13-demo-clock');

  // 14 Editor enters result; cannot publish own entry
  await d.as('editor@demo.local');
  await d.page.goto('/admin/results');
  await pickDraw(d.page, /Sample Draw A/);
  await d.page.getByLabel('Six-digit result').fill('047123');
  await d.page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(d.page.getByText('you cannot review it')).toBeVisible();
  await d.shot('14-editor-submitted');

  // 15 Second reviewer publishes
  await d.as('reviewer@demo.local');
  await d.page.goto('/admin/results');
  await d.shot('15-reviewer-queue');
  await m.as('reviewer@demo.local');
  await m.page.goto('/admin/results');
  await m.shot('15-reviewer-queue');
  await d.page.getByLabel(/I independently checked 047123/).check();
  await d.page.getByRole('button', { name: 'Publish result' }).click();
  await expect(d.page.getByText('Result published.')).toBeVisible();

  // 16 Player sees Won
  await both('16-winner-entry', 'juan@demo.local', entryUrl);
  await expect(d.page.getByText(/Gross payout ₱3,100\.00/)).toBeVisible();
  const resultUrl = await (async () => {
    await d.page.goto('/app/results');
    await d.page.getByRole('link', { name: 'Sample Draw A — open' }).click();
    return new URL(d.page.url()).pathname;
  })();
  await both('17-result-explained', 'juan@demo.local', resultUrl);

  // 18 Simulated payout: approve, then complete
  await d.as('payments@demo.local');
  await d.page.goto('/admin/payouts');
  await d.page.locator('tr', { hasText: ref }).getByRole('button', { name: 'Approve payout' }).click();
  await d.page.locator('tr', { hasText: ref }).getByRole('button', { name: /Complete/ }).click();
  await expect(d.page.locator('tr', { hasText: ref }).getByText('Paid (simulated)').first()).toBeVisible();
  await d.shot('18-payout-completed');
  await m.as('payments@demo.local');
  await m.page.goto('/admin/payouts');
  await m.shot('18-payout-completed');

  // 19 Team leader isolation
  await both('19-team-leader', 'leader.a@demo.local', '/team/agents');

  await d.ctx.close();
  await m.ctx.close();
});
