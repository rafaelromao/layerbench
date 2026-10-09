import { describe, expect, it } from 'vitest';
import { GEOMETRY_PRESET_IDS, getGeometryPreset } from '../geometry/presets.js';
import { layoutLanguageCoverage, producibleSymbols } from '../lang/coverage.js';
import { LANGUAGE_PROFILES } from '../lang/profiles.js';
import { compileLayout } from '../layout/compile.js';
import type { Binding, Layout } from '../layout/types.js';
import { reachKeys } from '../sim/activators.js';
import { explain } from '../sim/resolver.js';
import { CLASSIC_LAYOUTS } from './classic.js';
import { BUNDLED_LAYOUTS, bundledLayout, SMALL_LAYOUTS } from './index.js';
import { magicRomak } from './romak.js';
import {
  DEAD_KEYS_CORE,
  deadKeysCombo,
  defaultDeadKeys,
  defaultLayerSymbols,
  defaultLayers,
  NUMBERS_CORE,
  SYMBOLS_CORE,
} from './templates.js';

/** The chord that one-shots Dead keys, as `explain` names its step. */
const DEAD_KEYS = 'combo:dead-keys';

/**
 * A base layer with the letters every accent composes with, on whatever keys the board has. A
 * Qwerty import would not do: the small boards drop half its letters.
 */
const BASE_LETTERS = [...'aeiouycn'];

function boardWithDefaults(preset: string): Layout {
  const geometry = getGeometryPreset(preset);
  const defaults = defaultLayers(geometry);
  const free = geometry.keys.filter((k) => !k.thumb).map((k) => k.id);
  const letters: Record<string, Binding> = {};
  BASE_LETTERS.forEach((c, i) => {
    letters[free[i]] = { kind: 'kp', symbol: c };
  });
  return {
    format: 'layerbench/layout@1',
    name: `Defaults on ${preset}`,
    hostLocale: 'symbols',
    geometry: { preset },
    keys: { space: defaults.spaceKey },
    layers: [{ id: 'base', bindings: { ...letters, ...defaults.base } }, ...defaults.layers],
    combos: [deadKeysCombo('base')],
  };
}

function trace(layout: Layout, text: string) {
  const r = explain(compileLayout(layout), text, { caseMode: 'fold', crossWord: 'reset' });
  return {
    ...r,
    keys: r.steps.filter((s) => s.kind !== 'hold_release').map((s) => s.key),
    out: r.steps.map((s) => s.symbols).join(''),
  };
}

describe('the default layers on every board', () => {
  for (const preset of GEOMETRY_PRESET_IDS) {
    describe(preset, () => {
      const layout = boardWithDefaults(preset);
      const compiled = compileLayout(layout);
      const producible = producibleSymbols(compiled);

      it('types every digit and symbol of the default layers', () => {
        const missing = [...'0123456789', ...defaultLayerSymbols()].filter(
          (c) => !producible.has(c),
        );
        expect(missing).toEqual([]);
      });

      it('writes all five languages', () => {
        for (const tag of Object.keys(LANGUAGE_PROFILES)) {
          const c = layoutLanguageCoverage(compiled, tag);
          expect([tag, c?.missingRequired, c?.missingOptional, c?.missingPunctuation]).toEqual([
            tag,
            [],
            [],
            [],
          ]);
        }
      });

      it('types an accent, a digit and a symbol through the analysis', () => {
        const t = trace(layout, 'ñ 7 % è');
        expect(t.out).toBe('ñ 7 % è');
        expect(t.coverage.unproducible.size).toBe(0);
      });
    });
  }
});

describe('the default layers, board by board', () => {
  it('reach Dead keys with three presses: LHR and LHM together, the accent, the letter', () => {
    const t = trace(boardWithDefaults('3x5+2'), 'è');
    expect(t.keys).toEqual([DEAD_KEYS, 'LBI', 'LTR']);
  });

  it('type ñ and ç with a key each, a press less than the accent and the letter', () => {
    expect(trace(boardWithDefaults('3x5+2'), 'ñ ç').keys).toEqual([
      DEAD_KEYS,
      'RTM',
      'L0',
      DEAD_KEYS,
      'RHM',
    ]);
    // With no bottom row the grave accent takes ñ's key, and ñ goes to the right outer thumb.
    expect(trace(boardWithDefaults('1222+2'), 'ñ').keys).toEqual([DEAD_KEYS, 'R1']);
  });

  it('hold only Symbols on the right inner thumb: nothing there taps Dead keys', () => {
    expect(defaultLayers(getGeometryPreset('3x5+2')).base.R0).toEqual({ kind: 'mo', layer: 'sym' });
  });

  it('put 0 on the right outer thumb, or on the inner one when there is none', () => {
    const zero = (preset: string) => {
      const num = defaultLayers(getGeometryPreset(preset)).layers[0].bindings;
      return Object.entries(num)
        .filter(([, b]) => JSON.stringify(b).includes('"0"'))
        .map(([id]) => id);
    };
    expect(zero('1333+2')).toEqual(['R1']);
    expect(zero('3x6+3')).toEqual(['R1']);
    expect(zero('13332+1')).toEqual(['R0']);
    expect(zero('ansi')).toEqual(['RTP']);
  });

  it('give an 18-key board a Symbols 2 layer for what its missing bottom row held', () => {
    const d = defaultLayers(getGeometryPreset('1222+2'));
    expect(d.layers.map((l) => l.id)).toEqual(['num', 'sym', 'sym2', 'dead']);
    const t = trace(boardWithDefaults('1222+2'), '[ * « 3');
    expect(t.out).toBe('[ * « 3');
  });

  it('hold Numbers on the space bar of a row-stagger board, and arm Symbols from there', () => {
    const d = defaultLayers(getGeometryPreset('ansi'));
    expect(Object.keys(d.base).sort()).toEqual(['L0', 'R0']);
    expect(d.layers[0].bindings.RHO).toEqual({ kind: 'sl', layer: 'sym' });
    expect(d.layers[0].bindings.RTO).toBeUndefined();
    const t = trace(boardWithDefaults('ansi'), 'ñ');
    expect(t.out).toBe('ñ');
    expect(t.keys).toEqual([DEAD_KEYS, 'RTM']);
  });

  it('carry each dead key the five languages need', () => {
    expect(defaultDeadKeys().sort()).toEqual(['^', '`', '~', '¨', '´'].sort());
  });

  it('mirror Symbols: each accent and extra symbol sits where its look-alike does', () => {
    const at = (id: string) => {
      const b = DEAD_KEYS_CORE[id];
      return b.kind === 'dead_key' ? b.diacritic : b.kind === 'kp' ? b.symbol : '';
    };
    const pairs = Object.keys(DEAD_KEYS_CORE).map((id) => `${SYMBOLS_CORE[id]}${at(id)}`);
    for (const p of ["'´", '"¨', '~~', '^^', '``', '$€', '#£', '<«', '>»', '?¿', '!¡', ':;'])
      expect(pairs).toContain(p);
  });
});

describe("Magic Romak's layers are the defaults on its board", () => {
  const layer = (id: string) => magicRomak.layers.find((l) => l.id === id)?.bindings ?? {};
  const typed = (b: Binding | undefined): string | undefined =>
    b?.kind === 'kp' ? b.symbol : b?.kind === 'hold_tap' ? typed(b.tap) : undefined;

  it('Numbers and Symbols type what the core tables say', () => {
    for (const [id, s] of Object.entries(NUMBERS_CORE)) expect(typed(layer('num')[id])).toBe(s);
    for (const [id, s] of Object.entries(SYMBOLS_CORE)) expect(typed(layer('sym')[id])).toBe(s);
  });

  it('Dead keys is the default layer, reached from Alpha 2, for what its combos do not type', () => {
    expect(layer('dead')).toEqual({ '*': { kind: 'trans' }, ...DEAD_KEYS_CORE });
    expect(layer('alpha2').R1).toEqual({ kind: 'sl', layer: 'dead' });
    expect(magicRomak.combos?.some((c) => c.id === 'dead-keys')).toBe(false);
    // An accent is a combo on Alpha 2, a press less than through Dead keys.
    const t = trace(magicRomak, 'ñ è £');
    expect(t.out).toBe('ñ è £');
    expect(t.keys).toEqual([
      ...['R0', 'combo:tilde', 'LHR', 'L0'],
      ...['R0', 'combo:grave', 'RHR', 'L0'],
      ...['R0', 'R1', 'LTM'],
    ]);
  });
});

describe('Romak types the other accents by the combos on its Alpha 2', () => {
  const romak = bundledLayout('romak-34') as Layout;

  it('has no Alt repeat 2 and no Dead keys', () => {
    expect(romak.layers.map((l) => l.id)).toEqual(['alpha1', 'alpha2', 'ccedil', 'num', 'sym']);
    expect(romak.behaviors).toBeUndefined();
  });

  it('writes the five languages: an accent and the letter, ¿ and ¡ held, and œ held on é', () => {
    const t = trace(romak, 'ñ ü ¿ ¡ œ');
    expect(t.out).toBe('ñ ü ¿ ¡ œ');
    expect(t.keys).toEqual([
      ...['R0', 'combo:tilde', 'LHR', 'L0'],
      ...['R0', 'combo:diaeresis', 'RTR', 'L0'],
      ...['R0', 'combo:question', 'L0'],
      ...['R0', 'combo:exclamation', 'L0'],
      ...['R0', 'RHR'],
    ]);
    const compiled = compileLayout(romak);
    for (const tag of Object.keys(LANGUAGE_PROFILES)) {
      expect([tag, layoutLanguageCoverage(compiled, tag)?.missingRequired]).toEqual([tag, []]);
    }
  });
});

describe('the default layers on every bundled layout', () => {
  const before = new Map([...CLASSIC_LAYOUTS, ...SMALL_LAYOUTS].map((l) => [l.id, l]));
  /** What only the Dead keys layer types, past the accents. */
  const deadKeysOnly = new Set(
    Object.values(DEAD_KEYS_CORE).flatMap((b) => (b.kind === 'kp' && b.symbol ? [b.symbol] : [])),
  );

  for (const layout of BUNDLED_LAYOUTS) {
    describe(layout.name, () => {
      const compiled = compileLayout(layout);
      const producible = producibleSymbols(compiled);
      const hasDeadKeys = layout.layers.some((l) => l.id === 'dead');

      it('types every digit and symbol of the default layers', () => {
        const missing = [...'0123456789', ...defaultLayerSymbols()].filter(
          (c) => !producible.has(c),
        );
        // Romak has no Dead keys layer: it types the accents by combos, and not that layer's extras.
        expect(hasDeadKeys ? missing : missing.filter((c) => !deadKeysOnly.has(c))).toEqual([]);
      });

      it('writes all five languages', () => {
        for (const tag of Object.keys(LANGUAGE_PROFILES)) {
          expect([tag, layoutLanguageCoverage(compiled, tag)?.missingRequired]).toEqual([tag, []]);
        }
      });

      const original = layout.id ? before.get(layout.id) : undefined;
      if (original) {
        it('reaches Dead keys by LHR and LHM pressed together on its base layer, and nothing else', () => {
          const base = layout.layers[0].id;
          expect(layout.combos).toContainEqual(deadKeysCombo(base));
          const dead = compiled.layerIndex.get('dead') as number;
          const reach = reachKeys(compiled, dead)
            .map((k) => ({
              key: compiled.keys[k.pos].id,
              from: k.routes.map((r) => compiled.layers[r.via].id),
            }))
            .sort((a, b) => a.key.localeCompare(b.key));
          expect(reach).toEqual([
            { key: 'LHM', from: [base] },
            { key: 'LHR', from: [base] },
          ]);
        });

        it('keeps every key it had, a thumb holding a layer still typing what it typed', () => {
          const base = layout.layers[0].bindings;
          for (const [id, b] of Object.entries(original.layers[0].bindings)) {
            const now = base[id];
            expect([id, now?.kind === 'hold_tap' ? now.tap : now]).toEqual([id, b]);
          }
          expect(layout.layers.slice(0, original.layers.length)).toEqual([
            { ...original.layers[0], bindings: base },
            ...original.layers.slice(1),
          ]);
        });
      }
    });
  }
});

describe('the default layers, layout by layout', () => {
  const base = (id: string) => bundledLayout(id)?.layers[0].bindings ?? {};
  const num = (id: string) => bundledLayout(id)?.layers.find((l) => l.id === 'num')?.bindings ?? {};
  const holds = (layer: string, tap: Binding) => ({
    kind: 'hold_tap',
    tap,
    hold: { kind: 'mo', layer },
  });
  const space: Binding = { kind: 'kp', symbol: ' ' };
  const holdSymbols: Binding = { kind: 'mo', layer: 'sym' };

  it('hold Numbers on the space key and Symbols on the inner thumb of the other hand', () => {
    expect(base('qwerty').L1).toEqual(holds('num', space));
    expect(base('qwerty').R0).toEqual(holdSymbols);
    expect(num('qwerty').R0).toEqual(holds('sym', space));
    expect(num('qwerty').R1).toEqual({ kind: 'kp', symbol: '0' });
  });

  it('take the innermost free thumb for Symbols, past one with a letter', () => {
    expect(base('hands-down-neu').R0).toEqual({ kind: 'kp', symbol: 'j' });
    expect(base('hands-down-neu').R1).toEqual(holdSymbols);
  });

  it('hold Symbols on a thumb that types where every thumb does, and keep 0 by the keypad', () => {
    expect(base('finch').R0).toEqual(holds('sym', { kind: 'kp', symbol: 'e' }));
    expect(num('finch').R0).toEqual(holds('sym', space));
    expect(num('finch').RBC).toEqual({ kind: 'kp', symbol: '0' });
    const t = trace(bundledLayout('finch') as Layout, 'ñ');
    expect(t.out).toBe('ñ');
    expect(t.keys).toEqual([DEAD_KEYS, 'RTM']);
  });

  it('hold Numbers on the left inner thumb when no thumb types space', () => {
    expect(base('uno').L0).toEqual(holds('num', { kind: 'kp', symbol: 'a' }));
    expect(base('uno').R0).toEqual(holds('sym', { kind: 'kp', symbol: 'r' }));
  });
});
