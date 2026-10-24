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

  test("a card's two numbers share a row, and what it skips is on a line below them", async ({
    page,
  }) => {
    // An iPhone's 375px, where the actions beside the numbers left them room for one a row. On a
    // Portuguese text, the layouts that keep their authors' layers skip its accented letters.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/library?corpus=pt-br-general&sample=10000');
    const skipping = page.locator('article').filter({ has: page.locator('.lb-skips') });
    await expect(skipping.first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('scoring…')).toHaveCount(0, { timeout: 45_000 });
    const cards = await skipping.all();
    for (const card of cards) {
      const name = await card.locator('h3').textContent();
      const chips = await Promise.all(
        (await card.locator('dl > div').all()).map((chip) => chip.boundingBox()),
      );
      const note = await card.locator('.lb-skips').boundingBox();
      const box = await card.boundingBox();
      expect(chips, `${name}: Effort and SFB`).toHaveLength(2);
      const [effort, sfb] = chips;
      if (!effort || !sfb || !note || !box) throw new Error(`${name}: not laid out`);
      expect(Math.abs(effort.y - sfb.y), `${name}: the numbers share a row`).toBeLessThan(1);
      expect(note.y, `${name}: the note is below the numbers`).toBeGreaterThanOrEqual(
        Math.max(effort.y + effort.height, sfb.y + sfb.height),
      );
      expect(note.x + note.width, `${name}: the note wraps inside its card`).toBeLessThanOrEqual(
        box.x + box.width,
      );
    }
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});
