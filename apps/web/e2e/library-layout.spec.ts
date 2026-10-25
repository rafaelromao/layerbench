import { expect, type Page, test } from '@playwright/test';

/** How far the page is wider than the screen. A phone must never scroll sideways. */
function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/**
 * The Library on a Portuguese text, scored. The layouts whose authors' layers have no accents skip
 * its accented letters, and say so below their numbers.
 */
async function openSkipping(page: Page): Promise<void> {
  await page.goto('/library?corpus=pt-br-general&sample=10000');
  await expect(page.getByText(/^Lower is better for both/)).toBeVisible({ timeout: 120_000 });
}

/**
 * Every card that says what it skips or lacks has each note on a line below its two numbers, the
 * note's text inside it, and on a screen with room for both, the numbers on one row. Each card is
 * measured in one pass, so a card added late cannot move the others between measurements.
 */
async function expectSkipsBelow(page: Page, { oneRow }: { oneRow: boolean }): Promise<void> {
  const cards = await page.locator('article').evaluateAll((articles) =>
    articles.flatMap((card) => {
      const notes = [...card.querySelectorAll('.lb-skips, .lb-lacks')];
      if (notes.length === 0) return [];
      const chips = [...card.querySelectorAll('dl > div')].map((c) => c.getBoundingClientRect());
      const bottom = Math.max(...chips.map((c) => c.bottom));
      return [
        {
          name: card.querySelector('h3')?.textContent ?? '',
          chips: chips.length,
          oneRow: chips.every((c) => Math.abs(c.top - (chips[0]?.top ?? 0)) < 1),
          below: notes.every((n) => n.getBoundingClientRect().top >= bottom),
          inside: notes.every((n) => n.scrollWidth <= n.clientWidth),
        },
      ];
    }),
  );
  expect(cards.length, 'cards that skip something').toBeGreaterThan(0);
  for (const card of cards) {
    expect(card.chips, `${card.name}: Effort and SFB`).toBe(2);
    if (oneRow) expect(card.oneRow, `${card.name}: the numbers share a row`).toBe(true);
    expect(card.below, `${card.name}: the note is below the numbers`).toBe(true);
    expect(card.inside, `${card.name}: the note wraps inside its card`).toBe(true);
  }
  expect(await overflow(page)).toBeLessThanOrEqual(0);
}

test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout only');

  test('wide previews fit every key inside the card without panning', async ({ page }) => {
    await page.goto('/library');
    const card = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: 'Enthium', exact: true }) });
    const board = card.locator('.lb-board-scroll');
    await expect(board.locator('svg')).toBeVisible();
    for (const width of [320, 360, 393]) {
      await page.setViewportSize({ width, height: 850 });
      const drawing = await board.evaluate((el) => {
        const bounds = el.getBoundingClientRect();
        const caps = [...el.querySelectorAll('rect.lb-key-cap')];
        return {
          count: caps.length,
          overflow: el.scrollWidth - el.clientWidth,
          inside: caps.every((cap) => {
            const box = cap.getBoundingClientRect();
            return box.left >= bounds.left && box.right <= bounds.right;
          }),
        };
      });
      expect(drawing.count).toBe(42);
      expect(drawing.overflow).toBeLessThanOrEqual(1);
      expect(drawing.inside).toBe(true);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    }
  });

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
    viewport,
  }) => {
    test.slow();
    await openSkipping(page);
    // 360px, the narrowest common Android phone, then the project's own phone. Below 360px the two
    // numbers may wrap onto two rows, but must still not scroll.
    for (const width of new Set([360, viewport?.width ?? 360])) {
      await page.setViewportSize({ width, height: viewport?.height ?? 800 });
      await expectSkipsBelow(page, { oneRow: width >= 360 });
    }
  });
});

test.describe('at a desk', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop layout only');

  test("a card's two numbers share a row, and what it skips is on a line below them", async ({
    page,
  }) => {
    test.slow();
    await openSkipping(page);
    await expectSkipsBelow(page, { oneRow: true });
  });
});
