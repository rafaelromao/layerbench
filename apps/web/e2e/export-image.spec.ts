import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';

/**
 * What a unit test cannot see: the picture a real browser makes. The card is an SVG drawn from the
 * page's own board and turned into a PNG through a canvas, so what matters is that the browser
 * draws it, that every colour of the page's theme (variables and `color-mix()`) is resolved into
 * the card, and that the page's Content-Security-Policy, which a production build adds and the dev
 * server does not (`E2E_PREVIEW=1`), lets it be shown and saved.
 */

const ANALYZE = '/analyze?layout=magic-romak&corpus=en-general&sample=10000&heat=usage';
const COMPARE = '/compare?layout=qwerty&b=graphite&corpus=en-general&sample=10000&heat=usage';

/** Every PNG starts with these eight bytes. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** What the browser says is wrong with the page: errors, and a policy that refused something. */
function problems(page: Page): string[] {
  const found: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || /content security policy|refused to/i.test(m.text())) {
      found.push(`${m.type()}: ${m.text()}`);
    }
  });
  page.on('pageerror', (e) => found.push(`pageerror: ${e.message}`));
  return found;
}

/** The card the dialog previews, as the SVG text it is made of. */
async function previewSvg(page: Page): Promise<string> {
  const src = await page.getByRole('img', { name: /Preview of the image/ }).getAttribute('src');
  expect(src, 'the preview is a data address, the only image the policy allows').toMatch(
    /^data:image\/svg\+xml/,
  );
  return decodeURIComponent((src ?? '').slice((src ?? '').indexOf(',') + 1));
}

/** Open the dialog once the button is on, wait for the PNG, and save it. */
async function exportImage(page: Page): Promise<{ png: Buffer; name: string }> {
  const open = page.getByRole('button', { name: 'Export image' });
  await expect(open).toBeEnabled({ timeout: 60_000 });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Export image' });
  const download = dialog.getByRole('button', { name: 'Download PNG' });
  await expect(download).toBeEnabled({ timeout: 30_000 });
  const [saved] = await Promise.all([page.waitForEvent('download'), download.click()]);
  const path = await saved.path();
  return { png: await readFile(path), name: saved.suggestedFilename() };
}

/** The size a PNG says it has: the first chunk after the signature is its header. */
function sizeOf(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test('Analyze: saves a PNG of the first layer, its colours resolved, whatever the page allows', async ({
  page,
}) => {
  test.slow();
  const found = problems(page);
  await page.goto(ANALYZE);
  const { png, name } = await exportImage(page);

  expect([...png.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  expect(name).toBe('layerbench-magic-romak.png');
  // Twice the card's 1200 pixels, as tall as what it holds.
  const { width, height } = sizeOf(png);
  expect(width).toBe(2400);
  expect(height).toBeGreaterThan(1200);
  expect(png.length).toBeGreaterThan(50_000);

  const svg = await previewSvg(page);
  // The image carries its own look: nothing of the page's stylesheet or theme is left to resolve.
  expect(svg).not.toContain('var(');
  expect(svg).not.toContain('color-mix');
  expect(svg).not.toContain('class=');
  expect(svg).toContain('Magic Romak');
  expect(svg).toContain('% of presses');
  // The page's Summary, under the board: its captions and values, from the real analysis.
  for (const caption of ['Effort', 'SFB', 'SFS', 'Rolls']) expect(svg).toContain(`>${caption}<`);
  expect(svg).toMatch(/>\d+\.\d{2}%?</);
  expect(svg.indexOf('>Effort<')).toBeGreaterThan(svg.indexOf('% of presses'));
  // The heat is in the keys' own fills, one colour for each key, not one colour for all.
  const fills = new Set([...svg.matchAll(/<rect[^>]*style="fill:([^;"]+)/g)].map((m) => m[1]));
  expect(fills.size).toBeGreaterThan(4);

  expect(found).toEqual([]);
});

test('Analyze: an edit that is not saved is credited to the name given, in the image', async ({
  page,
}) => {
  test.slow();
  const found = problems(page);
  await page.goto(ANALYZE);
  // A change to the layout that is saved nowhere.
  const rename = page.getByRole('textbox', { name: 'Name', exact: true }).first();
  await rename.fill('Magic Romak (my tweak)');
  await rename.press('Tab');
  await expect(page.getByTitle('Unsaved changes', { exact: true })).toBeVisible();

  const open = page.getByRole('button', { name: 'Export image' });
  await expect(open).toBeEnabled({ timeout: 60_000 });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Export image' });
  await dialog.getByLabel('Unsaved edits by').fill('@someone');
  await expect(dialog.getByRole('button', { name: 'Download PNG' })).toBeEnabled({
    timeout: 30_000,
  });

  const svg = await previewSvg(page);
  expect(svg).toContain('Magic Romak (my tweak)');
  expect(svg).toContain('Unsaved edits by @someone');
  // The layout's author is credited beside whoever made the edits.
  expect(svg).toContain('by Rafael Romão');
  expect(found).toEqual([]);
});

test('Compare: one PNG of both layouts, one over the other', async ({ page }) => {
  test.slow();
  const found = problems(page);
  await page.goto(COMPARE);
  const { png, name } = await exportImage(page);

  expect([...png.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  expect(name).toBe('layerbench-qwerty-vs-graphite.png');
  const { width, height } = sizeOf(png);
  expect(width).toBe(2400);
  // Two boards, so taller than wide.
  expect(height).toBeGreaterThan(width);

  const svg = await previewSvg(page);
  expect(svg).toContain('A · Qwerty');
  expect(svg).toContain('B · Graphite');
  expect(svg).toContain('one scale for both layouts');
  // A Summary under each of the two boards.
  expect(svg.match(/>Effort</g)).toHaveLength(2);
  expect(svg).not.toContain('var(');
  expect(svg).not.toContain('color-mix');
  // Both boards are coloured: many fills, not the one of a board with no heat.
  const fills = new Set([...svg.matchAll(/<rect[^>]*style="fill:([^;"]+)/g)].map((m) => m[1]));
  expect(fills.size).toBeGreaterThan(4);
  expect(found).toEqual([]);
});

test('Compare: an edit sent from Analyze is credited to the name given, and only on its side', async ({
  page,
}) => {
  test.slow();
  const found = problems(page);
  await page.goto(ANALYZE);
  const rename = page.getByRole('textbox', { name: 'Name', exact: true }).first();
  await rename.fill('Magic Romak (my tweak)');
  await rename.press('Tab');
  await expect(page.getByTitle('Unsaved changes', { exact: true })).toBeVisible();
  // The edit travels in the link, and this tab remembers it wrote it.
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await page.waitForURL(/\/compare/);

  const open = page.getByRole('button', { name: 'Export image' });
  await expect(open).toBeEnabled({ timeout: 60_000 });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Export image' });
  await dialog.getByLabel('Unsaved edits by').fill('@someone');
  await expect(dialog.getByRole('button', { name: 'Download PNG' })).toBeEnabled({
    timeout: 30_000,
  });

  const svg = await previewSvg(page);
  expect(svg).toContain('A · Magic Romak (my tweak)');
  expect(svg).toContain('B · Qwerty');
  // One line of it: Qwerty, as it comes with the app, is nobody's edit.
  expect(svg.match(/Unsaved edits by @someone/g)).toHaveLength(1);
  expect(found).toEqual([]);
});

test('the dialog fits the screen, at a phone’s width as at a desk’s', async ({ page }) => {
  test.slow();
  await page.goto(ANALYZE);
  const open = page.getByRole('button', { name: 'Export image' });
  await expect(open).toBeEnabled({ timeout: 60_000 });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Export image' });
  const download = dialog.getByRole('button', { name: 'Download PNG' });
  await expect(download).toBeEnabled({ timeout: 30_000 });

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
  const box = await dialog.locator('.modal-box').boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width + 1).toBe(true);
  // The buttons are reached, scrolling the dialog if it must.
  await download.scrollIntoViewIfNeeded();
  await expect(download).toBeInViewport();
});
