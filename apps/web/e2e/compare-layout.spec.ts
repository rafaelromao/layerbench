import { expect, type Page, test } from '@playwright/test';

const COMPARE = '/compare?layout=qwerty&b=graphite&corpus=en-general&sample=10000&heat=effort';

/** How far the page is wider than the screen. No width may scroll sideways. */
function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** What a tap reaches at the left, the middle and the right of the Settings button, by name. */
function settingsTaps(page: Page): Promise<(string | null)[]> {
  return page.evaluate(() => {
    const box = document.querySelector('button[aria-label="Settings"]')?.getBoundingClientRect();
    if (!box) return ['no Settings button'];
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
