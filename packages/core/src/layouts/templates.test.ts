import { describe, expect, it } from 'vitest';
import { GEOMETRY_PRESET_IDS, getGeometryPreset } from '../geometry/presets.js';
import { layoutLanguageCoverage, producibleSymbols } from '../lang/coverage.js';
import { LANGUAGE_PROFILES } from '../lang/profiles.js';
import { compileLayout } from '../layout/compile.js';
import type { Binding, Layout } from '../layout/types.js';
import { explain } from '../sim/resolver.js';
import { magicRomak } from './romak.js';
import {
  DEAD_KEYS_CORE,
  defaultDeadKeys,
  defaultLayerSymbols,
  defaultLayers,
  NUMBERS_CORE,
  SYMBOLS_CORE,
} from './templates.js';

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
  it('reach Dead keys with three taps on a split board: thumb, accent, letter', () => {
    const t = trace(boardWithDefaults('3x5+2'), 'è');
    expect(t.keys).toEqual(['R0', 'LBI', 'LTR']);
  });

  it('type ñ and ç with a key each, a press less than the accent and the letter', () => {
    expect(trace(boardWithDefaults('3x5+2'), 'ñ ç').keys).toEqual(['R0', 'RTM', 'L0', 'R0', 'RHM']);
    // With no bottom row the grave accent takes ñ's key, and ñ goes to the right outer thumb.
    expect(trace(boardWithDefaults('1222+2'), 'ñ').keys).toEqual(['R0', 'R1']);
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

  it('hold Numbers on the space bar of a row-stagger board, and arm the others from there', () => {
    const d = defaultLayers(getGeometryPreset('ansi'));
    expect(Object.keys(d.base).sort()).toEqual(['L0', 'R0']);
    const t = trace(boardWithDefaults('ansi'), 'ñ');
    expect(t.out).toBe('ñ');
    expect(t.keys).toEqual(['L0', 'RTO', 'RTM']);
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

  it('Dead keys is the default layer, reached from Alpha 2', () => {
    expect(layer('dead')).toEqual({ '*': { kind: 'trans' }, ...DEAD_KEYS_CORE });
    expect(layer('alpha2').R1).toEqual({ kind: 'sl', layer: 'dead' });
    const t = trace(magicRomak, 'ñ è');
    expect(t.out).toBe('ñ è');
    expect(t.keys).toEqual(['R0', 'R1', 'RTM', 'L0', 'R0', 'R1', 'LBI', 'RHR']);
  });
});
