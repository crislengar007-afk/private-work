import { type Page, expect, test } from '@playwright/test';

const PASSWORD = 'Demo-Pass-2026';
test.describe.configure({ mode: 'serial' });

async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.locator('#f-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

async function selectByText(page: Page, label: string, text: RegExp) {
  const select = page.locator(`select[name="${label}"]`);
  const value = await select.locator('option').filter({ hasText: text }).first().getAttribute('value');
  await select.selectOption(value!);
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(0);
}

test('mobile 360px: core screens fit, keyboard digit entry works, direct refresh works (acceptance 16)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const page = await ctx.newPage();
  await login(page, 'pedro@demo.local');
  for (const path of ['/', '/rules', '/app', '/app/entries', '/app/results', '/app/support', '/app/account']) {
    await page.goto(path);
    await expect(page.getByText('DEMO — Walang totoong bayad o cash prize.')).toBeVisible();
    await noHorizontalOverflow(page);
  }
  await page.goto('/app/entries/new');
  await noHorizontalOverflow(page);
  // Keyboard-only: type into the digit field.
  await page.getByLabel('Your 3 digits').focus();
  await page.keyboard.type('112');
  await expect(page.locator('[data-picker-status]')).toContainText('Bawal ang umuulit');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('23');
  await expect(page.locator('[data-capacity]')).toContainText('Available: ₱10');
  // The keypad disables already-chosen digits.
  await expect(page.locator('[data-key="1"]')).toBeDisabled();
  await page.locator('[data-remove="2"]').click();
  await expect(page.getByLabel('Your 3 digits')).toHaveValue('12');
  await page.locator('[data-key="4"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Your 3 digits')).toHaveValue('124');
  // A full combination disables Continue.
  await page.getByLabel('Your 3 digits').fill('');
  await page.getByLabel('Your 3 digits').pressSequentially('654');
  await expect(page.locator('[data-capacity]')).toContainText('Naabot na ng combination na ito ang ₱500 limit');
  await expect(page.locator('[data-continue]')).toBeDisabled();
  // Admin console fits too.
  await login(page, 'admin@demo.local');
  for (const path of ['/admin', '/admin/payments', '/admin/draws', '/admin/payouts', '/admin/teams']) {
    await page.goto(path);
    await page.reload();
    await noHorizontalOverflow(page);
  }
  await ctx.close();
});

test('full flow: player entry → simulated payment → approval → separately reviewed result → Won', async ({ page }) => {
  // 1. Player picks three digits with the keypad and reviews.
  await login(page, 'juan@demo.local');
  await page.getByRole('link', { name: 'New entry', exact: true }).first().click();
  await selectByText(page, 'draw_id', /Sample Draw A/);
  for (const d of ['0', '4', '7']) await page.locator(`[data-key="${d}"]`).click();
  await expect(page.locator('[data-capacity]')).toContainText('Available: ₱500');
  await page.getByRole('button', { name: /Review entry/ }).click();
  await expect(page.getByText('047 · 074 · 407 · 470 · 704 · 740')).toBeVisible();
  await page.getByLabel(/I understand/).check();
  await page.getByRole('button', { name: /Confirm & reserve slot/ }).click();

  // 2. Simulated payment with a ledger receipt.
  await expect(page).toHaveURL(/\/app\/entries\/\d+\/payment$/);
  await expect(page.getByText('DEMO MERCHANT — simulated provider (no real account)')).toBeVisible();
  const entryUrl = page.url().replace(/\/payment$/, '');
  await page.getByRole('button', { name: 'Submit simulated payment' }).click();
  await expect(page.getByText('Pending verification').first()).toBeVisible();
  const ref = (await page.locator('.receipt .mono').first().textContent())!.trim();

  // 3. Payment reviewer approves before the verification cutoff.
  await login(page, 'payments@demo.local');
  await page.goto('/admin/payments?view=needs_review');
  await page.getByRole('link', { name: ref }).click();
  await expect(page.getByText('Ledger-confirmed receipt exists')).toBeVisible();
  await page.getByLabel('I verified the ledger receipt').check();
  await page.getByRole('button', { name: 'Approve entry' }).click();
  await expect(page.getByText('Payment verified and entry approved.')).toBeVisible();

  // 4. Admin moves the server's demo clock past the draw time (forward only).
  await login(page, 'admin@demo.local');
  await page.goto('/admin/settings');
  await page.getByLabel('Advance by minutes').fill(String(3 * 24 * 60));
  await page.getByRole('button', { name: 'Advance', exact: true }).click();
  await expect(page.getByText('Demo clock advanced.')).toBeVisible();

  // 5. Editor enters the result; the editor cannot publish it.
  await login(page, 'editor@demo.local');
  await page.goto('/admin/results');
  await selectByText(page, 'draw_id', /Sample Draw A/);
  await page.getByLabel('Six-digit result').fill('047123');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('A different staff member must review and publish it.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish result' })).toHaveCount(0);

  // 6. A different reviewer publishes.
  await login(page, 'reviewer@demo.local');
  await page.goto('/admin/results');
  await page.getByLabel(/I independently checked 047123/).check();
  await page.getByRole('button', { name: 'Publish result' }).click();
  await expect(page.getByText('Result published.')).toBeVisible();

  // 7. Player sees the automatic outcome and receipt.
  await login(page, 'juan@demo.local');
  await page.goto(entryUrl);
  await expect(page.getByText('Won', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Gross payout ₱3,100\.00/)).toBeVisible();
  await page.reload(); // direct refresh
  await expect(page.getByText('Receipt (demo)')).toBeVisible();
  await page.goto('/app/results');
  await expect(page.getByText('Sample Draw A — open')).toBeVisible();

  // 8. Admin approves and completes the simulated payout exactly once.
  await login(page, 'admin@demo.local');
  await page.goto('/admin/payouts');
  const row = page.locator('tr', { hasText: ref });
  await row.getByRole('button', { name: 'Approve payout' }).click();
  await page.locator('tr', { hasText: ref }).getByRole('button', { name: /Complete/ }).click();
  // Shown once in Winners and once in Payout history — one payout, never two.
  await expect(page.locator('tr', { hasText: ref }).getByText('Paid (simulated)')).toHaveCount(2);
  await expect(page.locator('tr', { hasText: ref }).getByRole('button')).toHaveCount(0);
});
