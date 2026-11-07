import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { boardKeys, type LayerScore, scoreLayer } from './keymapdb/compare.ts';
import { CACHE, ENTRIES, entryDir, type Known, MISTAKES, mistakePath } from './keymapdb/entries.ts';
import type { KeymapImage } from './keymapdb/image.ts';

/**
 * The keymaps of keymapdb.com whose repositories keep a keymap-drawer file, each read through
 * the Library's Import and held against the picture keymapdb shows for it; and the files beside
 * them that someone could choose by mistake, each refused with its reason. The files come from
 * `keymapdb/refresh.ts`, at pinned commits; what each keymap reads as is written to
 * `keymapdb/.cache/results/`, for docs/research/keymapdb-import.md.
 */

test.skip(
  ({ isMobile }) => isMobile,
  'once is enough: phone-menus.spec.ts fits the dialog to a phone',
);

const BOARD = 'kb-kd-import';
const REFRESH = 'run `node apps/web/e2e/keymapdb/refresh.ts` first';
/** A keymap every test can fall back on: it describes its own board, so nothing is chosen. */
const GOOD = ENTRIES.find((e) => e.slug === 'jcmkk3');

/** What went wrong in the page: what it threw and did not catch, and the errors it logged. */
function watch(page: Page): string[] {
  const seen: string[] = [];
  page.on('pageerror', (e) => seen.push(`uncaught: ${e.message}`));
  page.on('console', (m) => {
    // A file the browser could not fetch (the community index, offline) is not the dialog's.
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) {
      seen.push(m.text());
    }
  });
  return seen;
}

/** The Library's Import dialog, open on its keymap-drawer tab. */
async function keymapPanel(page: Page): Promise<Locator> {
  await page.goto('/library?sample=10000');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a layout' });
  await dialog.getByRole('tab', { name: 'keymap-drawer', exact: true }).click();
  return dialog.getByRole('tabpanel');
}

type File = string | { name: string; mimeType: string; buffer: Buffer };

function choose(panel: Locator, file: File): Promise<void> {
  return panel.getByLabel('Choose a .yaml file', { exact: true }).setInputFiles(file);
}

const heading = (panel: Locator, name: string) => panel.getByRole('heading', { name, exact: true });

/** The box that says which board the keymap goes onto. */
const boardBox = (panel: Locator) =>
  panel
    .locator('.rounded-box')
    .filter({ has: panel.page().getByRole('heading', { name: 'Board' }) });

const importButton = (panel: Locator) =>
  panel.getByRole('button', { name: 'Import and edit', exact: true });

/** What the dialog says about a keymap on the board it shows, and each layer held to the picture. */
interface Reading {
  board: string[];
  /** The board picked in the list, where there is a list. */
  picked: string | null;
  /** Each layer's name, and what was read of it. */
  layers: { name: string; read: string }[];
  combos: string | null;
  notes: string[];
  errors: string[];
  /** The layers as drawn, held against the picture's; none when there is no preview. */
  scores: LayerScore[];
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

async function read(panel: Locator, image: KeymapImage | null): Promise<Reading> {
  const page = panel.page();
  const select = panel.getByRole('combobox', { name: 'Board to import onto', exact: true });
  const combos = panel.getByText(/^\d+ combos? read/);
  const layers = await panel.locator('.lb-import-layer').evaluateAll((items) =>
    items.map((li) => ({
      name: (li.querySelector('input[type=checkbox]')?.getAttribute('aria-label') ?? '').replace(
        /^Import /,
        '',
      ),
      // What was read of it, without the badge on the base layer.
      read: [...(li.querySelector('.lb-import-layer-report')?.childNodes ?? [])]
        .filter((n) => !(n instanceof Element && n.classList.contains('badge')))
        .map((n) => n.textContent)
        .join(''),
    })),
  );
  const reading: Reading = {
    board: (await boardBox(panel).locator('p').allInnerTexts()).map(squash),
    picked:
      (await select.count()) > 0
        ? await select.evaluate((s: HTMLSelectElement) => s.selectedOptions[0]?.textContent ?? '')
        : null,
    layers: layers.map((l) => ({ name: l.name, read: squash(l.read) })),
    combos: (await combos.count()) > 0 ? squash(await combos.innerText()) : null,
    notes: await panel.locator('ul.text-warning li').allInnerTexts(),
    errors: await panel.locator('.text-error').allInnerTexts(),
    scores: [],
  };
  if (!image || (await page.locator(`#${BOARD}`).count()) === 0) return reading;

  // Walk the preview's layers from the first, holding each to the picture's layer of its name,
  // and the first to the picture's first whatever its name.
  const nav = panel.getByRole('group', { name: 'Layers', exact: true });
  const n = layers.length;
  // At the first layer the arrow is aria-disabled, which Playwright would wait on for ever.
  const previous = nav.getByRole('button', { name: 'Previous layer' });
  while (n > 1 && (await previous.getAttribute('aria-disabled')) !== 'true') {
    await previous.click();
  }
  for (let i = 0; i < n; i++) {
    if (n > 1) await expect(nav.getByText(`${i + 1} / ${n}`, { exact: true })).toBeVisible();
    const name = layers[i].name;
    const against = image.layers.find((l) => l.name === name) ?? (i === 0 ? image.layers[0] : null);
    if (against) reading.scores.push(scoreLayer(name, await boardKeys(page, BOARD), against));
    if (i < n - 1) await nav.getByRole('button', { name: 'Next layer' }).click();
  }
  return reading;
}

/** The base layer has every letter of the picture, each on its hand; or, pinned, what it lacks. */
function lettersRight(reading: Reading, where: string, missing?: string[]): void {
  const base = reading.scores[0];
  if (!base) return;
  if (missing) {
    expect
      .soft([...base.missing].sort(), `characters not on ${where}`)
      .toEqual([...missing].sort());
  } else {
    expect
      .soft(
        base.missing.filter((c) => /\p{L}/u.test(c)),
        `letters not on ${where}`,
      )
      .toEqual([]);
  }
  expect.soft(base.otherHand, `letters on the other hand, on ${where}`).toEqual([]);
}

const NO_SPACE = 'No key on the base layer types a space';

for (const entry of ENTRIES) {
  test(`${entry.slug}: the keymap reads as keymapdb pictures it`, async ({ page }, info) => {
    const dir = entryDir(entry);
    test.skip(!existsSync(join(dir, 'keymap.yaml')), REFRESH);
    test.slow();
    const errors = watch(page);
    const known: Known = entry.known ?? {};
    const imageFile = join(dir, 'image.json');
    const image: KeymapImage | null = existsSync(imageFile)
      ? JSON.parse(readFileSync(imageFile, 'utf8'))
      : null;
    const preview = page.locator(`#${BOARD}`);

    const panel = await keymapPanel(page);
    await choose(panel, join(dir, 'keymap.yaml'));
    // Every file of these reads: the board and the layers are offered.
    await expect(heading(panel, 'Board')).toBeVisible();
    await expect(heading(panel, 'Layers')).toBeVisible();

    // The board the dialog offers by itself, the one most readers take.
    const offered = await read(panel, image);
    const hasOffered = (await preview.count()) > 0;
    expect.soft(offered.errors, 'messages on the board offered').toEqual([]);
    if (hasOffered) {
      await expect(importButton(panel)).toBeEnabled();
      lettersRight(offered, 'the board offered');
    } else {
      // No board has as many keys: one must be chosen, and nothing is made before then.
      await expect(panel.getByText(/No board here has \d+ keys/)).toBeVisible();
      await expect(importButton(panel)).toBeDisabled();
    }

    // The keyboard's own layout file, where keymap-drawer has one for the name the file gives.
    let ownFile: Reading | null = null;
    if (entry.board) {
      await panel
        .getByLabel('Use a QMK info.json…', { exact: true })
        .setInputFiles(join(dir, 'board.json'));
      await expect(
        panel
          .getByRole('option', { name: /\(from info\.json\)$/ })
          .or(boardBox(panel).locator('.text-error')),
      ).toBeAttached();
      ownFile = await read(panel, image);
      expect(ownFile.picked, 'the board from the layout file').toMatch(/\(from info\.json\)$/);
      expect(ownFile.errors, 'messages on the layout file').toEqual([]);
      await expect(preview).toBeVisible();
      await expect(importButton(panel)).toBeEnabled();
      if (known.ownFile) {
        expect.soft(ownFile.board.join(' '), known.ownFile.finding).toContain(known.ownFile.board);
      }
      lettersRight(ownFile, 'its own layout file', known.ownFile?.missing);
    }

    const result = {
      slug: entry.slug,
      image: image && {
        layers: image.layers.map((l) => `${l.name} (${l.keys.length})`),
        combos: image.combos,
      },
      offered,
      ownFile,
    };
    mkdirSync(join(CACHE, 'results'), { recursive: true });
    writeFileSync(
      join(CACHE, 'results', `${entry.slug}.json`),
      `${JSON.stringify(result, null, 1)}\n`,
    );
    await info.attach('reading', {
      body: JSON.stringify(result, null, 1),
      contentType: 'application/json',
    });

    // What goes to Analyze: the board offered, back from the layout file, else the layout file's.
    const taken = hasOffered ? offered : ownFile;
    expect(taken, 'a board to make the layout on').not.toBeNull();
    if (!taken) return;
    expect
      .soft(
        taken.notes.some((n) => n.startsWith(NO_SPACE)),
        known.noSpace ?? 'a space bar',
      )
      .toBe(known.noSpace !== undefined);
    if (known.unread) {
      expect.soft(taken.layers[0]?.read, known.unread.finding).toContain(known.unread.says);
    }
    if (hasOffered && ownFile) {
      await panel
        .getByRole('combobox', { name: 'Board to import onto', exact: true })
        .selectOption({ label: offered.picked ?? '' });
      const onto = offered.board.find((b) => b.startsWith('Onto')) ?? '';
      await expect(boardBox(panel)).toContainText(onto);
    }

    // And it makes a layout the analysis reads.
    await expect(importButton(panel)).toBeEnabled();
    await importButton(panel).click();
    await expect(page.getByText('Saved My layout').first()).toBeVisible();
    await expect(page).toHaveURL(/\/analyze/);
    await expect(page.getByRole('list', { name: 'Summary metrics' })).toBeVisible({
      timeout: 45_000,
    });
    expect(errors).toEqual([]);
  });
}

/** Every file chosen by mistake says why it is not a keymap, and a keymap chosen next reads. */
for (const m of MISTAKES) {
  test(`${m.slug}: ${m.what} ${m.says ? 'is refused with its reason' : 'reads'}`, async ({
    page,
  }) => {
    test.skip(!existsSync(mistakePath(m)) || !GOOD, REFRESH);
    const errors = watch(page);
    const panel = await keymapPanel(page);
    await choose(panel, mistakePath(m));
    if (m.says === null) {
      await expect(heading(panel, 'Board')).toBeVisible();
      await expect(page.locator(`#${BOARD}`)).toBeVisible();
    } else {
      await expect(panel.locator('.text-error')).toHaveText(m.says);
      await expect(heading(panel, 'Board')).toHaveCount(0);
      await expect(importButton(panel)).toHaveCount(0);
      await choose(panel, join(entryDir(GOOD as (typeof ENTRIES)[number]), 'keymap.yaml'));
      await expect(page.locator(`#${BOARD}`)).toBeVisible();
      await expect(panel.locator('.text-error')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}

test.describe('a file that does not read', () => {
  const good = () =>
    readFileSync(join(entryDir(GOOD as (typeof ENTRIES)[number]), 'keymap.yaml'), 'utf8');
  const yaml = (name: string, text: string): File => ({
    name,
    mimeType: 'text/yaml',
    buffer: Buffer.from(text),
  });

  test.beforeEach(() => {
    test.skip(!GOOD || !existsSync(join(entryDir(GOOD), 'keymap.yaml')), REFRESH);
  });

  test('cut short, says where', async ({ page }) => {
    const errors = watch(page);
    const panel = await keymapPanel(page);
    const text = good();
    await choose(panel, yaml('cut.yaml', text.slice(0, text.indexOf('[x, c') + 8)));
    await expect(panel.locator('.text-error')).toHaveText(/^line \d+: unclosed \[/);
    expect(errors).toEqual([]);
  });

  test('indented with a tab, says so', async ({ page }) => {
    const errors = watch(page);
    const panel = await keymapPanel(page);
    await choose(panel, yaml('tab.yaml', good().replace('\n  alphas:', '\n\talphas:')));
    await expect(panel.locator('.text-error')).toHaveText(/a tab cannot indent YAML/);
    expect(errors).toEqual([]);
  });

  test('empty, says it is empty', async ({ page }) => {
    test.fail(
      true,
      'F10: an empty file is met with nothing at all (docs/research/keymapdb-import.md)',
    );
    const errors = watch(page);
    const panel = await keymapPanel(page);
    await choose(panel, yaml('empty.yaml', ''));
    await expect(panel.locator('.text-error')).toBeVisible({ timeout: 3_000 });
    expect(errors).toEqual([]);
  });

  test('is announced, not only shown', async ({ page }) => {
    test.fail(
      true,
      'F9: the reason is a plain paragraph, not an alert (docs/research/keymapdb-import.md)',
    );
    test.skip(!existsSync(mistakePath(MISTAKES[0])), REFRESH);
    const errors = watch(page);
    const panel = await keymapPanel(page);
    await choose(panel, mistakePath(MISTAKES[0]));
    await expect(panel.locator('.text-error')).toBeVisible();
    expect(errors).toEqual([]);
    await expect(panel.getByRole('alert')).toContainText('not a keymap-drawer file', {
      timeout: 3_000,
    });
  });
});

test.describe("the dialog's own errors", () => {
  test.beforeEach(() => {
    test.skip(!GOOD || !existsSync(join(entryDir(GOOD), 'keymap.yaml')), REFRESH);
  });

  test('no layer ticked: nothing to make, and it says so', async ({ page }) => {
    const errors = watch(page);
    const panel = await keymapPanel(page);
    await choose(panel, join(entryDir(GOOD as (typeof ENTRIES)[number]), 'keymap.yaml'));
    const boxes = panel.getByRole('list', { name: 'Layers to import' }).getByRole('checkbox');
    // The file is read a moment after it is chosen: wait for its four layers.
    await expect(boxes).toHaveCount(4);
    for (const box of await boxes.all()) await box.uncheck();
    await expect(panel.getByText('Choose at least one layer to import.')).toBeVisible();
    await expect(importButton(panel)).toBeDisabled();
    await boxes.first().check();
    await expect(importButton(panel)).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test('a layout file that is not one says so, and a good one clears it', async ({ page }) => {
    const entry = ENTRIES.find((e) => e.slug === 'rearman');
    test.skip(!entry || !existsSync(join(entryDir(entry), 'board.json')), REFRESH);
    const dir = entryDir(entry as (typeof ENTRIES)[number]);
    const errors = watch(page);
    const panel = await keymapPanel(page);
    await choose(panel, join(dir, 'keymap.yaml'));
    const layoutFile = panel.getByLabel('Use a QMK info.json…', { exact: true });
    await layoutFile.setInputFiles(join(dir, 'keymap.yaml'));
    await expect(boardBox(panel).locator('.text-error')).toBeVisible();
    // JSON, but no keyboard's layout.
    await layoutFile.setInputFiles({
      name: 'info.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"keyboard_name": "x"}'),
    });
    await expect(boardBox(panel).locator('.text-error')).toHaveText(/not a QMK info\.json/);
    await layoutFile.setInputFiles(join(dir, 'board.json'));
    await expect(boardBox(panel).locator('.text-error')).toHaveCount(0);
    await expect(page.locator(`#${BOARD}`)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('with a layout file given, the board box stops asking for one', async ({ page }) => {
    test.fail(
      true,
      'F15: the sentence about the board offered stays (docs/research/keymapdb-import.md)',
    );
    const entry = ENTRIES.find((e) => e.slug === 'akioweh');
    test.skip(!entry || !existsSync(join(entryDir(entry), 'board.json')), REFRESH);
    const dir = entryDir(entry as (typeof ENTRIES)[number]);
    const errors = watch(page);
    const panel = await keymapPanel(page);
    await choose(panel, join(dir, 'keymap.yaml'));
    await expect(panel.getByText(/No board here has 50 keys/)).toBeVisible();
    await panel
      .getByLabel('Use a QMK info.json…', { exact: true })
      .setInputFiles(join(dir, 'board.json'));
    await expect(page.locator(`#${BOARD}`)).toBeVisible();
    expect(errors).toEqual([]);
    await expect(boardBox(panel)).not.toContainText('No board here has', { timeout: 3_000 });
  });

  test('columns and thumbs it cannot read leave a board to choose', async ({ page }) => {
    test.fail(
      true,
      'F11: the notation error stays whatever board is chosen (docs/research/keymapdb-import.md)',
    );
    const errors = watch(page);
    const panel = await keymapPanel(page);
    await choose(panel, {
      name: 'notation.yaml',
      mimeType: 'text/yaml',
      buffer: Buffer.from('layout: {cols_thumbs_notation: 33x}\nlayers:\n  Base: [a, b, c]\n'),
    });
    await expect(boardBox(panel).locator('.text-error')).toBeVisible();
    await panel
      .getByRole('combobox', { name: 'Board to import onto', exact: true })
      .selectOption({ index: 1 });
    await expect(page.locator(`#${BOARD}`)).toBeVisible({ timeout: 3_000 });
    expect(errors).toEqual([]);
  });
});
