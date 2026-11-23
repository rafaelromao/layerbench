import { expect, type Page, test } from '@playwright/test';

const COMPARE = '/compare?layout=qwerty&b=graphite&corpus=en-general&sample=10000&heat=effort';

/** How far the page is wider than the screen. No width may scroll sideways. */
function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** What a tap reaches at the left, the middle and the right of the Settings button, by name. */
function settingsTaps(page: Page): Promise<(string | null)[]> {
  return page.evaluate(() => {
    const button = document.querySelector('button[aria-label="Settings"]');
    if (!button) return ['no Settings button'];
    // A phone's page may have scrolled past the bar: a tap reaches only what is on screen.
    button.scrollIntoView({ block: 'center' });
    const box = button.getBoundingClientRect();
    return [0.2, 0.5, 0.8].map((f) => {
      const hit = document
        .elementFromPoint(box.left + box.width * f, box.top + box.height / 2)
        ?.closest('a, button');
      return hit?.getAttribute('aria-label') ?? hit?.textContent?.trim() ?? null;
    });
  });
}

test('heats both boards, and no width draws Settings under the Analyze links', async ({
  page,
  isMobile,
}) => {
  test.slow();
  await page.goto(COMPARE);
  const heated = (side: string) =>
    page
      .locator(`#kb-${side} .lb-key-cap`)
      .evaluateAll(
        (caps) =>
          caps.filter((cap) => /--lb-heat\) [1-9]/.test(cap.getAttribute('style') ?? '')).length,
      );
  await expect.poll(() => heated('A'), { timeout: 60_000 }).toBeGreaterThan(0);
  expect(await heated('B')).toBeGreaterThan(0);
  await expect(page.locator('.lb-heat-legend')).toBeVisible();

  // The Legend is one button, at the right of the Layouts heading, where its row has room, not a
  // heading under each board: it takes no row, and opens one popup of both sides' lists.
  const legend = page.getByRole('button', { name: 'Legend', exact: true });
  await expect(legend).toHaveCount(1);
  const [hb, lb] = await Promise.all(
    [page.getByRole('button', { name: 'Layouts', exact: true }), legend].map((it) =>
      it.boundingBox(),
    ),
  );
  expect(hb && lb).toBeTruthy();
  if (hb && lb) {
    expect(Math.abs(lb.y + lb.height / 2 - (hb.y + hb.height / 2))).toBeLessThan(hb.height);
    expect(lb.x).toBeGreaterThan(hb.x + hb.width);
  }
  await legend.click();
  const popup = page.getByRole('dialog', { name: 'Legend' });
  await expect(popup).toBeVisible();
  await expect(popup.getByRole('region', { name: /^Legend of / })).toHaveCount(2);
  const box = await popup.locator('.modal-box').boundingBox();
  const size = page.viewportSize();
  expect(box && size && box.x >= 0 && box.x + box.width <= size.width + 1).toBe(true);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await popup.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(popup).toHaveCount(0);

  // A phone, and at a desk every width from where the bar stops being a grid, through those where
  // it wraps, to a wide screen: Settings is tapped where it is drawn, and nothing spills out.
  const widths = isMobile ? [320, 375] : [640, 660, 700, 744, 800, 840, 1024, 1280];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect.soft(await overflow(page), `${width}px`).toBeLessThanOrEqual(0);
    expect
      .soft(await settingsTaps(page), `${width}px`)
      .toEqual(['Settings', 'Settings', 'Settings']);
  }
});
