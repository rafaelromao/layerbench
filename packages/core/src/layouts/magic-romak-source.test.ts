import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  boardFromPreset,
  type ImportReport,
  importKeymapDrawer,
  readKeymapDrawer,
} from '../import/keymap-drawer.js';
import { applyEdit } from '../layout/edit.js';
import type { Binding, ComboDef, Layout } from '../layout/types.js';
import { bundledLayout } from './index.js';
import type { KeymapSource } from './keymap-source.js';

/*
 * Magic Romak's letters, layers and combos are what the importer reads from the keymap-drawer file
 * its author keeps for his keymap, `packages/core/fixtures/romak-keymap-drawer.yaml`, copied from
 * github.com/rafaelromao/keyboards. `keymaps/magic-romak.json` is that reading, written by
 * `pnpm keymap`; this test keeps it what the importer makes of the file.
 */

const FIXTURE = new URL('../../fixtures/romak-keymap-drawer.yaml', import.meta.url);
const SOURCE = new URL('./keymaps/magic-romak.json', import.meta.url);
const WRITE = process.env.KEYMAP === '1';

const ORIGIN = {
  repository: 'rafaelromao/keyboards',
  path: 'docs/img/diagrams/keymap-drawer/keymap-drawer.yaml',
  commit: 'b5fd65d45fae51d6d52aca13e1391b7c6aba1178',
};

/** The layers Magic Romak takes, by their name in the file, with the name and id each has here. */
const LAYERS = [
  { source: 'alpha1', name: 'Alpha 1', id: 'alpha1' },
  { source: 'alpha2', name: 'Alpha 2', id: 'alpha2' },
  { source: 'ç-extension', name: 'Ç extension', id: 'ccedil' },
  { source: 'numbers', name: 'Numbers', id: 'num' },
  { source: 'symbols', name: 'Symbols', id: 'sym' },
] as const;

/** The file imported as the Import dialog does, onto the 24-key board, its layers' ids set. */
function importFixture(): { layout: Layout; report: ImportReport; source: KeymapSource } {
  const doc = readKeymapDrawer(readFileSync(FIXTURE, 'utf8'));
  const { layout, report } = importKeymapDrawer(doc, {
    name: 'Magic Romak',
    layers: LAYERS.map(({ source, name }) => ({ source, name })),
    board: boardFromPreset('1333+2', 24),
  });
  let renamed = layout;
  LAYERS.forEach(({ id }, i) => {
    const outcome = applyEdit(renamed, { kind: 'setLayerId', layer: renamed.layers[i].id, id });
    if (outcome.status === 'refused') throw new Error(outcome.message);
    if (outcome.status === 'landed') renamed = outcome.layout;
  });
  return {
    layout: renamed,
    report,
    source: {
      source: ORIGIN,
      layers: renamed.layers.map(({ id, name, bindings }) => ({ id, name: name ?? id, bindings })),
      combos: renamed.combos ?? [],
    },
  };
}

describe.skipIf(!WRITE)('Magic Romak keymap source (KEYMAP=1)', () => {
  it('writes keymaps/magic-romak.json', () => {
    writeFileSync(SOURCE, `${JSON.stringify(importFixture().source, null, 2)}\n`);
  });
});

describe.skipIf(WRITE)('Magic Romak keymap source', () => {
  it('is what the importer makes of the file, as `pnpm keymap` writes it', () => {
    const written = JSON.parse(readFileSync(SOURCE, 'utf8'));
    expect(written, 'run `pnpm keymap` to write what the importer makes of the fixture').toEqual(
      JSON.parse(JSON.stringify(importFixture().source)),
    );
  });

  it('is a copy of the file as the keyboards repository has it at that commit', () => {
    expect(readFileSync(FIXTURE, 'utf8')).toContain(`commit ${ORIGIN.commit}`);
  });
});

/**
 * What Magic Romak has that the file cannot say, by layer and key: keymap-drawer has no field for an
 * adaptive key's branches, a sentence space or morph, caps word's shift, or a macro's tag.
 */
const ADD_ONS: Record<string, string[]> = {
  // `h` under its Gui hold becomes the adaptive h/v; the thumbs are the alt repeat, the sentence
  // space that holds Numbers, the sentence morph of Alpha 2 that holds Symbols, and the shift key
  // that is caps word when shift is on.
  alpha1: ['RBI', 'L1', 'L0', 'R0', 'R1'],
  // `qu` is a macro the file draws as text, `v` is the adaptive v/h, and the accents are macros
  // that tag the press, which the alt repeat follows.
  alpha2: ['LTM', 'LBI', 'RTI', 'RHI', 'RBI', 'RTM', 'RHM', 'RBM', 'RTR', 'RHR', 'RBR', 'RHP'],
  ccedil: [],
  num: [],
  sym: [],
};

/**
 * The combos that differ in more than their name and timeout, by their keys and layer: `?` and `!`
 * are held for `¿` and `¡`, `º` for `ª`, and the accent combo tags the press.
 */
const COMBO_ADD_ONS = ['RHI RHM alpha2', 'RBI RBM alpha2', 'RHM RHR alpha2', 'RHI RHM RHR num'];

describe.skipIf(WRITE)('Magic Romak, built on that source', () => {
  const magicRomak = bundledLayout('magic-romak') as Layout;
  const source = JSON.parse(readFileSync(SOURCE, 'utf8')) as KeymapSource;
  const same = (a: Binding | undefined, b: Binding | undefined) =>
    JSON.stringify(a) === JSON.stringify(b);

  it("has the file's layers, in its order, with the same names and ids", () => {
    expect(magicRomak.layers.map((l) => [l.id, l.name])).toEqual(
      source.layers.map((l) => [l.id, l.name]),
    );
  });

  it('differs from the import in the keys keymap-drawer has no field for, and no others', () => {
    const differing = Object.fromEntries(
      source.layers.map((layer) => {
        const bundled = magicRomak.layers.find((l) => l.id === layer.id)?.bindings ?? {};
        const ids = new Set([...Object.keys(layer.bindings), ...Object.keys(bundled)]);
        return [layer.id, [...ids].filter((id) => !same(layer.bindings[id], bundled[id]))];
      }),
    );
    for (const list of Object.values(differing)) list.sort();
    expect(differing).toEqual(
      Object.fromEntries(Object.entries(ADD_ONS).map(([id, keys]) => [id, [...keys].sort()])),
    );
  });

  const label = (c: ComboDef) => `${[...c.keys].sort().join(' ')} ${c.layers?.join(',')}`;

  it("has the file's combos on the same keys and layers, with the keymap's timeout", () => {
    expect((magicRomak.combos ?? []).map(label).sort()).toEqual(source.combos.map(label).sort());
    expect((magicRomak.combos ?? []).every((c) => c.timeoutMs === 30)).toBe(true);
    // Each has an id of its own: the keymap's name where it has one, the importer's where not.
    expect(new Set((magicRomak.combos ?? []).map((c) => c.id)).size).toBe(source.combos.length);
  });

  it("differs from the file's combos in their bindings only where the keymap has a hold or a tag", () => {
    const differing = (magicRomak.combos ?? [])
      .filter((c) => {
        const from = source.combos.find((s) => label(s) === label(c));
        return !same(from?.binding, c.binding);
      })
      .map(label);
    expect(differing.sort()).toEqual([...COMBO_ADD_ONS].sort());
  });
});

describe.skipIf(WRITE)('the importer on the keymap file', () => {
  const { layout, report } = importFixture();
  const layer = (id: string) => layout.layers.find((l) => l.id === id)?.bindings ?? {};

  it('reads the home row mods the file draws with glyphs, Gui with Shift on its bottom keys', () => {
    const held = (id: string) => {
      const b = layer('alpha1')[id];
      return b?.kind === 'hold_tap' && b.hold.kind === 'mod'
        ? [b.hold.mod, ...(b.hold.also ?? [])].join('+')
        : undefined;
    };
    expect(['LHR', 'LHM', 'LHI', 'RHI', 'RHM', 'RHR'].map(held)).toEqual([
      'LCTRL',
      'LALT',
      'LSHIFT',
      'LSHIFT',
      'LALT',
      'LCTRL',
    ]);
    expect(['LBR', 'LBM', 'LBI', 'RBI'].map(held)).toEqual([
      'LGUI+LSHIFT',
      'LGUI+LSHIFT',
      'LGUI',
      'LGUI',
    ]);
  });

  it('reads the thumbs: repeat, a space holding Numbers, Alpha 2 over Symbols, a one-shot Shift', () => {
    expect(layer('alpha1').L1).toEqual({ kind: 'key_repeat' });
    expect(layer('alpha1').L0).toEqual({
      kind: 'lt',
      layer: 'num',
      tap: { kind: 'kp', symbol: ' ' },
    });
    expect(layer('alpha1').R0).toEqual({
      kind: 'lt',
      layer: 'sym',
      tap: { kind: 'sl', layer: 'alpha2' },
    });
    expect(layer('alpha1').R1).toEqual({ kind: 'sk', mod: 'LSHIFT' });
    expect(layer('alpha2').LBM).toEqual({
      kind: 'macro',
      symbols: '\u00e7',
      then: [{ kind: 'sl', layer: 'ccedil' }],
    });
  });

  it('lists what it could not read in full, which the keymap has behaviours for', () => {
    expect(report.layers.map((l) => [l.name, l.unread])).toEqual([
      ['Alpha 1', ['h|v']],
      ['Alpha 2', ['qu', 'v|h']],
      ['\u00c7 extension', []],
      ['Numbers', []],
      ['Symbols', ['0']],
    ]);
  });

  it('takes the dead keys and the letters on chords, and leaves the pictures of keys beside a thumb', () => {
    const combos = layout.combos ?? [];
    const dead = combos.filter((c) => c.binding.kind === 'dead_key');
    expect(dead.map((c) => (c.binding.kind === 'dead_key' ? c.binding.diacritic : ''))).toEqual([
      '\u00a8',
      '^',
      '\u00b4',
      '`',
      '~',
    ]);
    const letters = combos.filter((c) => c.layers?.join() === 'alpha1' && c.binding.kind === 'kp');
    expect(letters.map((c) => (c.binding.kind === 'kp' ? c.binding.symbol : '')).sort()).toEqual([
      'j',
      'k',
      'q',
      'v',
      'w',
      'x',
      'y',
      'z',
    ]);
    // `1` drawn beside the thumb that holds Numbers is the key `1`, not a chord with the thumb.
    expect(combos.some((c) => c.keys.some((k) => /^[LR][01]$/.test(k)))).toBe(false);
    expect(report.combos.skipped).toContain("1: a key drawn beside its layer's key, not a chord");
  });
});
