import { expect, type Locator, type Page, test } from '@playwright/test';

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function onScreen(page: Page, locator: Locator): Promise<boolean> {
  const box = await locator.boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  return box !== null && box.x >= 0 && box.x + box.width <= width;
}

test.describe('route fallback screens on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout only');

  test('an unknown address shows a not-found page in the app shell', async ({ page }) => {
    await page.goto('/not-a-layerbench-view');

    const screen = page.getByRole('main').getByRole('region', { name: 'Page not found' });
    const library = screen.getByRole('link', { name: 'Back to the Library' });
    await expect(screen).toBeVisible();
    await expect(library).toBeVisible();
    expect(await onScreen(page, screen)).toBe(true);
    expect(await onScreen(page, library)).toBe(true);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('a render error offers recovery actions that fit and leave the app usable', async ({
    page,
  }) => {
    await page.goto('/e2e/route-error-fixture.html');

    const screen = page.getByRole('main').getByRole('region', {
      name: 'This page could not be loaded',
    });
    const reload = screen.getByRole('button', { name: 'Reload' });
    const library = screen.getByRole('link', { name: 'Back to the Library' });
    const issue = screen.getByRole('link', { name: 'Open an issue' });
    await expect(screen).toBeVisible();
    await expect(screen.getByRole('alert')).toContainText('A view crashed while rendering.');
    await expect(issue).toHaveAttribute(
      'href',
      'https://github.com/rafaelromao/layerbench/issues/new',
    );
    for (const action of [reload, library, issue]) expect(await onScreen(page, action)).toBe(true);
    expect(await onScreen(page, screen)).toBe(true);
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    const reloaded = page.waitForEvent('load');
    await reload.tap();
    await reloaded;
    await expect(
      page.getByRole('heading', { name: 'This page could not be loaded' }),
    ).toBeVisible();

    await library.tap();
    await expect(page.getByRole('heading', { name: 'Library destination' })).toBeVisible();
  });
});
