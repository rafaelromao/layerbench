import { expect, type Page, test } from '@playwright/test';

/** How far the page is wider than the screen. A phone must never scroll sideways. */
function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

const SIGNED_IN = {
  available: true,
  signedIn: true,
  login: 'someone-with-a-rather-long-name',
  token: 'not-a-token',
  expiresAt: Date.now() + 3600_000,
  clientId: 'Iv1.not-a-client',
  appSlug: 'layerbench-app',
  upstream: 'rafaelromao/layerbench',
};

/** GitHub's API, answering as it would for someone saving to gists, with a fork the app was not given. */
async function github(page: Page): Promise<void> {
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
          source: { full_name: 'rafaelromao/layerbench' },
        }),
      });
    }
    return route.fulfill({ contentType: 'application/json', body: '[]' });
  });
}

/**
 * Someone signed in with a long name, saving to gists, with a fork the app was not given: the
 * dialog at its fullest. GitHub and the sign-in server are stood in for, so nothing leaves.
 */
async function signedIn(page: Page): Promise<void> {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(SIGNED_IN) }),
  );
  await github(page);
}

test('coming back from GitHub signs in, on the page signed in from', async ({ page }) => {
  // What the app leaves in the tab before sending it to GitHub.
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'layerbench:sign-in',
      JSON.stringify({
        state: 'the-state',
        verifier: 'v'.repeat(43),
        returnTo: '/guide/saving',
        at: Date.now(),
      }),
    );
  });
  const asked: string[] = [];
  await page.route('**/api/auth/*', (route) => {
    asked.push(new URL(route.request().url()).pathname);
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ...SIGNED_IN, session: 'sealed-session' }),
    });
  });
  await github(page);

  // GitHub's way back is the app's root, which would otherwise go on to the Library.
  await page.goto('/?code=the-code&state=the-state');
  await expect(page).toHaveURL(/\/guide\/saving$/);
  await expect(
    page.getByRole('button', { name: /^Storage: this browser and GitHub/ }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('layerbench:github-session'))).toBe(
    'sealed-session',
  );
  expect(asked).toEqual(['/api/auth/token']);
});

test('the storage dialog fits the screen when signed in', async ({ page }) => {
  await signedIn(page);
  await page.goto('/library');
  await page.getByRole('button', { name: /^Storage: this browser and GitHub/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Storage' });
  await expect(dialog.getByRole('link', { name: 'Give LayerBench access to it' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Sign out' })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  // The last control can be reached, scrolling inside the dialog if it has to.
  // Exact: the backdrop behind the box is a "close" button too.
  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  await close.scrollIntoViewIfNeeded();
  await expect(close).toBeInViewport();
});
