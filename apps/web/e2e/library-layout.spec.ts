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

test('heatmaps colour the cards in every measure, and the page never scrolls sideways', async ({
  page,
  isMobile,
}) => {
  test.slow();
  await page.goto('/library?corpus=pt-br-general&sample=10000');
  const toggle = page.getByRole('button', { name: 'Heatmaps' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.lb-heat-legend')).toBeVisible();
  await expect(page.getByText(/^Lower is better for both/)).toBeVisible({ timeout: 120_000 });

  const qwerty = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Qwerty', exact: true }) });
  const heated = () =>
    qwerty
      .locator('.lb-key-cap')
      .evaluateAll(
        (caps) =>
          caps.filter((cap) => /--lb-heat\) [1-9]/.test(cap.getAttribute('style') ?? '')).length,
      );
  expect(await heated()).toBeGreaterThan(0);
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  // Choosing another measure needs no new analysis, and no room the screen does not have. Layer
  // taps may leave a layer plain; every other measure colours something on Qwerty's base layer.
  const widths = isMobile ? [undefined, 320] : [undefined];
  for (const width of widths) {
    if (width) await page.setViewportSize({ width, height: 800 });
    const choice = page.getByRole('combobox', { name: 'Heat' });
    for (const mode of ['sfb', 'effort', 'travel', 'layer_taps', 'usage']) {
      await choice.selectOption(mode);
      if (mode !== 'layer_taps') expect(await heated(), mode).toBeGreaterThan(0);
      expect(await overflow(page), mode).toBeLessThanOrEqual(0);
    }
  }
});

test('a card stays where it is on the screen while its language chip ranks the list again', async ({
  page,
}) => {
  test.slow();
  await page.goto('/library?corpus=en-general&sample=10000');
  await expect(page.getByText(/^Lower is better for both/)).toBeVisible({ timeout: 120_000 });

  // A card below the first with a chip for a text it is not on: most layouts are for English
  // alone, so few have one.
  const names = () =>
    page.locator('.lb-library-card h3').evaluateAll((titles) => titles.map((t) => t.textContent));
  const before = await names();
  const held = (
    await page.evaluateHandle(() =>
      [...document.querySelectorAll('.lb-library-card')]
        .slice(1)
        .find((card) => card.querySelector('.lb-language-chip[aria-pressed="false"]')),
    )
  ).asElement();
  expect(held, 'a card with a chip for another text').not.toBeNull();
  if (held === null) return;
  // Scrolled to 60% of the way down the screen, but no lower than the top of the first card: the
  // window cannot scroll above the top of the page, so a card ranked first could not be held lower.
  await held.evaluate((card) => {
    const first = document.querySelector('.lb-library-card')?.getBoundingClientRect().top ?? 0;
    const at = Math.min(window.innerHeight * 0.6, first + window.scrollY - 15);
    window.scrollTo(0, window.scrollY + card.getBoundingClientRect().top - at);
  });
  const chip = held.locator('.lb-language-chip[aria-pressed="false"]').first();
  await expect(chip).toBeInViewport();

  // Where the card is on the screen is read on every frame from here, in the page itself: two reads
  // from outside, apart, would each catch the list at another point of its re-sorting. A frame with
  // the window at the end of its range is left out: a card ranked last or first cannot be held
  // where it was past it, and nothing is wrong when it is not.
  await held.evaluate((card) => {
    const track = { top: card.getBoundingClientRect().top, worst: 0, running: true };
    Object.assign(window, { held: track });
    const frame = () => {
      const last = document.documentElement.scrollHeight - window.innerHeight;
      const atEnd = window.scrollY <= 0.5 || window.scrollY >= last - 0.5;
      if (!atEnd) {
        track.worst = Math.max(track.worst, Math.abs(card.getBoundingClientRect().top - track.top));
      }
      if (track.running) requestAnimationFrame(frame);
    };
    frame();
  });

  await chip.click();
  // Scored on the other text, then the last layouts that moved: the list is sorted again at once,
  // as each score lands and when it is done.
  await expect(page.getByText(/^Scoring layouts on a sample/)).toBeVisible();
  await expect(page.getByText(/^Lower is better for both/)).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(500);

  const { worst } = await held.evaluate(() => {
    const track = (window as unknown as { held: { worst: number; running: boolean } }).held;
    track.running = false;
    return { worst: track.worst };
  });
  // The list really was ranked again, or the card staying put proves nothing.
  expect(await names()).not.toEqual(before);
  expect(worst).toBeLessThanOrEqual(1);
});
