import { describe, expect, it } from 'vitest';
import { getGeometryPreset } from '../geometry/presets.js';
import { compileLayout } from '../layout/compile.js';
import { toCanonicalJson } from '../layout/json.js';
import { safeParseLayout } from '../layout/schema.js';
import type { Binding, Layout } from '../layout/types.js';
import { bundledLayout } from '../layouts/index.js';
import { reachKeys } from '../sim/activators.js';
import {
  boardFromKeys,
  boardFromPreset,
  colsThumbsNotation,
  cptKeys,
  exportKeymapDrawer,
  importKeymapDrawer,
  type KdKey,
  KeymapDrawerError,
  MAX_KEYS,
  orthoKeys,
  presetOrder,
  presetsWithKeys,
  readKeymapDrawer,
  readLegend,
} from './keymap-drawer.js';
import { HUMMINGBIRD } from './yaml.test.js';

const magicRomak = bundledLayout('magic-romak')!;

const key = (spec: Partial<KdKey>): KdKey => ({
  tap: '',
  hold: '',
  shifted: '',
  left: '',
  right: '',
  tl: '',
  tr: '',
  bl: '',
  br: '',
  type: '',
  ...spec,
});

describe('reading a keymap-drawer file', () => {
  it('reads the layers flat, whether they were written flat or in rows', () => {
    const doc = readKeymapDrawer(HUMMINGBIRD);
    expect(doc.layout).toEqual({ kind: 'named', source: 'qmk_keyboard', name: 'rufous' });
    expect(doc.layers.map((l) => [l.name, l.keys.length])).toEqual([
      ['Def', 30],
      ['Nav', 30],
      ['Sym', 30],
      ['Num', 30],
    ]);
    expect(doc.layers[0].keys[26]).toMatchObject({ tap: 'Nav', hold: 'sticky' });
    expect(doc.combos[0]).toMatchObject({ positions: [1, 2], layers: ['Def'] });
    expect(doc.combos[0].key.tap).toBe('V');
  });

  it('says so when the text is not a keymap-drawer file', () => {
    expect(() => readKeymapDrawer('just: text')).toThrow(/no `layers`/);
    expect(() => readKeymapDrawer('layout: {cols_thumbs_notation: x}\nlayers: {}')).toThrow(
      /no layers/,
    );
  });
});

describe('boards', () => {
  it('lays out cols+thumbs notation in keymap-drawer order and finds the preset it is', () => {
    const keys = cptKeys('33333+2 2+33333');
    expect(keys).toHaveLength(34);
    const board = boardFromKeys(keys, 'test');
    expect(board.geometry).toEqual({ preset: '3x5+2' });
    expect(board.ids).toEqual(presetOrder('3x5+2'));
  });

  it('reads the Hummingbird both ways keymap-drawer can write it, onto its preset', () => {
    const cpt = boardFromKeys(cptKeys('23332+2> 2<+23332'), 'Hummingbird');
    const ortho = boardFromKeys(
      orthoKeys({
        split: true,
        rows: 3,
        columns: 5,
        thumbs: 2,
        dropPinky: true,
        dropInner: true,
      }),
      'Hummingbird',
    );
    expect(cpt.geometry).toEqual({ preset: '23332+2' });
    expect(ortho.ids).toEqual(cpt.ids);
    // keymap-drawer lists a short column's keys with the top two rows, wherever the board puts
    // them: the inner column's upper key is the preset's inner home key.
    expect(cpt.ids.slice(0, 10)).toEqual([
      'LTP',
      'LTR',
      'LTM',
      'LTI',
      'LHC',
      'RHC',
      'RTI',
      'RTM',
      'RTR',
      'RTP',
    ]);
    expect(cpt.ids.slice(10, 20)).toEqual([
      'LHP',
      'LHR',
      'LHM',
      'LHI',
      'LBC',
      'RBC',
      'RHI',
      'RHM',
      'RHR',
      'RHP',
    ]);
    expect(cpt.ids.slice(20, 26)).toEqual(['LBR', 'LBM', 'LBI', 'RBI', 'RBM', 'RBR']);
    expect(cpt.ids.slice(26)).toEqual(['L1', 'L0', 'R0', 'R1']);
    // A file that only names the keyboard lands the same way.
    expect(boardFromPreset('23332+2', 30).ids).toEqual(cpt.ids);
  });

  it('draws a board of its own when no preset has its shape', () => {
    const board = boardFromKeys(cptKeys('3333+2 2+3333'), 'four columns');
    expect('custom' in board.geometry).toBe(true);
    expect(board.ids.slice(0, 4)).toEqual(['LTP', 'LTR', 'LTM', 'LTI']);
    expect(board.description).toMatch(/a board of its own, 28 keys/);
  });

  it('keeps what fits of a taller board and says how much did not', () => {
    const board = boardFromKeys(cptKeys('444444+3 3+444444'), 'with a number row');
    expect(board.ids.filter((id) => id === null)).toHaveLength(12);
    expect(board.geometry).toEqual({ preset: '3x6+3' });
    expect(board.description).toMatch(/12 keys the model has no place for/);
  });

  it('offers the presets a named keyboard could be, by its number of keys', () => {
    expect(presetsWithKeys(34)).toEqual(['3x5+2']);
    expect(presetsWithKeys(42)).toEqual(['3x6+3']);
    const board = boardFromPreset('3x5+2', 36);
    expect(board.ids.slice(34)).toEqual([null, null]);
    expect(board.description).toMatch(/last 2 positions/);
  });

  it('writes a columnar board back in cols+thumbs notation', () => {
    const notation = (id: string) => {
      const g = getGeometryPreset(id);
      return colsThumbsNotation(g.keys, g.family);
    };
    expect(notation('3x5+2')).toBe('33333+2 2+33333');
    expect(notation('1333+2')).toBe('1333+2 2+3331');
    expect(notation('23332+2')).toBe('2^3332v+2 2+2v3332^');
    expect(notation('ansi')).toBeNull();
    // And reading the notation back gives the same board.
    const columnar = ['3x5+2', '3x6+3', '1333+2', '1222+2', '23332+2', '23332+1', '13332+2'];
    for (const id of [...columnar, '13332+1', '13331+2']) {
      expect(boardFromKeys(cptKeys(notation(id) as string), id).geometry).toEqual({ preset: id });
    }
  });
});

describe('legends', () => {
  const ctx = {
    layers: new Map<string, string | null>([
      ['nav', 'nav'],
      ['sym', 'sym'],
      ['num', null],
    ]),
  };
  const read = (spec: Partial<KdKey>) => {
    const r = readLegend(key(spec), ctx);
    return r.kind === 'transparent' ? 'transparent' : r.binding;
  };

  it('reads letters, keycodes and symbols as what they type', () => {
    expect(read({ tap: 'W' })).toEqual({ kind: 'kp', symbol: 'w' });
    expect(read({ tap: 'SQT' })).toEqual({ kind: 'kp', symbol: "'", shifted: '"' });
    expect(read({ tap: 'SPACE' })).toEqual({ kind: 'kp', symbol: ' ' });
    expect(read({ tap: 'KC_COMM' })).toEqual({ kind: 'kp', symbol: ',', shifted: '<' });
    expect(read({ tap: 'N1' })).toEqual({ kind: 'kp', symbol: '1', shifted: '!' });
    expect(read({ tap: ',', shifted: ';' })).toEqual({ kind: 'kp', symbol: ',', shifted: ';' });
    expect(read({ tap: 'ão' })).toEqual({ kind: 'macro', symbols: 'ão' });
  });

  it('reads layer keys by the name they show, and how the layer comes on', () => {
    expect(read({ tap: 'Nav' })).toEqual({ kind: 'mo', layer: 'nav' });
    expect(read({ tap: 'Nav', hold: 'sticky' })).toEqual({ kind: 'sl', layer: 'nav' });
    expect(read({ tap: 'SYM', hold: 'toggle' })).toEqual({ kind: 'tog', layer: 'sym' });
    expect(read({ tap: 'SPACE', hold: 'Nav' })).toEqual({
      kind: 'lt',
      layer: 'nav',
      tap: { kind: 'kp', symbol: ' ' },
    });
  });

  it('reads modifiers, held and one-shot, and a home-row mod', () => {
    expect(read({ tap: 'LSHFT' })).toEqual({ kind: 'mod', mod: 'LSHIFT' });
    expect(read({ tap: 'LGUI', hold: 'sticky' })).toEqual({ kind: 'sk', mod: 'LGUI' });
    expect(read({ tap: 'A', hold: 'LCTRL' })).toEqual({
      kind: 'hold_tap',
      tap: { kind: 'kp', symbol: 'a' },
      hold: { kind: 'mod', mod: 'LCTRL' },
    });
    expect(read({ tap: '⇧' })).toEqual({ kind: 'mod', mod: 'LSHIFT' });
  });

  it('knows empty, transparent, held, caps word and repeat', () => {
    expect(read({})).toEqual({ kind: 'none' });
    expect(read({ tap: '▽', type: 'trans' })).toBe('transparent');
    expect(read({ type: 'held' })).toBe('transparent');
    expect(read({ tap: 'CAPS_WORD' })).toEqual({ kind: 'caps_word' });
    expect(read({ tap: 'REPEAT' })).toEqual({ kind: 'key_repeat' });
  });

  it('reads keys that type no text as transparent, and keeps the hold on one, tapping nothing', () => {
    for (const tap of ['LC(Z)', 'PG UP', 'F1', 'ESC', 'KC_BSPC', '⌫']) {
      expect(readLegend(key({ tap }), ctx)).toEqual({
        kind: 'binding',
        binding: { kind: 'trans' },
        exact: true,
      });
    }
    // Holding it still reaches the layer, whatever the tap does.
    expect(read({ tap: 'BSPC', hold: 'Nav' })).toEqual({
      kind: 'lt',
      layer: 'nav',
      tap: { kind: 'none' },
    });
    expect(read({ tap: 'ESC', hold: 'LCTRL' })).toEqual({
      kind: 'hold_tap',
      tap: { kind: 'none' },
      hold: { kind: 'mod', mod: 'LCTRL' },
    });
  });

  it('makes what it cannot read transparent, and reports it', () => {
    const unread = (spec: Partial<KdKey>) => readLegend(key(spec), ctx);
    expect(unread({ tap: 'BT_CLR' })).toEqual({
      kind: 'binding',
      binding: { kind: 'trans' },
      exact: false,
    });
    // A hold it cannot read under a layer left out is reported too, the key transparent.
    expect(unread({ tap: 'Num', hold: 'BT_CLR' })).toEqual({
      kind: 'binding',
      binding: { kind: 'trans' },
      exact: false,
    });
    // A hold it knows over a tap it does not: the hold is kept, and the key is still reported.
    expect(unread({ tap: 'BT 0', hold: 'Nav' })).toEqual({
      kind: 'binding',
      binding: { kind: 'lt', layer: 'nav', tap: { kind: 'none' } },
      exact: false,
    });
    // A hold it does not know goes, a tap it reads staying.
    expect(unread({ tap: 'A', hold: 'BT_CLR' })).toEqual({
      kind: 'binding',
      binding: { kind: 'kp', symbol: 'a' },
      exact: false,
    });
  });

  it('names a layer left out nowhere, keeping what else the key does', () => {
    const trans = { kind: 'binding', binding: { kind: 'trans' }, exact: true };
    const reading = (spec: Partial<KdKey>) => readLegend(key(spec), ctx);
    expect(reading({ tap: 'Num' })).toEqual(trans);
    expect(reading({ tap: 'Num', hold: 'sticky' })).toEqual(trans);
    expect(reading({ tap: 'Num', hold: 'toggle' })).toEqual(trans);
    expect(reading({ tap: 'ESC', hold: 'Num' })).toEqual(trans);
    expect(reading({ tap: '', hold: 'Num' })).toEqual(trans);
    expect(read({ tap: 'SPACE', hold: 'Num' })).toEqual({ kind: 'kp', symbol: ' ' });
    expect(read({ tap: 'A', hold: 'Num' })).toEqual({ kind: 'kp', symbol: 'a' });
    expect(read({ tap: 'LSHFT', hold: 'Num' })).toEqual({ kind: 'mod', mod: 'LSHIFT' });
    expect(read({ tap: 'ão', hold: 'Num' })).toEqual({ kind: 'macro', symbols: 'ão' });
    expect(read({ tap: 'Nav', hold: 'Num' })).toEqual({ kind: 'mo', layer: 'nav' });
    // A hold of its own over a tap reaching a layer left out stays, tapping nothing.
    expect(read({ tap: 'Num', hold: 'Nav' })).toEqual({
      kind: 'lt',
      layer: 'nav',
      tap: { kind: 'none' },
    });
    expect(read({ tap: 'Num', hold: 'LCTRL' })).toEqual({
      kind: 'hold_tap',
      tap: { kind: 'none' },
      hold: { kind: 'mod', mod: 'LCTRL' },
    });
    // A layer with no name, left out, is not what an empty legend names.
    const unnamed = {
      layers: new Map<string, string | null>([
        ['', null],
        ['num', null],
      ]),
    };
    expect(readLegend(key({ tap: 'A', hold: 'Num' }), unnamed)).toEqual({
      kind: 'binding',
      binding: { kind: 'kp', symbol: 'a' },
      exact: true,
    });
  });
});

describe('importing', () => {
  const doc = readKeymapDrawer(HUMMINGBIRD);
  const board = boardFromKeys(cptKeys('23332+2> 2<+23332'), 'Hummingbird');

  it('builds a layout that compiles and survives the schema, from the layers chosen', () => {
    const { layout, report } = importKeymapDrawer(doc, {
      name: 'Hummingbird',
      layers: [
        { source: 'Def', name: 'Base' },
        { source: 'Nav', name: 'Nav' },
        { source: 'Sym', name: 'Symbols' },
      ],
      board,
    });
    expect(() => compileLayout(layout)).not.toThrow();
    expect(safeParseLayout(toCanonicalJson(layout)).ok).toBe(true);
    expect(layout.layers.map((l) => [l.id, l.name])).toEqual([
      ['base', 'Base'],
      ['nav', 'Nav'],
      ['symbols', 'Symbols'],
    ]);

    const [base, nav, sym] = layout.layers.map((l) => l.bindings);
    expect(base.LTP).toEqual({ kind: 'kp', symbol: 'w' });
    expect(base.L1).toEqual({ kind: 'sl', layer: 'nav' });
    expect(base.L0).toEqual({ kind: 'kp', symbol: ' ' });
    expect(base.R0).toEqual({ kind: 'sk', mod: 'LSHIFT' });
    // The file's layer names still reach a layer that was renamed on the way in.
    expect(base.R1).toEqual({ kind: 'sl', layer: 'symbols' });
    expect(layout.keys).toEqual({ space: 'L0', shift: { key: 'R0', kind: 'sk' } });

    expect(nav.LHP).toEqual({ kind: 'sk', mod: 'LGUI' });
    // A key the analysis does not simulate (F1) is left unset, as on a layer added in the
    // editor: it falls through. So does the key held to reach the layer.
    expect(nav.LTP).toBeUndefined();
    expect(nav.L1).toBeUndefined();
    expect(nav['*']).toEqual({ kind: 'trans' });
    expect(sym.LTP).toEqual({ kind: 'kp', symbol: '!' });

    expect(report.layers[0]).toEqual({ name: 'Base', keys: 30, read: 30, unread: [] });
    // Function keys, arrows and shortcuts type no text, but they are read, not left unread.
    expect(report.layers[1]).toEqual({ name: 'Nav', keys: 30, read: 30, unread: [] });
  });

  // An id is never made up at random, so importing the same file twice gives the same layout.
  it('gives each layer an unused id, and one whose name has nothing to spell it `layer`', () => {
    const { layout } = importKeymapDrawer(doc, {
      name: 'Hummingbird',
      layers: [
        { source: 'Def', name: 'Base' },
        { source: 'Nav', name: '数字' },
        { source: 'Sym', name: '記号' },
      ],
      board,
    });
    expect(layout.layers.map((l) => l.id)).toEqual(['base', 'layer', 'layer-2']);
    expect(() => compileLayout(layout)).not.toThrow();
  });

  it('takes the combos on the layers chosen, as the editor adds one, and says which it left', () => {
    const { layout, report } = importKeymapDrawer(doc, {
      name: 'Hummingbird',
      layers: [{ source: 'Def', name: 'Def' }],
      board,
    });
    const v = layout.combos?.find((c) => c.binding.kind === 'kp' && c.binding.symbol === 'v');
    expect(v).toEqual({
      id: 'ltr-ltm',
      keys: ['LTR', 'LTM'],
      binding: { kind: 'kp', symbol: 'v' },
      layers: ['def'],
      role: 'typing',
      timeoutMs: 50,
      slowRelease: false,
    });
    // Escape is not simulated, and a combo cannot be transparent.
    expect(layout.combos?.some((c) => c.binding.kind === 'trans')).toBe(false);
    expect(report.combos.skipped).toContain('ESC: does nothing the analysis simulates');
    expect(report.combos.taken).toBe(layout.combos?.length);
  });

  it('makes the keys reaching a layer left out transparent, skips such combos, and says so', () => {
    const toNav = { positions: [0, 1], triggers: null, key: key({ tap: 'Nav' }), layers: [] };
    const onNav = { positions: [0, 1], triggers: null, key: key({ tap: 'Sym' }), layers: ['Nav'] };
    const { layout, report } = importKeymapDrawer(
      { ...doc, combos: [...doc.combos, toNav, onNav] },
      { name: 'Hummingbird', layers: [{ source: 'Def', name: 'Def' }], board },
    );
    const base = layout.layers[0].bindings;
    // The one-shot Nav and Symbols thumbs, their layers left out.
    expect([base.L1, base.R1]).toEqual([{ kind: 'trans' }, { kind: 'trans' }]);
    expect(report.combos.skipped).toContain(
      'A combo reaching a layer left out: does nothing the analysis simulates',
    );
    expect(report.combos.skipped).toContain(
      'A combo reaching a layer left out: only on layers left out',
    );
    expect(report.notes).toContain(
      '2 keys reached a layer left out: the reach is dropped, and a key left with nothing to do is transparent.',
    );
    // Nor is the name of a layer left out kept anywhere in the layout or the report.
    expect(JSON.stringify(layout)).not.toMatch(/"(Nav|Sym)"/);
    expect(report.combos.skipped.join()).not.toMatch(/Nav|Sym/);
  });

  it('lists the part of a key it could not read, never a layer left out', () => {
    const [def, ...others] = doc.layers;
    const keys = [
      key({ tap: 'Nav', hold: 'tri' }),
      key({ tap: 'A', hold: 'BT_CLR' }),
      key({ tap: 'BT 0' }),
      // A one-shot of a letter cannot be made: the letter is what was not read, not `sticky`.
      key({ tap: 'A', hold: 'sticky' }),
      ...def.keys.slice(4),
    ];
    const { report } = importKeymapDrawer(
      { ...doc, layers: [{ ...def, keys }, ...others] },
      { name: 'Hummingbird', layers: [{ source: 'Def', name: 'Def' }], board },
    );
    expect(report.layers[0].unread).toEqual(['tri', 'BT_CLR', 'BT 0', 'A']);
  });

  it('leaves unset what a key made in the editor would leave unset, and describes nothing', () => {
    const { layout } = importKeymapDrawer(doc, {
      name: 'Hummingbird',
      layers: [
        { source: 'Def', name: 'Base' },
        { source: 'Nav', name: 'Nav' },
      ],
      board,
    });
    // A base layer made in the editor lists no key that does nothing; an upper one no key that
    // falls through.
    expect(Object.values(layout.layers[0].bindings).some((b) => b.kind === 'none')).toBe(false);
    expect(
      Object.entries(layout.layers[1].bindings).some(([id, b]) => id !== '*' && b.kind === 'trans'),
    ).toBe(false);
    expect(layout.description).toBeUndefined();
  });
});

describe('writing a file', () => {
  function write(layout: Layout): string {
    const compiled = compileLayout(layout);
    const reach = compiled.layers.map(
      (l) => new Set(reachKeys(compiled, l.idx).map((k) => compiled.keys[k.pos].id)),
    );
    return exportKeymapDrawer(
      layout,
      { keys: compiled.keys, family: compiled.geometry.family },
      (li, id) => compiled.layers[li].bindings[compiled.keyIndex.get(id) as number],
      (li, id) => reach[li].has(id),
    );
  }

  it('writes a key a layer leaves doing nothing as empty, not transparent, and reads it back so', () => {
    // Magic Romak's Symbols lists its symbols and leaves every other key doing nothing ('*': none).
    const before = compileLayout(magicRomak);
    const after = compileLayout(roundTrip(magicRomak));
    const SYM = 4;
    expect(after.layers[SYM].name).toBe('Symbols');
    const kinds = (c: typeof before) =>
      Object.fromEntries(c.keys.map((k, pos) => [k.id, c.layers[SYM].bindings[pos].kind]));
    const was = kinds(before);
    const now = kinds(after);
    const nothing = Object.keys(was).filter((id) => was[id] === 'none');
    expect(nothing).toContain('R0');
    for (const id of nothing) expect(now[id], id).toBe('none');
    // A layer whose unlisted keys show through still writes them as transparent.
    const NUM = 3;
    for (const [pos, b] of before.layers[NUM].bindings.entries()) {
      if (b.kind === 'trans') expect(after.layers[NUM].bindings[pos].kind).toBe('trans');
    }
  });

  it('marks the keys that reach a layer held there, where they are transparent', () => {
    const held = (layout: Layout) =>
      readKeymapDrawer(write(layout)).layers.map(
        (l) => `${l.name}: ${l.keys.filter((k) => k.type === 'held').length}`,
      );
    // Numbers is held from L0, transparent there; Symbols' R0 does nothing there, and stays so.
    // Alpha 2 shows R0, the key that reaches it.
    expect(held(magicRomak)).toEqual([
      'Alpha 1: 0',
      'Alpha 2: 1',
      'Ç extension: 1',
      'Numbers: 1',
      'Symbols: 0',
    ]);
    const nav: Layout = {
      format: 'layerbench/layout@1',
      name: 'Held',
      hostLocale: 'symbols',
      geometry: { preset: '3x5+2' },
      keys: { space: 'L0' },
      layers: [
        {
          id: 'base',
          name: 'Base',
          bindings: {
            L1: { kind: 'sl', layer: 'nav' },
            R0: { kind: 'mo', layer: 'nav' },
            LHR: { kind: 'lt', layer: 'nav', tap: { kind: 'kp', symbol: 's' } },
          },
        },
        {
          id: 'nav',
          name: 'Nav',
          bindings: { '*': { kind: 'trans' }, LHR: { kind: 'kp', symbol: '-' } },
        },
      ],
    };
    expect(held(nav)).toEqual(['Base: 0', 'Nav: 2']);
    // Read back, a key marked held is transparent, as it was; one with a binding keeps it.
    const back = roundTrip(nav);
    expect(back.layers[1].bindings.L1).toBeUndefined();
    expect(back.layers[1].bindings.R0).toBeUndefined();
    expect(back.layers[1].bindings.LHR).toEqual({ kind: 'kp', symbol: '-' });
  });

  function roundTrip(layout: Layout): Layout {
    const doc = readKeymapDrawer(write(layout));
    if (doc.layout.kind !== 'cpt') throw new Error('expected cols+thumbs notation');
    const board = boardFromKeys(cptKeys(doc.layout.spec), layout.name);
    return importKeymapDrawer(doc, {
      name: layout.name,
      layers: doc.layers.map((l) => ({ source: l.name, name: l.name })),
      board,
    }).layout;
  }

  it('reads back what it wrote, for a plain layout', () => {
    const qwerty = bundledLayout('qwerty') as Layout;
    const back = roundTrip(qwerty);
    expect(back.geometry).toEqual({ preset: '3x5+2' });
    for (const [id, b] of Object.entries(qwerty.layers[0].bindings)) {
      if (b.kind === 'kp')
        expect(back.layers[0].bindings[id], id).toMatchObject({ symbol: b.symbol });
    }
  });

  it('writes a hold of several modifiers as ZMK does, and reads it back', () => {
    const layout: Layout = {
      format: 'layerbench/layout@1',
      name: 'Held',
      geometry: { preset: '3x5+2' },
      keys: { space: 'L0' },
      layers: [
        {
          id: 'base',
          name: 'Base',
          bindings: {
            LHP: { kind: 'kp', symbol: 'a' },
            LBR: {
              kind: 'hold_tap',
              tap: { kind: 'kp', symbol: 'x' },
              hold: { kind: 'mod', mod: 'LGUI', also: ['LSHIFT'] },
            },
            L0: { kind: 'kp', symbol: ' ' },
          },
        },
      ],
    };
    expect(write(layout)).toContain('h: LS(LGUI)');
    expect(roundTrip(layout).layers[0].bindings.LBR).toEqual({
      kind: 'hold_tap',
      tap: { kind: 'kp', symbol: 'x' },
      hold: { kind: 'mod', mod: 'LGUI', also: ['LSHIFT'] },
    });
  });

  it('reads back layer keys, one-shots, tap-holds and modifiers as they were', () => {
    const bindings: Record<string, Binding> = {
      LHP: {
        kind: 'hold_tap',
        tap: { kind: 'kp', symbol: 'a' },
        hold: { kind: 'mod', mod: 'LGUI' },
      },
      LHR: { kind: 'lt', layer: 'nav', tap: { kind: 'kp', symbol: 's' } },
      LHM: { kind: 'sk', mod: 'LSHIFT' },
      LHI: { kind: 'mod', mod: 'LCTRL' },
      L0: { kind: 'kp', symbol: ' ' },
      L1: { kind: 'sl', layer: 'nav' },
      R0: { kind: 'mo', layer: 'nav' },
      R1: { kind: 'key_repeat' },
      RHI: { kind: 'caps_word' },
      RHM: { kind: 'kp', symbol: ',', shifted: ';' },
    };
    const layout: Layout = {
      format: 'layerbench/layout@1',
      name: 'Kinds',
      hostLocale: 'symbols',
      geometry: { preset: '3x5+2' },
      keys: { space: 'L0' },
      layers: [
        { id: 'base', name: 'Base', bindings },
        {
          id: 'nav',
          name: 'Nav',
          bindings: {
            '*': { kind: 'trans' },
            LHM: { kind: 'kp', symbol: '€' },
          },
        },
      ],
    };
    const back = roundTrip(layout);
    for (const [id, b] of Object.entries(bindings)) {
      expect(back.layers[0].bindings[id], id).toEqual(b);
    }
    expect(back.layers[1].bindings.LHM).toEqual({ kind: 'kp', symbol: '€' });
    // Transparent keys stay transparent rather than becoming keys that do nothing.
    expect(back.layers[1].bindings.LHI).toBeUndefined();
  });

  it('quotes the legends PyYAML, which keymap-drawer reads with, would take for something else', () => {
    const bindings: Record<string, Binding> = {
      LTP: { kind: 'kp', symbol: '=' },
      LTR: { kind: 'kp', symbol: 'y' },
      LTM: { kind: 'kp', symbol: '~' },
      LTI: { kind: 'kp', symbol: '1' },
      L0: { kind: 'kp', symbol: ' ' },
    };
    const layout: Layout = {
      format: 'layerbench/layout@1',
      name: 'Quoting',
      hostLocale: 'symbols',
      geometry: { preset: '3x5+2' },
      keys: { space: 'L0' },
      layers: [{ id: 'base', name: 'Base', bindings }],
    };
    const text = write(layout);
    for (const legend of ["'='", "'Y'", "'~'", "'1'"]) expect(text).toContain(legend);
    expect(roundTrip(layout).layers[0].bindings).toMatchObject(bindings);
  });

  it('marks adaptive keys, macros and tap dances in the corner, as the board does', () => {
    const bindings: Record<string, Binding> = {
      LTP: { kind: 'macro', symbols: 'qu' },
      LTR: {
        kind: 'adaptive',
        default: { kind: 'kp', symbol: 'h' },
        triggers: [{ afterAny: ['s'], binding: { kind: 'kp', symbol: 'c' } }],
      },
      LTM: {
        kind: 'tap_dance',
        bindings: [
          { kind: 'kp', symbol: 'x' },
          { kind: 'kp', symbol: 'z' },
        ],
      },
      LTI: { kind: 'adaptive', triggers: [] },
      L0: { kind: 'kp', symbol: ' ' },
    };
    const layout: Layout = {
      format: 'layerbench/layout@1',
      name: 'Marks',
      hostLocale: 'symbols',
      geometry: { preset: '3x5+2' },
      keys: { space: 'L0' },
      layers: [{ id: 'base', name: 'Base', bindings }],
    };
    const text = write(layout);
    expect(text).toContain('{t: qu, tr: ⋯}');
    expect(text).toContain('{t: H, tr: ✦}');
    expect(text).toContain('{t: X, tr: TD}');

    const back = roundTrip(layout).layers[0].bindings;
    // The mark tells a macro from a key's name, so its text comes back as a macro.
    expect(back.LTP).toEqual({ kind: 'macro', symbols: 'qu' });
    // An adaptive key's branches have no field in the file: it comes back as what it types by default,
    // and one with no default as a transparent key, not as a key that types ✦.
    expect(back.LTR).toEqual({ kind: 'kp', symbol: 'h' });
    expect(back.LTI).toEqual({ kind: 'trans' });
  });
});

describe('bounds on what a file may ask for', () => {
  it('refuses an ortho grid of more keys than any keyboard has', () => {
    const yaml = 'layout: { ortho_layout: { rows: 1000, columns: 1000 } }\nlayers:\n  base: [a]\n';
    expect(() => readKeymapDrawer(yaml)).toThrow(KeymapDrawerError);
    expect(() => readKeymapDrawer(yaml)).toThrow(/more than/);
  });

  it('refuses layers that alias a row into more keys than any keyboard has', () => {
    const row = `row: &r [${Array.from({ length: 100 }, () => 'a').join(', ')}]`;
    const layer = `[${Array.from({ length: 100 }, () => '*r').join(', ')}]`;
    const layers = Array.from({ length: 2 }, (_, i) => `  l${i}: ${layer}`).join('\n');
    const yaml = `${row}\nlayers:\n${layers}\n`;
    expect(() => readKeymapDrawer(yaml)).toThrow(new RegExp(`more than ${MAX_KEYS} keys`));
  });
});
