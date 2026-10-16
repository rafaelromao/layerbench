import { expect, type Page, test } from '@playwright/test';

/** How far the page is wider than the screen. A phone must never scroll sideways. */
function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout only');

  test('the list never scrolls sideways, with a custom layout in it', async ({ page }) => {
    // A custom layout's card has the most on it: its badge and every action. New layout makes one,
    // and opens it in Analyze, to edit.
    await page.goto('/library');
    await page.getByRole('button', { name: 'New layout' }).click();
    await page.getByLabel('New layout name').fill('Qwerty copy');
    await page.getByRole('button', { name: 'Create and edit' }).click();
    await expect(page).toHaveURL(/\/analyze\?/);

    await page.goto('/library');
    await expect(page.getByRole('button', { name: 'Delete Qwerty copy' })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});
