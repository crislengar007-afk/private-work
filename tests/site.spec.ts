import { test, expect, type Page } from '@playwright/test';
import { TEST_ENDPOINT } from '../playwright.config';

const pages = [
  { path: '/', title: /The Flower Studio TCI/ },
  { path: '/gallery/', title: /^Gallery \| The Flower Studio TCI$/ },
  { path: '/services/', title: /^Services \| The Flower Studio TCI$/ },
  { path: '/contact/', title: /^Contact \| The Flower Studio TCI$/ },
];

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

test.describe('pages', () => {
  for (const { path, title } of pages) {
    test(`${path} renders with a title, description, one h1 and no errors or overflow`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(path);
      await expect(page).toHaveTitle(title);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{40,}/);
      await expect(page.locator('h1')).toHaveCount(1);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  }

  test('images reserve their space and below-the-fold images are lazy', async ({ page }) => {
    await page.goto('/gallery/');
    const missing = await page.$$eval('main img', (imgs) =>
      imgs.filter((i) => i.closest('dialog') === null && (!i.getAttribute('width') || !i.getAttribute('height'))).length,
    );
    expect(missing).toBe(0);
    const eagerBelowFold = await page.$$eval('main .grid img', (imgs) =>
      imgs.slice(2).filter((i) => i.getAttribute('loading') !== 'lazy').length,
    );
    expect(eagerBelowFold).toBe(0);
  });

  test('primary navigation reaches every page', async ({ page, isMobile }) => {
    await page.goto('/');
    for (const label of ['Gallery', 'Services', 'Contact']) {
      if (isMobile) {
        await page.getByRole('button', { name: 'Menu' }).click();
        await page.getByRole('dialog', { name: 'Site menu' }).getByRole('link', { name: label, exact: true }).click();
      } else {
        await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: label, exact: true }).click();
      }
      await expect(page).toHaveURL(new RegExp(`/${label.toLowerCase()}/$`));
      await expect(page.locator('[aria-current="page"]').first()).toBeAttached();
    }
  });

  test('mobile menu traps focus, closes on Escape and returns focus', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only');
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Menu' });
    await toggle.click();
    const menu = page.getByRole('dialog', { name: 'Site menu' });
    await expect(menu).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(toggle).toBeFocused();
  });
});

test.describe('gallery', () => {
  test('filters by collection, updates the URL and keeps it on reload', async ({ page }) => {
    await page.goto('/gallery/');
    const filters = page.getByRole('group', { name: 'Filter by collection' });
    test.skip((await filters.count()) === 0, 'no collections in the current content');

    const target = filters.getByRole('button').nth(1);
    const id = await target.getAttribute('data-filter');
    await target.click();
    await expect(target).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(new RegExp(`collection=${id}`));

    const visible = page.locator('.grid .item:not([hidden])');
    await expect(visible.first()).toBeVisible();
    const collections = await visible.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.collection));
    expect(new Set(collections)).toEqual(new Set([id]));
    await expect(page.locator('[data-filter-status]')).toContainText(`${collections.length}`);

    await page.reload();
    await expect(page.locator(`[data-filter="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('.grid .item:not([hidden])').count()).toBe(collections.length);

    await filters.getByRole('button', { name: 'All' }).click();
    await expect(page).not.toHaveURL(/collection=/);
  });

  test('viewer: opens, navigates by keyboard, closes on Escape and restores focus', async ({ page }) => {
    await page.goto('/gallery/');
    const total = await page.locator('.grid .item:not([hidden])').count();
    const thumbs = page.locator('.grid [data-open]');
    await thumbs.nth(1).click();

    const viewer = page.getByRole('dialog', { name: 'Photograph viewer' });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'Close' })).toBeFocused();
    const count = viewer.locator('[data-count]');
    await expect(count).toHaveText(`2 of ${total}`);
    await expect(page).toHaveURL(/view=/);

    await page.keyboard.press('ArrowRight');
    await expect(count).toHaveText(`3 of ${total}`);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(count).toHaveText(`1 of ${total}`);
    await page.keyboard.press('ArrowLeft');
    await expect(count).toHaveText(`${total} of ${total}`);
    await page.keyboard.press('Home');
    await expect(count).toHaveText(`1 of ${total}`);

    // Focus stays inside the modal viewer.
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('dialog[open]'))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(viewer).toBeHidden();
    await expect(page).not.toHaveURL(/view=/);
    await expect(thumbs.nth(1)).toBeFocused();
  });

  test('viewer: controls are never covered by the photograph', async ({ page }) => {
    await page.goto('/gallery/');
    await page.locator('.grid [data-open]').first().click();
    for (const name of ['Previous photograph', 'Next photograph', 'Close']) {
      const hit = await page.getByRole('button', { name }).evaluate((btn) => {
        const r = btn.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!top && btn.contains(top);
      });
      expect(hit, name).toBe(true);
    }
  });

  test('viewer: the Back button closes it without leaving the gallery', async ({ page }) => {
    await page.goto('/gallery/');
    await page.locator('.grid [data-open]').first().click();
    const viewer = page.getByRole('dialog', { name: 'Photograph viewer' });
    await expect(viewer).toBeVisible();
    await page.goBack();
    await expect(viewer).toBeHidden();
    await expect(page).toHaveURL(/\/gallery\/$/);
  });

  test('viewer: swipe moves between photographs', async ({ page }) => {
    await page.goto('/gallery/');
    const total = await page.locator('.grid .item').count();
    await page.locator('.grid [data-open]').first().click();
    const stage = page.locator('[data-stage]');
    const count = page.locator('[data-count]');
    await expect(count).toHaveText(`1 of ${total}`);

    const swipe = (fromX: number, toX: number) =>
      stage.evaluate(
        (el, [a, b]) => {
          const r = el.getBoundingClientRect();
          const y = r.top + r.height / 2;
          const opts = { pointerType: 'touch', isPrimary: true, bubbles: true, pointerId: 7 };
          el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: a, clientY: y }));
          el.dispatchEvent(new PointerEvent('pointerup', { ...opts, clientX: b, clientY: y + 4 }));
        },
        [fromX, toX],
      );

    await swipe(300, 120);
    await expect(count).toHaveText(`2 of ${total}`);
    await swipe(120, 320);
    await expect(count).toHaveText(`1 of ${total}`);
    // A short or vertical drag is not a swipe.
    await swipe(200, 180);
    await expect(count).toHaveText(`1 of ${total}`);
  });

  test('a deep link opens the viewer, and returning restores it', async ({ page }) => {
    await page.goto('/');
    await page.locator('a.work').first().click();
    await expect(page).toHaveURL(/\/gallery\/\?view=/);
    await expect(page.getByRole('dialog', { name: 'Photograph viewer' })).toBeVisible();

    await page.getByRole('link', { name: /Enquire about this arrangement/ }).click();
    await expect(page).toHaveURL(/\/contact\/\?piece=/);
    await page.goBack();
    await expect(page.getByRole('dialog', { name: 'Photograph viewer' })).toBeVisible();
  });
});

test.describe('enquiry', () => {
  test('carries the selected photograph into the form and can remove it', async ({ page }) => {
    await page.goto('/gallery/');
    const id = await page.locator('.grid [data-open]').nth(2).getAttribute('data-open');
    await page.locator('.grid [data-open]').nth(2).click();
    await page.getByRole('link', { name: /Enquire about this arrangement/ }).click();

    await expect(page).toHaveURL(new RegExp(`/contact/\\?piece=${id}$`));
    const selection = page.locator('[data-selection]');
    await expect(selection).toBeVisible();
    await expect(page.locator('[data-selection-input]')).toHaveValue(id!);
    await expect(selection.getByRole('link', { name: 'View in gallery' })).toHaveAttribute('href', `/gallery/?view=${id}`);

    await selection.getByRole('button', { name: 'Remove' }).click();
    await expect(selection).toBeHidden();
    await expect(page.locator('[data-selection-input]')).toHaveValue('');
    await expect(page).toHaveURL(/\/contact\/$/);
  });

  test('a service link pre-selects the occasion', async ({ page }) => {
    await page.goto('/services/');
    await page.getByRole('link', { name: /Enquire about events/ }).click();
    await expect(page.getByLabel('Occasion', { exact: true })).toHaveValue('Event');
  });

  test('validates inline and focuses the first problem', async ({ page }) => {
    await page.goto('/contact/');
    await page.getByRole('button', { name: /Send enquiry/ }).click();
    await expect(page.getByLabel('Name')).toBeFocused();
    await expect(page.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#f-name-error')).toHaveText('Please enter your name.');
    await expect(page.locator('#f-email-error')).not.toBeEmpty();
    await expect(page.locator('[data-status]')).toContainText('highlighted fields');

    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Email').blur();
    await expect(page.locator('#f-email-error')).toContainText('name@example.com');
    await page.getByLabel('Email').fill('ana@example.com');
    await expect(page.locator('#f-email-error')).toBeEmpty();
    await expect(page.getByLabel('Email')).not.toHaveAttribute('aria-invalid', 'true');
  });

  async function fillValid(page: Page) {
    await page.getByLabel('Name').fill('Ana Rivera');
    await page.getByLabel('Email').fill('ana@example.com');
    await page.getByLabel('Occasion', { exact: true }).selectOption('Event');
    await page.getByLabel('Your message').fill('Flowers for a dinner for twelve on the beach.');
  }

  test('reports success only when the endpoint confirms it', async ({ page }) => {
    let body: Record<string, string> | undefined;
    await page.route(TEST_ENDPOINT, async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await page.goto('/gallery/');
    await page.locator('.grid [data-open]').first().click();
    await page.getByRole('link', { name: /Enquire about this arrangement/ }).click();
    await fillValid(page);
    await page.getByRole('button', { name: /Send enquiry/ }).click();
    await expect(page.locator('[data-status]')).toContainText('has been sent to the studio');
    expect(body?.name).toBe('Ana Rivera');
    expect(body?.occasion).toBe('Event');
    expect(body?.piece).toBeTruthy();
    expect(body?.pieceUrl).toContain('/gallery/?view=');
  });

  test('shows an error, keeps the text, and never claims success when sending fails', async ({ page }) => {
    await page.route(TEST_ENDPOINT, (route) => route.fulfill({ status: 500, body: 'nope' }));
    await page.goto('/contact/');
    await fillValid(page);
    await page.getByRole('button', { name: /Send enquiry/ }).click();
    const status = page.locator('[data-status]');
    await expect(status).toContainText('could not be sent');
    await expect(status).not.toContainText('has been sent');
    await expect(page.getByLabel('Your message')).toHaveValue(/dinner for twelve/);
  });
});

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('content is visible immediately and filtering does not animate', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    const hidden = await page.$$eval('[data-reveal]', (els) =>
      els.filter((e) => getComputedStyle(e).opacity !== '1').length,
    );
    expect(hidden).toBe(0);
    const playing = await page.$$eval('video', (vs) => vs.filter((v) => !v.paused).length);
    expect(playing).toBe(0);

    await page.goto('/gallery/');
    const filters = page.getByRole('group', { name: 'Filter by collection' });
    if ((await filters.count()) > 0) {
      await filters.getByRole('button').nth(1).click();
      // CSS transitions are shortened to 0.01ms by the reduced-motion rule;
      // anything longer would be real movement.
      const running = await page.evaluate(
        () => document.getAnimations().filter((a) => Number(a.effect?.getTiming().duration ?? 0) > 50).length,
      );
      expect(running).toBe(0);
    }
  });
});
