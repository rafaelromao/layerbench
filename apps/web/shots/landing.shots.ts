import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page, test } from '@playwright/test';

/** Where the landing page reads its images: `docs/site/assets/img/<name>-<theme>.png`. */
const OUT = fileURLToPath(new URL('../../../docs/site/assets/img/', import.meta.url));

/** The landing page itself, whose `<img>` sizes follow the files. */
const PAGE = fileURLToPath(new URL('../../../docs/site/index.html', import.meta.url));

/** Every project in playwright.shots.config.ts shoots at this density. */
const DENSITY = 1.5;

/** The analysis every desk shot starts from: Magic Romak, on the conversation it was made for. */
const ANALYZE = '/analyze?layout=magic-romak&corpus=pt-br-conv';

/** A word whose presses show layers at work: a thumb into Alpha 2, `ç`, then `ão` on its layer. */
const WORD = 'ação';

function file(name: string): string {
  const theme = test.info().project.use.colorScheme === 'light' ? 'light' : 'dark';
  return `${OUT}${name}-${theme}.png`;
}

/**
 * The smallest box around every element given, with a little room, in page coordinates. `bottom`
 * overrides the room below, for a crop that ends on an edge with more content right under it.
 */
async function around(page: Page, parts: Locator[], pad = 12, bottom = pad) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const boxes = [];
  for (const part of parts) {
    const box = await part.boundingBox();
    if (!box) throw new Error(`nothing to measure for ${part}`);
    boxes.push(box);
  }
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + pad;
  const end = Math.max(...boxes.map((b) => b.y + b.height)) + bottom;
  return { x, y, width: right - x, height: end - y };
}

async function shootAround(page: Page, name: string, parts: Locator[], bottom?: number) {
  const clip = await around(page, parts, 12, bottom);
  await page.screenshot({ path: file(name), clip, fullPage: true, animations: 'disabled' });
}

/** The layer tabs and the board under them, which together say which layer a press lands on. */
function board(page: Page, id: string): Locator[] {
  return [page.getByRole('tablist', { name: 'Layers' }), page.locator(`#${id}`)];
}

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

/**
 * The page gives every image its size, so nothing shifts as it loads. A crop that changes changes
 * the size, so after the shots the page's `width` and `height` are rewritten from the files; the
 * landing page's own test fails if they ever disagree.
 */
test.afterAll(() => {
  const html = readFileSync(PAGE, 'utf8').replace(
    /(src="assets\/img\/([\w-]+\.png)"\s+width=")\d+("\s+height=")\d+"/g,
    (whole, before: string, name: string, between: string) => {
      if (!existsSync(`${OUT}${name}`)) return whole;
      const png = readFileSync(`${OUT}${name}`);
      const width = Math.round(png.readUInt32BE(16) / DENSITY);
      const height = Math.round(png.readUInt32BE(20) / DENSITY);
      return `${before}${width}${between}${height}"`;
    },
  );
  writeFileSync(PAGE, html);
});

test.describe('at a desk', () => {
  test.skip(({ isMobile }) => isMobile, 'desk layout only');

  test('analyze: the board, its layers and the summary', async ({ page }) => {
    await page.goto(ANALYZE);
    await expect(page.getByText('Same finger bigrams').first()).toBeVisible({ timeout: 120_000 });
    await shootAround(page, 'analyze-board', board(page, 'kb-analyze'));
    await page.getByLabel('Summary metrics').screenshot({
      path: file('analyze-summary'),
      animations: 'disabled',
    });
  });

  test('trace: a word typed press by press', async ({ page }) => {
    // Layer-tap heat leaves the letter keys plain, so the key each press lights stands out.
    await page.goto(`${ANALYZE}&heat=layer_taps`);
    await expect(page.getByText('Same finger bigrams').first()).toBeVisible({ timeout: 120_000 });
    await page.getByLabel('How is this typed?').fill(WORD);
    const presses = page.getByRole('list', { name: 'Presses' }).getByRole('button');
    await expect(presses.first()).toBeVisible();
    const pause = page.getByRole('button', { name: /Pause/ });
    if (await pause.isVisible()) await pause.click();
    const count = await presses.count();
    for (let i = 0; i < count; i++) {
      await presses.nth(i).click();
      await shootAround(page, `trace-${i + 1}`, board(page, 'kb-analyze'));
    }
  });

  test('library: ranked with or without special features', async ({ page }) => {
    // English news, the Library's own default, where most bundled layouts were made to be typed.
    await page.goto('/library');
    await expect(page.getByText(/^Lower is better for both/)).toBeVisible({ timeout: 150_000 });
    // Two cards: what is chosen to rank by is in a dialog, and the line above them says it.
    const cards = page.locator('article');
    await shootAround(page, 'library', [cards.nth(0), cards.nth(1)]);
  });

  test('compare: two layouts typed without the same features', async ({ page }) => {
    await page.goto('/compare?layout=magic-romak&b=graphite&corpus=pt-br-conv&off=macros');
    await expect(page.getByRole('table')).toBeVisible({ timeout: 150_000 });
    // Down to the end of both summaries: every number side by side, and no card cut in half.
    const summaries = page.getByLabel('Summary metrics');
    await shootAround(page, 'compare', [
      page.locator('#compare-toolbar'),
      summaries.nth(0),
      summaries.nth(1),
    ]);
  });

  test('edit: a key, and what it does', async ({ page }) => {
    await page.goto('/analyze?layout=magic-romak&corpus=pt-br-conv&sample=20000');
    await expect(page.getByRole('list', { name: 'Summary metrics' })).toBeVisible({
      timeout: 120_000,
    });
    await page.getByRole('button', { name: /^Key LHI:/ }).click();
    const inspector = page.getByRole('group', { name: 'Edit LHI' });
    await expect(inspector).toBeVisible();
    // The key's own numbers, settled: its lists come from the worker a moment after its parts.
    await expect(inspector.getByText('updating…')).toBeHidden({ timeout: 30_000 });
    await shootAround(page, 'edit', [...board(page, 'kb-analyze'), inspector]);
  });

  test('rules: every rule as data, with its source', async ({ page }) => {
    await page.goto('/rules');
    const bigrams = page.getByRole('region', { name: 'Bigrams' });
    await expect(bigrams).toBeVisible();
    // The first five rules, ending on the fifth one's edge: the sixth starts right under it.
    await shootAround(
      page,
      'rules',
      [bigrams.getByRole('heading').first(), bigrams.locator('tbody > tr').nth(4)],
      0,
    );
  });
});

test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout only');

  test('edit: a key selected, its inspector right under the board', async ({ page }) => {
    await page.goto('/analyze?layout=magic-romak&corpus=pt-br-conv&sample=20000');
    await expect(page.getByRole('list', { name: 'Summary metrics' })).toBeVisible({
      timeout: 120_000,
    });
    await page.getByRole('button', { name: /^Key LHI:/ }).tap();
    const inspector = page.getByRole('group', { name: 'Edit LHI' });
    await expect(inspector).toBeVisible();
    await expect(inspector.getByText('updating…')).toBeHidden({ timeout: 30_000 });
    await page.screenshot({ path: file('phone'), animations: 'disabled' });
  });
});
