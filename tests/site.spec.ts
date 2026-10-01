import { test, expect, type Page } from '@playwright/test';
import { TEST_ENDPOINT } from '../playwright.config';

const pages = [
  { path: '/', title: /The Flower Studio TCI/ },
  { path: '/gallery/', title: /^Gallery \| The Flower Studio TCI$/ },
  { path: '/our-services/', title: /^Our services \| The Flower Studio TCI$/ },
  { path: '/contact/', title: /^Contact \| The Flower Studio TCI$/ },
  { path: '/our-services/arrangements/', title: /^Arrangements \| The Flower Studio TCI$/ },
  { path: '/our-services/weddings/', title: /^Wedding decoration \| The Flower Studio TCI$/ },
  { path: '/our-services/corporate/', title: /^Corporate flowers \| The Flower Studio TCI$/ },
  { path: '/our-services/house-guests/', title: /^House guest flowers \| The Flower Studio TCI$/ },
  { path: '/our-services/hotels/', title: /^Luxury hotel flowers \| The Flower Studio TCI$/ },
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
      const slug = label === 'Services' ? 'our-services' : label.toLowerCase();
      await expect(page).toHaveURL(new RegExp(`/${slug}/$`));
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
    const filters = page.getByRole('group', { name: 'Filter by colour' });
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

    await filters.getByRole('button', { name: /^All/ }).click();
    await expect(page).not.toHaveURL(/collection=/);
    // Filters are history steps: Back restores the previous filter.
    await page.goBack();
    await expect(page.locator(`[data-filter="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-filter-status]')).toHaveText(new RegExp(`in ${await target.getAttribute('data-label')}$`));
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
      const hit = await page.getByRole('button', { name, exact: true }).evaluate((btn) => {
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
    await page.locator('#favourites [data-favs-strip] a').first().click();
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

  test('a service link pre-selects the service, and event services show event questions', async ({ page }) => {
    await page.goto('/our-services/weddings/');
    await page.getByRole('link', { name: /Enquire about wedding decoration/ }).first().click();
    await expect(page).toHaveURL(/\/contact\/\?service=weddings$/);
    await expect(page.getByLabel('Service', { exact: true })).toHaveValue('weddings');
    await expect(page.getByLabel('Venue or location')).toBeVisible();
    await page.getByLabel('Service', { exact: true }).selectOption('arrangements');
    await expect(page.getByLabel('Venue or location')).toBeHidden();
  });

  test('hospitality services ask one-off or ongoing; weddings ask guest numbers', async ({ page }) => {
    await page.goto('/contact/?service=hotels');
    await expect(page.getByLabel('One-off or ongoing?')).toBeVisible();
    await expect(page.getByLabel('Approximate number of guests')).toBeHidden();
    await page.getByLabel('Service', { exact: true }).selectOption('weddings');
    await expect(page.getByLabel('Approximate number of guests')).toBeVisible();
    await expect(page.getByLabel('One-off or ongoing?')).toBeHidden();
  });

  test('a photograph chosen earlier does not leak into a later service enquiry', async ({ page }) => {
    await page.goto('/gallery/');
    await page.locator('.grid [data-open]').first().click();
    await page.getByRole('link', { name: /Enquire about this arrangement/ }).click();
    await expect(page.locator('[data-selection]')).toBeVisible();
    await page.goto('/contact/?service=weddings');
    await expect(page.locator('[data-selection]')).toBeHidden();
  });

  test('each service has its own page, reached from the services index', async ({ page }) => {
    await page.goto('/our-services/');
    await page.getByRole('link', { name: /House guest flowers/ }).click();
    await expect(page).toHaveURL(/\/our-services\/house-guests\/$/);
    await expect(page.locator('h1')).toContainText('House');
    await expect(page.getByText('Concept film, generated for this design')).toBeVisible();
    // The other four services are offered from the page.
    await expect(page.locator('.more-list .scard')).toHaveCount(4);
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Our services' }).click();
    await expect(page).toHaveURL(/\/our-services\/$/);
  });

  test('the old /services/ route redirects to /our-services/', async ({ page }) => {
    await page.goto('/services/');
    await expect(page).toHaveURL(/\/our-services\/$/);
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
    await page.getByLabel('Service', { exact: true }).selectOption('corporate');
    await page.getByLabel('Tell us about it').fill('Flowers for a dinner for twelve on the beach.');
    // The form rejects submissions faster than a person could type (spam check).
    await page.waitForTimeout(2600);
  }

  test('the hidden spam field blocks sending', async ({ page }) => {
    let sent = false;
    await page.route(TEST_ENDPOINT, (route) => {
      sent = true;
      return route.fulfill({ status: 200, body: '{}' });
    });
    await page.goto('/contact/');
    await fillValid(page);
    await page.locator('input[name="website"]').evaluate((el: HTMLInputElement) => (el.value = 'spam'));
    await page.getByRole('button', { name: /Send enquiry/ }).click();
    await expect(page.locator('[data-status]')).toContainText('too quick');
    expect(sent).toBe(false);
  });

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
    expect(body?.service).toBe('Corporate flowers');
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
    await expect(page.getByLabel('Tell us about it')).toHaveValue(/dinner for twelve/);
  });
});

test.describe('motion', () => {
  const playing = (page: Page, selector: string) =>
    page.waitForFunction((sel) => {
      const v = document.querySelector<HTMLVideoElement>(sel);
      return !!v && !v.paused && v.readyState >= 2;
    }, selector);

  test('the full-screen film plays after load, and one control pauses motion across pages', async ({ page }) => {
    await page.goto('/');
    await playing(page, '.mhero video');
    const hero = page.locator('.mhero');
    const box = await hero.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.height).toBeGreaterThanOrEqual(viewport.height - 1);
    await expect(hero).toHaveClass(/is-moving/);

    const toggle = page.getByRole('button', { name: 'Pause motion' });
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Play motion' })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.$eval('.mhero video', (v: HTMLVideoElement) => v.paused)).toBe(true);

    // The choice holds on the next page.
    await page.goto('/our-services/weddings/');
    await expect(page.getByRole('button', { name: 'Play motion' })).toBeVisible();
    await page.waitForTimeout(800);
    expect(await page.$$eval('video', (vs) => vs.filter((v) => !v.paused).length)).toBe(0);
    await page.getByRole('button', { name: 'Play motion' }).click();
    await playing(page, '.mhero video');
  });

  test('scrolling drives the Home film: it pins, draws back and hands over to the strip', async ({ page }) => {
    await page.goto('/');
    const hero = page.locator('.mhero');
    const wrap = page.locator('[data-hero-scroll]');
    const vh = page.viewportSize()!.height;
    const height = (await wrap.boundingBox())!.height;
    expect(height).toBeGreaterThan(vh * 1.5);

    // Halfway through the pinned distance, the hero is still filling the screen.
    await page.evaluate((y) => scrollTo(0, y), Math.round((height - vh) * 0.6));
    await expect.poll(async () => Number(await hero.evaluate((el) => el.style.getPropertyValue('--p')))).toBeGreaterThan(0.5);
    expect((await hero.boundingBox())!.y).toBeLessThanOrEqual(1);
    await expect(hero).toHaveClass(/is-past/);
    await expect(page.locator('.mhero-content')).toBeHidden();
    await expect(page.getByText('Flowers for the island since March 2023')).toBeVisible();

    // Past the pin, the favourites strip follows.
    await page.locator('#favourites').scrollIntoViewIfNeeded();
    await expect(page.getByRole('heading', { name: 'Some of our favourites' })).toBeVisible();
  });

  test('the favourites strip pages with its arrows', async ({ page, isMobile }) => {
    test.skip(isMobile, 'arrows are for pointer devices; touch swipes the strip');
    await page.goto('/');
    const strip = page.locator('#favourites [data-favs-strip]');
    await strip.scrollIntoViewIfNeeded();
    const prev = page.locator('#favourites [data-favs-prev]');
    await expect(prev).toBeDisabled();
    await page.locator('#favourites [data-favs-next]').click();
    await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(200);
    await expect(prev).toBeEnabled();
    // Every panel opens its photograph in the gallery.
    await expect(strip.locator('a').first()).toHaveAttribute('href', /\/gallery\/\?view=img/);
  });

  test('the occasions reel opens the hovered service and plays its film', async ({ page, isMobile }) => {
    test.skip(isMobile, 'hover is a desktop interaction; touch plays the centred card');
    await page.goto('/');
    const items = page.locator('.reel > li');
    await items.first().scrollIntoViewIfNeeded();
    await expect(items.first()).toHaveClass(/is-open/);
    await playing(page, '.reel li:nth-child(1) video');
    await items.nth(2).hover();
    await expect(items.nth(2)).toHaveClass(/is-open/);
    await expect(items.first()).not.toHaveClass(/is-open/);
    await playing(page, '.reel li:nth-child(3) video');
    await page.waitForFunction(() => document.querySelector<HTMLVideoElement>('.reel li:nth-child(1) video')!.paused);
    // Service pages play a card while it is hovered.
    await page.goto('/our-services/weddings/');
    const card = page.locator('.more-list .scard').first();
    await card.scrollIntoViewIfNeeded();
    await card.hover();
    await playing(page, '.more-list li:nth-child(1) video');
  });

  test('photographs with added motion are labelled, and the viewer can show the still', async ({ page, isMobile }) => {
    await page.goto('/gallery/');
    const moving = page.locator('.grid .item[data-id="img011"]');
    await expect(moving.getByText('Motion added digitally')).toBeVisible();
    await moving.locator('[data-open]').click();
    const viewer = page.getByRole('dialog', { name: 'Photograph viewer' });
    await expect(viewer.getByText('Motion added digitally to the studio’s photograph.')).toBeVisible();
    await playing(page, '[data-viewer-video]');
    await viewer.getByRole('button', { name: 'Show the still photograph' }).click();
    await expect(page.locator('[data-viewer-video]')).toBeHidden();
    await expect(viewer.locator('[data-img]')).toBeVisible();
    await viewer.getByRole('button', { name: 'Show with motion' }).click();
    await playing(page, '[data-viewer-video]');
    // A photograph without a motion version carries no motion note.
    // img008 (second) also moves; img002 (third) does not.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(viewer.locator('[data-count]')).toHaveText(/^3 of/);
    await expect(viewer.locator('[data-motion-note]')).toBeHidden();
    if (!isMobile) await expect(viewer.getByRole('button', { name: 'Full screen' })).toBeVisible();
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
    await page.waitForTimeout(800);
    const playing = await page.$$eval('video', (vs) => vs.filter((v) => !v.paused).length);
    expect(playing).toBe(0);
    // No film is even downloaded, and the hero is not pinned to scrolling.
    expect(await page.locator('video source').count()).toBe(0);
    const wrapHeight = (await page.locator('[data-hero-scroll]').boundingBox())!.height;
    expect(wrapHeight).toBeLessThanOrEqual(page.viewportSize()!.height + 2);
    await expect(page.getByRole('button', { name: 'Pause motion' })).toBeHidden();

    await page.goto('/gallery/');
    const filters = page.getByRole('group', { name: 'Filter by colour' });
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
