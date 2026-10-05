import { expect, type Page, test } from '@playwright/test';

const EDIT = '/analyze?layout=magic-romak&corpus=pt-br-conv&sample=20000';

async function openEdit(page: Page): Promise<void> {
  await page.goto(EDIT);
  await expect(page.getByRole('list', { name: 'Summary metrics' })).toBeVisible({
    timeout: 45_000,
  });
}

/** How far the page is wider than the screen. A phone must never scroll sideways. */
function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/**
 * Visible controls inside `selector` that are smaller than the 24px WCAG 2.5.8 asks for, named so
 * a failure says which.
 */
function smallTargets(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return [`nothing matches ${sel}`];
    const small: string[] = [];
    const controls = root.querySelectorAll(
      'button, input, select, summary, a[href], [role="button"], [role="tab"]',
    );
    for (const el of controls) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      if (box.width < 24 || box.height < 24) {
        const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 24) ?? '';
        small.push(
          `${el.tagName.toLowerCase()} "${name}" ${Math.round(box.width)}×${Math.round(box.height)}`,
        );
      }
    }
    return small;
  }, selector);
}

test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout only');

  test('nothing scrolls sideways, and every control is a target a finger can hit', async ({
    page,
  }) => {
    await openEdit(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    await page.getByRole('button', { name: /^Key LHI:/ }).tap();
    const inspector = page.getByRole('group', { name: 'Edit LHI' });
    await expect(inspector).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(await smallTargets(page, '.lm-inspector')).toEqual([]);

    // The kind tiles are what a finger reaches for first, so they get the full 44px.
    for (const tile of await inspector.locator('.lm-kind-tile').all()) {
      expect((await tile.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  test('the keys are drawn big enough to tap, and the whole board fits the screen', async ({
    page,
  }) => {
    await openEdit(page);
    const caps = page.locator('#kb-analyze g[data-key] rect.lm-key-cap');
    const sizes = await caps.evaluateAll((rects) =>
      rects.map((r) => Math.min(r.getBoundingClientRect().width, r.getBoundingClientRect().height)),
    );
    expect(sizes.length).toBeGreaterThan(0);
    // At least what a phone's own keyboard gives a key on the narrowest screen, 320px.
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(28);
    // A 24-key split board fits a phone with its halves drawn close: nothing to pan.
    const pans = await page
      .locator('.lm-board-scroll')
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(pans).toBeLessThanOrEqual(1);
  });

  test('the inspector opens right under the board, and the board stays up while editing', async ({
    page,
  }) => {
    await openEdit(page);
    await page.getByRole('button', { name: /^Key LHI:/ }).tap();
    const inspector = page.getByRole('group', { name: 'Edit LHI' });
    await expect(inspector).toBeInViewport();

    // Scrolling down through the inspector keeps the board pinned in the top part of the screen,
    // so the next key is a tap away rather than a scroll back up.
    await page.evaluate(() => window.scrollBy(0, 2000));
    await page.waitForTimeout(200);
    const board = await page.locator('.lm-edit-board').boundingBox();
    const height = page.viewportSize()?.height ?? 0;
    expect(board?.y ?? height).toBeLessThan(height / 3);
    await expect(page.getByRole('button', { name: /^Key LHM:/ })).toBeInViewport();
  });

  test('the layer tabs stay on one line', async ({ page }) => {
    await openEdit(page);
    const tabs = page.getByRole('tablist', { name: 'Layers' }).getByRole('tab');
    const tops = await tabs.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().top)),
    );
    expect(new Set(tops).size).toBe(1);
  });
});

test.describe('at a desk', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop layout only');

  test('the inspector docks beside the board', async ({ page }) => {
    await openEdit(page);
    await page.getByRole('button', { name: /^Key LHI:/ }).click();
    const board = await page.locator('.lm-edit-board').boundingBox();
    const inspector = await page.getByRole('group', { name: 'Edit LHI' }).boundingBox();
    expect(board && inspector).toBeTruthy();
    if (!board || !inspector) return;
    expect(inspector.x).toBeGreaterThanOrEqual(board.x + board.width);
    expect(inspector.y).toBeLessThan(board.y + board.height);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('a click on a key selects it, where a drag would move it', async ({ page }) => {
    await openEdit(page);
    await page.getByRole('button', { name: /^Key LHI:/ }).click();
    await expect(page.getByRole('group', { name: 'Edit LHI' })).toBeVisible();
  });
});
