import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import {
  BOARD,
  LAYOUTS,
  METRICS,
  type Metric,
  PLAYGROUND,
  playgroundUrl,
  type Shown,
} from './cyanophage/layouts.ts';
import { readPlayground } from './cyanophage/playground.ts';
import { CORPUS, pastedText, SAMPLE } from './cyanophage/text.ts';

/**
 * LayerBench's cyanophage-like rules held to cyanophage's playground: the same layouts, typed on the
 * same text, must read what his page prints, to the two decimals it prints. His numbers are a pinned
 * fixture, `cyanophage/fixture.json`, read from his page once; the comparison runs offline.
 * `CYANOPHAGE_CAPTURE=1` reads his page again and writes the fixture instead. It runs as its own
 * Playwright project, `--project=cyanophage`, which the other projects leave out. What differs between
 * the two tools, and how each difference is settled, is in docs/research/cyanophage-e2e.md.
 */

const FIXTURE = fileURLToPath(new URL('./cyanophage/fixture.json', import.meta.url));
const CAPTURE = process.env.CYANOPHAGE_CAPTURE === '1';
const RECAPTURE =
  'run the capture again: CYANOPHAGE_CAPTURE=1 (see docs/research/cyanophage-e2e.md)';

interface Fixture {
  captured: string;
  playground: string;
  script: { url: string; sha256: string };
  corpus: string;
  text: { sha256: string; characters: number; words: number };
  layouts: { name: string; layout: string; url: string; shown: Shown }[];
}

test.describe('capture', () => {
  test.skip(!CAPTURE, 'reads his page only when asked: CYANOPHAGE_CAPTURE=1');
  test.setTimeout(600_000);

  test('reads his playground on every layout and writes the fixture', async ({ page }) => {
    const pasted = await pastedText();
    // His popup measures the first 40,000 distinct words and drops the rest.
    expect(pasted.words).toBeLessThan(40_000);
    const scriptUrl = new URL('keyboard_svg.js', PLAYGROUND).toString();
    const script = await page.request.get(scriptUrl);
    expect(script.ok()).toBe(true);
    const layouts: Fixture['layouts'] = [];
    for (const { name, layout } of LAYOUTS) {
      const shown = await readPlayground(page, layout, pasted.text);
      layouts.push({ name, layout, url: playgroundUrl(layout), shown: ordered(shown) });
    }
    const fixture: Fixture = {
      captured: new Date().toISOString().slice(0, 10),
      playground: PLAYGROUND,
      script: {
        url: scriptUrl,
        sha256: createHash('sha256')
          .update(await script.body())
          .digest('hex'),
      },
      corpus: CORPUS,
      text: { sha256: pasted.sha256, characters: pasted.text.length, words: pasted.words },
      layouts,
    };
    writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`);
  });
});

/** His numbers in the order `METRICS` lists them, so a fixture written again diffs cleanly. */
function ordered(shown: Shown): Shown {
  return Object.fromEntries(METRICS.map((m) => [m, shown[m]])) as Shown;
}

/** What a metric's card on the Analyze page prints, without its unit. */
async function card(page: Page, metric: Metric): Promise<string> {
  const value = page.locator(`#metric-${metric} header .font-mono`);
  return ((await value.textContent()) ?? '').replace('%', '').trim();
}

/** The layout string read through the Library's Import, then analyzed on the whole text. */
async function analyze(page: Page, layout: string): Promise<Shown> {
  await page.goto(`/library?corpus=${CORPUS}&rules=cyanophage`);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a layout' });
  // The board first: the preview is built from the text a moment after it is typed, and the button
  // opens the last preview built, which must already be on this board.
  await dialog.getByLabel('Physical layout', { exact: true }).selectOption(BOARD);
  await dialog.getByLabel('Layout to import', { exact: true }).fill(layout);
  await dialog.getByRole('button', { name: 'Open in analyzer', exact: true }).click();
  await page.waitForURL(/\/analyze/);
  // The Library ranks on a smaller sample; the analysis types the whole text.
  const url = new URL(page.url());
  url.searchParams.set('sample', String(SAMPLE));
  await page.goto(url.toString());
  const summary = page.getByRole('region', { name: 'Summary' });
  await expect(summary).toContainText(`${SAMPLE.toLocaleString('en-US')} symbols of`);
  await expect(page.locator('#metric-effort')).toBeVisible({ timeout: 180_000 });
  await expect(summary).not.toContainText('updating…');
  const shown = {} as Shown;
  for (const m of METRICS) shown[m] = await card(page, m);
  return shown;
}

test.describe('LayerBench reads what cyanophage reads', () => {
  test.skip(CAPTURE, 'the capture writes the fixture this reads');
  test.setTimeout(240_000);
  const fixture: Fixture | null = existsSync(FIXTURE)
    ? JSON.parse(readFileSync(FIXTURE, 'utf8'))
    : null;

  test('his numbers are pinned', () => {
    expect(fixture, RECAPTURE).not.toBeNull();
  });

  test('his numbers were read on the text LayerBench types', async () => {
    const pasted = await pastedText();
    expect(pasted.sha256, RECAPTURE).toBe(fixture?.text.sha256);
    expect(fixture?.layouts.map((l) => [l.name, l.layout])).toEqual(
      LAYOUTS.map((l) => [l.name, l.layout]),
    );
  });

  for (const { name, layout, shown } of fixture?.layouts ?? []) {
    test(`${name} reads as his playground prints it`, async ({ page }) => {
      expect(await analyze(page, layout)).toEqual(shown);
    });
  }
});
