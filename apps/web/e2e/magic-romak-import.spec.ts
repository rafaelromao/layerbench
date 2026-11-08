import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

/*
 * The same Magic Romak, made twice and compared: by importing the keymap-drawer file its author keeps
 * for it, and by hand, in the editor, from what that file draws. The guide says an import gives the
 * layout a person would make by hand, so the two must be the same layout and be analyzed the same.
 * When they are not, the failure names the layer and key, and says what each way made, so it is
 * plain which of the two departs from what the file draws: the importer, if it reads a legend as
 * something the editor cannot make or misreads it; the editor, if the controls make something else
 * from the same input.
 *
 * What the file cannot say (an adaptive key's branches, a sentence space, caps word) is not in
 * either: the core tests pin Magic Romak as this import plus those.
 */

const FILE = readFileSync(
  new URL('../../../packages/core/fixtures/romak-keymap-drawer.yaml', import.meta.url),
);
const SETTINGS = 'corpus=pt-br-general&sample=10000';

/** The layers taken from the file, by the name there, and what each is called here. */
const LAYERS = [
  ['alpha1', 'Alpha 1'],
  ['alpha2', 'Alpha 2'],
  ['ç-extension', 'Ç extension'],
  ['numbers', 'Numbers'],
  ['symbols', 'Symbols'],
] as const;

const KEY_IDS = [
  ...['LTR', 'LTM', 'LTI', 'LHP', 'LHR', 'LHM', 'LHI', 'LBR', 'LBM', 'LBI'],
  ...['RTI', 'RTM', 'RTR', 'RHI', 'RHM', 'RHR', 'RHP', 'RBI', 'RBM', 'RBR'],
  ...['L1', 'L0', 'R0', 'R1'],
];

// ------------------------------------------------------------------ what the file draws, by hand

/*
 * Each key as a person would type it on the key: a symbol, or ZMK's text (`&lt Numbers SPACE` is
 * Numbers held, a space tapped; `&macro ç then 2` types ç and turns layer 2, the Ç extension, on for
 * the next key). Read from the file's legends, not from the importer.
 */

const ALPHA_1: Record<string, string> = {
  ...{ LTR: 'b', LTM: 'm', LTI: 'g', RTI: 'l', RTM: 'o', RTR: 'u' },
  ...{ LHP: 'd', RHP: 'i', RBM: ',', RBR: '.' },
  ...{ L1: '&key_repeat', L0: '&lt Numbers SPACE', R1: '&sk LSHIFT' },
};

/** Home row mods: the letter tapped, the modifier held, and the one held with it. */
const HOME_MODS: Record<string, [tap: string, hold: string, also?: string]> = {
  ...{ LHR: ['n', 'Control'], LHM: ['s', 'Alt'], LHI: ['t', 'Shift'] },
  ...{ RHI: ['r', 'Shift'], RHM: ['a', 'Alt'], RHR: ['e', 'Control'] },
  ...{ LBR: ['f', 'Command', 'Shift'], LBM: ['c', 'Command', 'Shift'], LBI: ['p', 'Command'] },
  ...{ RBI: ['h', 'Command'] },
};

const ALPHA_2: Record<string, string> = {
  ...{ LTR: 'q', LTI: 'k', RTI: 'ô', RTM: 'ó', RTR: 'ú' },
  ...{ LHP: 'y', LHR: 'z', LHM: 'x', LHI: 'w', RHI: 'ã', RHM: 'á', RHR: 'é', RHP: 'í' },
  ...{ LBR: 'j', LBM: '&macro ç then 2', LBI: 'v', RBI: 'õ', RBM: 'â', RBR: 'ê' },
  ...{ L1: '&key_repeat', L0: '_', R0: '&kp SPACE', R1: "'" },
};

/** The Ç extension: a few keys, the ones that do nothing, and five that show Alpha 2 through. */
const C_EXTENSION: Record<string, string> = {
  ...{ LHI: '&macro ão', LBI: '&macro ões', RHI: 'ã', RBI: 'õ', L1: '&sl 1' },
  ...Object.fromEntries(
    ['LTR', 'LTM', 'LTI', 'RTI', 'LHP', 'LHR', 'LHM', 'RHR', 'RHP', 'LBR', 'LBM'].map((id) => [
      id,
      '&none',
    ]),
  ),
  ...{ L0: '&none', R0: '&none', R1: '&none' },
};

const NUMBERS: Record<string, string> = {
  ...{ LTR: '\\', LTM: '{', LTI: '}', RTI: '7', RTM: '8', RTR: '9' },
  ...{ LHP: ',', LHR: '&kp AMPS', LHM: '(', LHI: ')', RHI: '4', RHM: '5', RHR: '6', RHP: '.' },
  ...{ LBR: '|', LBM: '[', LBI: ']', RBI: '1', RBM: '2', RBR: '3' },
  ...{ R0: '&lt Symbols SPACE', R1: '0' },
};

const SYMBOLS: Record<string, string> = {
  ...{ LTR: '~', LTM: '#', LTI: "'", RTI: '%', RTM: '=', RTR: ':' },
  ...{ LHP: '@', LHR: '^', LHM: '$', LHI: '"', RHI: '?', RHM: '-', RHR: '+', RHP: '_' },
  ...{ LBR: '<', LBM: '>', LBI: '`', RBI: '!', RBM: '/', RBR: '*' },
  ...{ L0: '&lt Numbers SPACE' },
};

/** A combo: the layer it is added on, its keys in the order the file lists them, what it types. */
type Combo = [layer: number, keys: string[], types: string, also?: string[]];

const COMBOS: Combo[] = [
  // Alpha 1: the letters that are on chords, and `;`, which Numbers has too.
  ...(
    [
      [['LTM', 'LTI'], 'k'],
      [['RTI', 'RTM'], 'x'],
      [['LHR', 'LHM'], 'q'],
      [['LHM', 'LHI'], 'w'],
      [['RHI', 'RHM'], 'z'],
      [['RHM', 'RHR'], 'y'],
      [['LBM', 'LBI'], 'v'],
      [['RBI', 'RBM'], 'j'],
    ] as [string[], string][]
  ).map(([keys, types]): Combo => [0, keys, types]),
  [0, ['RBM', 'RBR'], ';', ['Numbers']],
  // Alpha 2: the accents as dead keys, and what is left of the punctuation.
  [1, ['LTM', 'LTI'], '&dead ¨'],
  [1, ['RTI', 'RTM'], '-'],
  [1, ['LHR', 'LHM'], '&dead ^'],
  [1, ['LHM', 'LHI'], '&dead ´'],
  [1, ['RHI', 'RHM'], '?'],
  [1, ['RHM', 'RHR'], 'à'],
  [1, ['LBR', 'LBM'], '&dead `'],
  [1, ['LBM', 'LBI'], '&dead ~'],
  [1, ['RBI', 'RBM'], '!'],
  [1, ['RBM', 'RBR'], ':'],
  // Numbers: four more letters and a bar, and the degree and ordinal signs.
  [3, ['RTI', 'RTM'], 'g'],
  [3, ['RHI', 'RHM'], 'j'],
  [3, ['RHM', 'RHR'], 'k'],
  [3, ['RBI', 'RBM'], '|'],
  [3, ['RHI', 'RHM', 'RHR'], 'º'],
  [3, ['RBI', 'RBM', 'RBR'], '°'],
  // Symbols: the euro.
  [4, ['RTI', 'RTM', 'RTR'], '€'],
];

// ------------------------------------------------------------------ the editor

const board = (page: Page) => page.locator('#kb-analyze');

/**
 * A click on a key's button. The board draws combos over and between its keys, so the click is sent
 * to the key itself, as the board's own handler receives it, instead of to a point on the page.
 */
async function pressKey(page: Page, id: string): Promise<void> {
  await board(page)
    .getByRole('button', { name: new RegExp(`^Key ${id}:`) })
    .dispatchEvent('click');
}

async function openTab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name, exact: true }).click();
}

/** Turn the board to a layer, by its place in the list; the layers' own navigator, not the URL. */
async function showLayer(page: Page, index: number): Promise<void> {
  const nav = page.locator('fieldset[aria-label="Layers"]').first();
  const at = async () =>
    Number((await nav.locator('[aria-live="polite"]').innerText()).split('/')[0]) - 1;
  for (let n = 0; n < 10 && (await at()) > index; n++) {
    await nav.getByRole('button', { name: 'Previous layer' }).click();
  }
  for (let n = 0; n < 10 && (await at()) < index; n++) {
    await nav.getByRole('button', { name: 'Next layer' }).click();
  }
  expect(await at()).toBe(index);
}

/** Type a key's binding in its "Binding for" box, as ZMK's text or a symbol. */
async function typeOnKey(page: Page, id: string, text: string): Promise<void> {
  await pressKey(page, id);
  const box = page.getByRole('textbox', { name: `Binding for ${id}`, exact: true });
  await box.fill(text);
  await box.press('Enter');
}

/** A tap-hold: the letter tapped, a modifier held, and another held with it. */
async function typeHomeMod(page: Page, id: string, [tap, hold, also]: string[]): Promise<void> {
  await typeOnKey(page, id, tap);
  const editor = page.getByRole('group', { name: `Edit ${id}`, exact: true });
  await editor.getByRole('button', { name: /Tap-hold/ }).click();
  await editor.getByRole('combobox', { name: 'Hold kind', exact: true }).selectOption('modifier');
  const chips = (group: string) => editor.getByRole('group', { name: group, exact: true });
  await chips('Hold modifier').getByRole('button', { name: hold, exact: true }).click();
  if (also) {
    await chips('Hold modifiers held with it')
      .getByRole('button', { name: also, exact: true })
      .click();
  }
}

/** Alpha 1's right inner thumb: Alpha 2 for the next key when tapped, Symbols while held. */
async function typeAlpha2OverSymbols(page: Page, id: string): Promise<void> {
  await pressKey(page, id);
  const editor = page.getByRole('group', { name: `Edit ${id}`, exact: true });
  await editor.getByRole('button', { name: /Tap-hold/ }).click();
  await editor.getByRole('combobox', { name: 'Tap kind', exact: true }).selectOption('layer');
  const chips = (group: string) => editor.getByRole('group', { name: group, exact: true });
  await chips('Tap layer').getByRole('button', { name: 'Alpha 2', exact: true }).click();
  await chips('Tap how the layer comes on').getByRole('radio', { name: 'One-shot' }).check();
  await chips('Hold layer').getByRole('button', { name: 'Symbols', exact: true }).click();
}

async function addCombo(page: Page, [layer, keys, types, also = []]: Combo): Promise<void> {
  await showLayer(page, layer);
  await page.getByRole('button', { name: 'New combo' }).click();
  for (const key of keys) await pressKey(page, key);
  await page.getByRole('button', { name: /^Add combo on / }).click();
  const name = keys.join('+');
  const box = page.getByRole('textbox', { name: `Binding for combo ${name}`, exact: true });
  await box.fill(types);
  await box.press('Enter');
  const editor = page.getByRole('group', { name: `Edit combo ${name}`, exact: true });
  for (const other of also)
    await editor.getByRole('checkbox', { name: other, exact: true }).check();
}

/** The layout as the editor's Export panel writes it. */
async function exported(page: Page): Promise<string> {
  await openTab(page, 'Export');
  return page.getByRole('textbox', { name: 'Layout JSON', exact: true }).inputValue();
}

/** The Summary strip's numbers, once the analysis of what is on the board has finished. */
async function summary(page: Page): Promise<string[]> {
  await openTab(page, 'Board');
  const strip = page.getByRole('list', { name: 'Summary metrics' });
  await expect(strip).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('progressbar', { name: 'Analysis progress' })).toHaveCount(0, {
    timeout: 90_000,
  });
  return strip.locator('li').allInnerTexts();
}

// ------------------------------------------------------------------ the two ways

/** Library → Import → keymap-drawer: the file, its five layers named as they are here. */
async function importFile(page: Page): Promise<void> {
  await page.goto(`/library?${SETTINGS}`);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a layout' });
  await dialog.getByRole('tab', { name: 'keymap-drawer' }).click();
  await dialog
    .getByLabel('Choose a .yaml file')
    .setInputFiles({ name: 'keymap-drawer.yaml', mimeType: 'application/yaml', buffer: FILE });
  // The file names its keyboard, whose shape the page cannot look up: the board is chosen.
  await expect(dialog.getByRole('combobox', { name: 'Board to import onto' })).toHaveValue(
    '1333+2',
  );

  const list = dialog.getByRole('list', { name: 'Layers to import' });
  const taken = new Set<string>(LAYERS.map(([file]) => file));
  for (const box of await list.getByRole('checkbox').all()) {
    const label = (await box.getAttribute('aria-label')) ?? '';
    if (!taken.has(label.replace(/^Import /, ''))) await box.uncheck();
  }
  for (const [file, name] of LAYERS) {
    const field = dialog.getByRole('textbox', { name: `Name for ${file}`, exact: true });
    await field.fill(name);
    await field.press('Enter');
  }
  const layout = dialog.getByRole('textbox', { name: 'Name of the new layout', exact: true });
  await layout.fill('Magic Romak imported');
  await layout.press('Enter');
  await dialog.getByRole('button', { name: 'Import and edit' }).click();
  await expect(page).toHaveURL(/\/analyze\?/);
  await expect(board(page).getByRole('button', { name: /^Key LTR:/ })).toBeVisible();
}

/** Library → New layout on the 24-key board, then every key and combo the file draws. */
async function makeByHand(page: Page): Promise<void> {
  await page.goto(`/library?${SETTINGS}`);
  await page.getByRole('button', { name: 'New layout', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'New layout name', exact: true })
    .fill('Magic Romak by hand');
  await page
    .getByRole('combobox', { name: 'New layout board', exact: true })
    .selectOption('1333+2');
  await page.getByRole('button', { name: 'Create and edit' }).click();
  await expect(page).toHaveURL(/\/analyze\?/);
  await expect(board(page).getByRole('button', { name: /^Key LTR:/ })).toBeVisible();

  // The layers first: a key can only reach a layer that is there.
  await openTab(page, 'Layers');
  const first = page.getByRole('textbox', { name: 'Name of layer Base', exact: true });
  await first.fill(LAYERS[0][1]);
  await first.press('Enter');
  for (const [, name] of LAYERS.slice(1)) {
    await page.getByRole('textbox', { name: 'New layer name', exact: true }).fill(name);
    await page.getByRole('button', { name: 'Add layer', exact: true }).click();
  }

  await openTab(page, 'Board');
  const layers = [
    { text: ALPHA_1, mods: HOME_MODS },
    { text: ALPHA_2 },
    { text: C_EXTENSION },
    { text: NUMBERS },
    { text: SYMBOLS },
  ];
  for (const [index, { text, mods = {} }] of layers.entries()) {
    await showLayer(page, index);
    for (const [id, typed] of Object.entries(text)) await typeOnKey(page, id, typed);
    for (const [id, how] of Object.entries(mods)) await typeHomeMod(page, id, how);
    if (index === 0) await typeAlpha2OverSymbols(page, 'R0');
  }

  await openTab(page, 'Combos');
  for (const combo of COMBOS) await addCombo(page, combo);
}

// ------------------------------------------------------------------ comparing

type Binding = { kind: string; [field: string]: unknown };
type Doc = {
  layers: { id: string; name?: string; bindings: Record<string, Binding> }[];
  combos?: { keys: string[]; binding: Binding; layers?: string[]; [field: string]: unknown }[];
  [field: string]: unknown;
};

/**
 * A layout document as what the author chose: layers by their place instead of their id, every key
 * listed with what an unlisted one does, combos by their keys and layers. Ids and names are what
 * saving and typing give; the rest is compared as it is.
 */
function essence(json: string) {
  const doc = JSON.parse(json) as Doc;
  const place = new Map(doc.layers.map((layer, i) => [layer.id, `layer ${i}`]));
  const placed = <T>(value: T): T =>
    JSON.parse(
      JSON.stringify(value, (key, v) => {
        if (key === 'layer' && typeof v === 'string') return place.get(v) ?? v;
        if (key === 'layers' && Array.isArray(v) && v.every((x) => typeof x === 'string')) {
          return v.map((x) => place.get(x) ?? x);
        }
        return v;
      }),
    );
  const layers = doc.layers.map((layer, i) => {
    const bindings = placed(layer.bindings);
    const unlisted = bindings['*'] ?? { kind: i === 0 ? 'none' : 'trans' };
    return {
      name: layer.name,
      keys: Object.fromEntries(KEY_IDS.map((id) => [id, bindings[id] ?? unlisted])),
    };
  });
  const combos = placed(doc.combos ?? [])
    .map(({ id: _id, ...combo }) => ({ ...combo, keys: [...combo.keys].sort() }))
    .sort((a, b) =>
      JSON.stringify([a.keys, a.layers]).localeCompare(JSON.stringify([b.keys, b.layers])),
    );
  const { id: _id, name: _name, layers: _layers, combos: _combos, ...rest } = doc;
  return { rest, layers, combos };
}

/** What differs, one line each: the layer and key, or the combo, and what each way made. */
function differences(imported: string, byHand: string): string[] {
  const a = essence(imported);
  const b = essence(byHand);
  const out: string[] = [];
  const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  if (!same(a.rest, b.rest)) {
    out.push(`layout: import=${JSON.stringify(a.rest)} by hand=${JSON.stringify(b.rest)}`);
  }
  if (a.layers.length !== b.layers.length) {
    out.push(`layers: import=${a.layers.length} by hand=${b.layers.length}`);
  }
  a.layers.forEach((layer, i) => {
    const other = b.layers[i];
    if (!other) return;
    if (layer.name !== other.name) out.push(`layer ${i} name: ${layer.name} / ${other.name}`);
    for (const id of KEY_IDS) {
      if (!same(layer.keys[id], other.keys[id])) {
        out.push(
          `${layer.name}/${id}: import=${JSON.stringify(layer.keys[id])} by hand=${JSON.stringify(other.keys[id])}`,
        );
      }
    }
  });
  const label = (c: (typeof a.combos)[number]) => JSON.stringify(c);
  const seen = new Set(b.combos.map(label));
  for (const combo of a.combos) {
    if (!seen.has(label(combo))) out.push(`combo only in the import: ${label(combo)}`);
  }
  const imports = new Set(a.combos.map(label));
  for (const combo of b.combos) {
    if (!imports.has(label(combo))) out.push(`combo only by hand: ${label(combo)}`);
  }
  return out;
}

test('Magic Romak imported from the keymap-drawer file is the one made by hand from what it draws', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'a long edit, at a desk');
  test.setTimeout(15 * 60_000);

  await importFile(page);
  const imported = await exported(page);
  const importedNumbers = await summary(page);

  await makeByHand(page);
  const byHand = await exported(page);
  const byHandNumbers = await summary(page);

  expect(differences(imported, byHand), 'what the import and the editor made differently').toEqual(
    [],
  );
  // Analyzed the same, on the same text.
  expect(byHandNumbers).toEqual(importedNumbers);
});
