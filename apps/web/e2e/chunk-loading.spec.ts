import { expect, type Page, test } from '@playwright/test';

const VIEW_CHUNKS = ['AnalyzeView', 'CompareView', 'RulesView', 'CorpusView', 'GuideView'];

function scriptRequests(page: Page): Set<string> {
  const requests = new Set<string>();
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js')) {
      requests.add(url.pathname);
    }
  });
  return requests;
}

function pageChunk(requests: Set<string>, slug: string): boolean {
  const name = slug === 'metrics' ? 'metrics' : slug || 'readme';
  return [...requests].some((path) => path.toLowerCase().includes(`/${name.toLowerCase()}-`));
}

async function openView(page: Page, name: string): Promise<void> {
  const nav = page.locator('header nav[aria-label="Main"]');
  if (await nav.isVisible()) {
    await nav.getByRole('link', { name, exact: true }).click();
  } else {
    await page.getByText('Menu', { exact: true }).tap();
    await page.getByRole('link', { name, exact: true }).tap();
  }
}

test.describe('production code splitting', () => {
  test('shows a pending view while its route chunk loads', async ({ page }) => {
    const requests = scriptRequests(page);
    await page.goto('/library');
    await expect(page.getByRole('heading', { name: 'Layouts' })).toBeVisible();
    expect(
      [...requests].some((path) => VIEW_CHUNKS.some((name) => path.includes(`/${name}-`))),
    ).toBe(false);

    let release!: () => void;
    let requested = false;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const analyzeChunk = /\/assets\/AnalyzeView-[^/]+\.js$/;
    await page.route(analyzeChunk, async (route) => {
      requested = true;
      await held;
      await route.continue();
    });

    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    try {
      await openView(page, 'Analyze');
      await expect.poll(() => requested).toBe(true);
      await expect(page.getByRole('status')).toHaveText('Loading view…');
      await expect(page).toHaveURL(/\/analyze(?:\?|$)/);
    } finally {
      release();
    }

    await expect(page.getByRole('heading', { name: 'Analyze' })).toBeAttached();
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  });

  test('shows a pending page while its Guide Markdown chunk loads', async ({ page }) => {
    await page.goto('/guide');
    await expect(page.getByRole('heading', { name: 'Guide', exact: true })).toBeAttached();

    let release!: () => void;
    let requested = false;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(/\/assets\/editing-[^/]+\.js$/, async (route) => {
      requested = true;
      await held;
      await route.continue();
    });

    try {
      await page
        .locator('nav[aria-label="Guide pages"]')
        .getByRole('link', { name: 'Editing' })
        .click();
      await expect.poll(() => requested).toBe(true);
      await expect(page.getByRole('status')).toHaveText('Loading guide page…');
      await expect(page).toHaveURL(/\/guide\/editing(?:\?|$)/);
    } finally {
      release();
    }

    await expect(page.getByRole('heading', { name: 'Editing a layout' })).toBeAttached();
  });

  test('loads other views and only the selected Guide page', async ({ page }) => {
    const requests = scriptRequests(page);
    await page.goto('/library');
    await expect(page.getByRole('heading', { name: 'Layouts' })).toBeVisible();
    expect(pageChunk(requests, '')).toBe(false);
    for (const slug of ['analyzing', 'editing', 'special-keys', 'importing', 'saving', 'metrics']) {
      expect(pageChunk(requests, slug), `${slug} guide chunk is not loaded yet`).toBe(false);
    }

    const views = [
      { label: 'Analyze', path: /\/analyze(?:\?|$)/, heading: 'Analyze', chunk: 'AnalyzeView' },
      { label: 'Compare', path: /\/compare(?:\?|$)/, heading: 'Compare', chunk: 'CompareView' },
      { label: 'Rules', path: /\/rules(?:\?|$)/, heading: 'Rules', chunk: 'RulesView' },
      { label: 'Corpus', path: /\/corpus(?:\?|$)/, heading: 'Corpora', chunk: 'CorpusView' },
      { label: 'Guide', path: /\/guide(?:\?|$)/, heading: 'Guide', chunk: 'GuideView' },
    ];
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    for (const view of views) {
      await openView(page, view.label);
      await expect(page).toHaveURL(view.path);
      await expect(page.getByRole('heading', { name: view.heading, exact: true })).toBeAttached();
      await expect
        .poll(() => [...requests].some((path) => path.includes(`/${view.chunk}-`)))
        .toBe(true);
    }

    const pages = [
      { label: 'Start here', slug: '', title: 'Guide' },
      { label: 'Analyzing', slug: 'analyzing', title: 'Analyzing a layout' },
      { label: 'Editing', slug: 'editing', title: 'Editing a layout' },
      { label: 'Special keys', slug: 'special-keys', title: 'Special keys' },
      { label: 'Importing and exporting', slug: 'importing', title: 'Importing and exporting' },
      { label: 'Saving and sharing', slug: 'saving', title: 'Saving and sharing' },
      { label: 'Metric glossary', slug: 'metrics', title: 'Metric glossary' },
    ];
    const guidePages = page.locator('nav[aria-label="Guide pages"]');
    for (const guidePage of pages) {
      if (guidePage.slug) {
        expect(pageChunk(requests, guidePage.slug)).toBe(false);
        await guidePages.getByRole('link', { name: guidePage.label, exact: true }).click();
      }
      await expect(
        page.getByRole('heading', { name: guidePage.title, exact: true }),
      ).toBeAttached();
      await expect.poll(() => pageChunk(requests, guidePage.slug)).toBe(true);
    }
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  });

  test('a direct Guide page link loads that page without fetching its neighbors', async ({
    page,
  }) => {
    const requests = scriptRequests(page);
    await page.goto('/guide/editing');
    await expect(
      page.getByRole('heading', { name: 'Editing a layout', exact: true }),
    ).toBeAttached();
    await expect
      .poll(() => [...requests].some((path) => path.toLowerCase().includes('/editing-')))
      .toBe(true);
    expect(pageChunk(requests, 'analyzing')).toBe(false);
    expect(pageChunk(requests, '')).toBe(false);
  });
});
