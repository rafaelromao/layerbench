import { expect, type Page, test } from '@playwright/test';

/** How far the page is wider than the screen. A phone must never scroll sideways. */
function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout only');

  test('the list never scrolls sideways, with a saved layout in it', async ({ page }) => {
    // A saved layout's card has the most on it: its badge and four actions. Duplicate makes one,
    // and opens it in the editor.
    await page.goto('/library');
    await page.getByRole('button', { name: 'Duplicate Qwerty' }).click();
    await expect(page).toHaveURL(/\/edit\?/);

    await page.goto('/library');
    await expect(page.getByRole('button', { name: 'Delete Qwerty copy' })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});
