import { expect, type Page, test } from '@playwright/test';

/** How far the page is wider than the screen. A phone must never scroll sideways. */
function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/**
 * Someone signed in with a long name, saving to gists, with a fork the app was not given: the
 * dialog at its fullest. GitHub and the sign-in function are stood in for, so nothing leaves.
 */
async function signedIn(page: Page): Promise<void> {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        available: true,
        signedIn: true,
        login: 'someone-with-a-rather-long-name',
        token: 'not-a-token',
        expiresAt: Date.now() + 3600_000,
        appSlug: 'layoutmaster-app',
        upstream: 'rafaelromao/layoutmaster',
      }),
    }),
  );
  await page.route('https://api.github.com/**', (route) => {
    const url = route.request().url();
    if (url.includes('/user/installations')) {
      return route.fulfill({ contentType: 'application/json', body: '{"installations":[]}' });
    }
    if (url.includes('/repos/')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          fork: true,
          source: { full_name: 'rafaelromao/layoutmaster' },
        }),
      });
    }
    return route.fulfill({ contentType: 'application/json', body: '[]' });
  });
}

test('the storage dialog fits the screen when signed in', async ({ page }) => {
  await signedIn(page);
  await page.goto('/library');
  await page.getByRole('button', { name: /^Storage: this browser and GitHub/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Storage' });
  await expect(dialog.getByRole('link', { name: 'Give LayoutMaster access to it' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Sign out' })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  // The last control can be reached, scrolling inside the dialog if it has to.
  // Exact: the backdrop behind the box is a "close" button too.
  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  await close.scrollIntoViewIfNeeded();
  await expect(close).toBeInViewport();
});
