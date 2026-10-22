import { expect, type Page, test } from '@playwright/test';

/** How far the page is wider than the screen. A phone must never scroll sideways. */
function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

const PULL = 'https://github.com/rafaelromao/layerbench/pull/100';

/**
 * Someone signed in, a maintainer or not. GitHub and the sign-in server are stood in for, so
 * nothing leaves: a proposal and a maintainer's change answer with a pull request.
 */
async function signedIn(page: Page, maintainer: boolean): Promise<void> {
  // The sealed session the browser keeps once signed in, which every request to the server carries.
  await page.addInitScript(() => localStorage.setItem('layerbench:github-session', 'sealed'));
  const answer = {
    available: true,
    signedIn: true,
    login: 'someone',
    maintainer,
    token: 'not-a-token',
    expiresAt: Date.now() + 3600_000,
    clientId: 'Iv1.not-a-client',
  };
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(answer) }),
  );
  for (const route of ['propose', 'maintain']) {
    await page.route(`**/api/auth/${route}`, (r) =>
      r.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ url: PULL }),
      }),
    );
  }
  // GitHub's gists, as for someone with none yet: one is made on the first save, and edited after.
  await page.route('https://api.github.com/**', (route) => {
    const method = route.request().method();
    const gist = JSON.stringify({ id: 'saved', files: {} });
    if (method === 'POST')
      return route.fulfill({ status: 201, contentType: 'application/json', body: gist });
    if (method === 'PATCH' || /\/gists\/saved$/.test(route.request().url())) {
      return route.fulfill({ contentType: 'application/json', body: gist });
    }
    return route.fulfill({ contentType: 'application/json', body: '[]' });
  });
}

test("a maintainer's Delete and Promote are on the cards, and nobody else's", async ({ page }) => {
  await signedIn(page, false);
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Dvorak', level: 3 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete Dvorak from the Library' })).toHaveCount(0);

  await signedIn(page, true);
  await page.reload();
  const remove = page.getByRole('button', { name: 'Delete Dvorak from the Library' });
  await expect(remove).toBeVisible();
  await remove.click();
  const dialog = page.getByRole('dialog', { name: 'Delete Dvorak' });
  await dialog.getByRole('button', { name: 'Open the pull request' }).click();
  await expect(dialog.getByRole('link', { name: PULL })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test('Save on a bundled layout offers to propose the change, and links its pull request', async ({
  page,
}) => {
  await signedIn(page, false);
  await page.goto('/analyze?layout=colemak&corpus=en-general');
  await page.getByRole('region', { name: 'Layout' }).getByRole('button', { name: 'Save' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save Colemak' });
  await expect(dialog.getByRole('button', { name: 'Save a copy' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Propose change' }).click();
  await expect(dialog.getByRole('link', { name: PULL })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});
