import { expect, type Locator, type Page, test } from '@playwright/test';

/** How far the page is wider than the screen. A phone must never scroll sideways. */
function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** Whether a box lies wholly on the screen, left to right. */
async function onScreen(page: Page, locator: Locator): Promise<boolean> {
  const box = await locator.boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  return box !== null && box.x >= 0 && box.x + box.width <= width;
}

test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout only');

  test('the menu opens on the screen, every view in it in full', async ({ page }) => {
    await page.goto('/library?sample=10000');
    await page.getByText('Menu', { exact: true }).tap();
    const views = page.locator('header details .menu');
    await expect(views).toBeVisible();
    expect(await onScreen(page, views)).toBe(true);
    for (const name of ['Library', 'Analyze', 'Compare', 'Rules', 'Corpus', 'Guide', 'About']) {
      expect(await onScreen(page, views.getByRole('link', { name, exact: true })), name).toBe(true);
    }
  });

  test("Analyze's settings open in a dialog that fits the screen", async ({ page }) => {
    await page.goto('/analyze?layout=magic-romak&corpus=pt-br-conv&sample=20000');
    await page.getByRole('button', { name: 'Settings' }).tap();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog.getByRole('textbox', { name: 'Author' })).toHaveValue('Rafael Romão');
    expect(await onScreen(page, dialog.getByRole('textbox', { name: 'Author' }))).toBe(true);
    // The switches line up in two columns: each of the second column's starts where the others do.
    const lefts = await dialog
      .getByRole('group', { name: 'Analyze with' })
      .getByRole('checkbox')
      .evaluateAll((boxes) => boxes.map((b) => Math.round(b.getBoundingClientRect().left)));
    expect(new Set(lefts).size).toBe(2);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});
