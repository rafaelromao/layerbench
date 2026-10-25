import { describe, expect, it } from 'vitest';
import { normalizeText } from '../corpus/normalize.js';
import { bundledLayout } from '../layouts/index.js';
import { explain, simulate } from '../sim/resolver.js';
import { compileLayout } from './compile.js';
import { expandFeatures } from './features.js';
import type { Layout, LayoutFeatures } from './types.js';

const magicRomak = bundledLayout('magic-romak')!;

const OPTS = { caseMode: 'fold', crossWord: 'reset' } as const;

function trace(layout: Layout, word: string): string[] {
  return explain(compileLayout(layout), word, OPTS).steps.map((s) => s.key);
}

/** A two-key layout, so a feature's effect on one binding is easy to read. */
function mini(features?: LayoutFeatures): Layout {
  return {
    format: 'layerbench/layout@1',
    name: 'Mini',
    hostLocale: 'symbols',
    geometry: { preset: '3x5+2' },
    keys: { space: 'L0', shift: { key: 'R1', kind: 'sk' } },
    layers: [
      {
        id: 'base',
        name: 'Base',
        bindings: {
          LHI: { kind: 'kp', symbol: 'a' },
          RHI: { kind: 'kp', symbol: 'b' },
          RBI: { kind: 'kp', symbol: '.' },
          L0: { kind: 'kp', symbol: ' ' },
          R1: { kind: 'sk', mod: 'LSHIFT' },
        },
      },
    ],
    ...(features ? { features } : {}),
  };
}

describe('feature expansion', () => {
  it('is the identity when a layout declares no features', () => {
    const layout = mini();
    const e = expandFeatures(layout);
    expect(e.layout).toBe(layout);
    expect(e.errors).toEqual([]);
    expect(e.owned.size).toBe(0);
  });

  it('makes the space key a sentence space and leaves a plain space alone', () => {
    const { layout, owned } = expandFeatures(mini({ sentenceCase: {} }));
    expect(layout.layers[0].bindings.L0).toEqual({ kind: 'sentence_space' });
    expect(owned.get('base')?.get('L0')).toBe('sentenceCase');

    const c = compileLayout(mini({ sentenceCase: {} }));
    // A sentence-ending space leaves a capital pending, so the capital after it costs no extra
    // press — the whole point of not modelling this as a pre-shifted layer.
    const e = explain(c, '. B', { caseMode: 'model', crossWord: 'reset' });
    expect(e.steps.map((s) => s.key)).toEqual(['RBI', 'L0', 'RHI']);
    expect(e.steps.map((s) => s.symbols).join('')).toBe('. B');

    // Without the feature the same capital needs the shift key first.
    const plain = explain(compileLayout(mini()), '. B', {
      caseMode: 'model',
      crossWord: 'reset',
    });
    expect(plain.steps.map((s) => s.key)).toEqual(['RBI', 'L0', 'R1', 'RHI']);
  });

  it('turns caps word into the caps_word behaviour behind the shift key', () => {
    const { layout } = expandFeatures(mini({ capsWord: {} }));
    const shift = layout.layers[0].bindings.R1;
    expect(shift.kind).toBe('mod_morph');
    if (shift.kind !== 'mod_morph') return;
    expect(shift.default).toEqual({ kind: 'sk', mod: 'LSHIFT' });
    expect(shift.morphed.kind).toBe('caps_word');
  });

  it('reports a feature that names a layer the layout does not have', () => {
    const e = expandFeatures(mini({ sentenceCase: { on: ['nope'] } }));
    expect(e.errors).toEqual(['Feature sentenceCase: unknown layer nope']);
  });
});

describe('Magic Romak after the features rewrite', () => {
  const compiled = compileLayout(magicRomak);

  it('has three alpha layers plus Numbers and Symbols, as its keymap has', () => {
    expect(compiled.layers.map((l) => l.id)).toEqual([
      ...['alpha1', 'alpha2', 'ccedil'],
      ...['num', 'sym'],
    ]);
  });

  it('reaches numbers by holding the space key, without losing sentence case on its tap', () => {
    const space = compiled.expanded.layers[0].bindings.L0;
    expect(space.kind).toBe('hold_tap');
    if (space.kind !== 'hold_tap') return;
    expect(space.hold).toEqual({ kind: 'mo', layer: 'num' });
    // The feature wrapped the tap rather than replacing the whole binding.
    expect(space.tap).toEqual({ kind: 'sentence_space' });

    // `explain` takes the text as given, so the digits reach the simulator directly: hold the
    // space key, tap the two digits on the keypad, release. The release is not a press.
    const e = explain(compiled, '42', { caseMode: 'fold', crossWord: 'reset' });
    expect(e.steps.map((s) => `${s.key}:${s.kind}`)).toEqual([
      'L0:hold_press',
      'RHI:tap',
      'RBM:tap',
      'L0:hold_release',
    ]);
    expect(e.steps.map((s) => s.symbols).join('')).toBe('42');
    expect(e.presses).toBe(3);
  });

  it('keeps the authored document separate from the expanded one', () => {
    expect(compiled.layout.features?.sentenceCase).toBeDefined();
    // Only the space and shift keys are wrapped; the adaptive keys and the alt repeat are bindings.
    expect(compiled.featureOwned.get('alpha1')).toEqual(
      new Map([
        ['L0', 'sentenceCase'],
        ['R1', 'capsWord'],
      ]),
    );
    const altRepeat = compiled.layout.layers[0].bindings.L1;
    expect(altRepeat.kind === 'adaptive' && altRepeat.default).toEqual({ kind: 'key_repeat' });
  });

  // The traces from before features replaced layers, unchanged by that rewrite.
  it.each([
    ['ação', ['RHM', 'R0', 'LBM', 'LHI']],
    ['chave', ['LBM', 'RBI', 'RHM', 'RBI', 'RHR']],
    ['qu', ['R0', 'LTM']],
  ])('types %s the same way', (word, keys) => {
    expect(trace(magicRomak, word)).toEqual(keys);
  });

  it('tells a macro-produced u from a plain one on the alt-repeat key', () => {
    // `qu` leaves the Alpha 2 tag, so alt repeat offers `ê`; a plain `u` just repeats.
    expect(explain(compiled, 'quê', OPTS).steps.map((s) => s.key)).toEqual(['R0', 'LTM', 'L1']);
    expect(
      explain(compiled, 'uu', OPTS)
        .steps.map((s) => s.symbols)
        .join(''),
    ).toBe('uu');
  });

  it('capitalises a sentence start on real prose without a single shift press', () => {
    const prose = 'Ola mundo. Bom dia. Nao sei. Chave nova. Quando vem?';
    const sim = simulate(compiled, normalizeText(prose, { caseMode: 'model' }), {
      caseMode: 'model',
      crossWord: 'reset',
    });
    expect([...sim.coverage.unproducible.keys()]).toEqual([]);
    expect(sim.tables.stats.wasted_one_shots).toBe(0);
  });

  it('waits for sentence case to expire when prose needs a lowercase letter', () => {
    const capital = explain(compiled, '. H', { caseMode: 'model', crossWord: 'reset' });
    expect(capital.presses).toBe(3);
    expect([...capital.coverage.unproducible.keys()]).toEqual([]);

    const lower = explain(compiled, '. h', { caseMode: 'model', crossWord: 'reset' });
    expect(lower.steps.map((s) => s.symbols).join('')).toBe('. h');
    expect(lower.presses).toBe(3);
    expect([...lower.coverage.unproducible.keys()]).toEqual([]);
  });

  it('keeps e on a thumb and l and i reachable after sentence-ending spaces', () => {
    const layout = mini({ sentenceCase: {} });
    layout.layers[0].bindings.R0 = {
      kind: 'hold_tap',
      tap: { kind: 'kp', symbol: 'e' },
      hold: { kind: 'mo', layer: 'sym' },
    };
    layout.layers[0].bindings.LHI = { kind: 'kp', symbol: 'l' };
    layout.layers[0].bindings.RHI = { kind: 'kp', symbol: 'i' };
    layout.layers.push({ id: 'sym', bindings: { '*': { kind: 'trans' } } });
    const text = '. e . l . i . E . L . I';
    for (const caseMode of ['fold', 'model'] as const) {
      const stream = normalizeText(text, { caseMode });
      const t = explain(compileLayout(layout), stream, { ...OPTS, caseMode });
      expect(
        t.steps
          .map((s) => s.symbols)
          .join('')
          .toLowerCase(),
      ).toBe(stream.toLowerCase());
      if (caseMode === 'model') expect(t.steps.map((s) => s.symbols).join('')).toBe(stream);
      expect([...t.coverage.unproducible]).toEqual([]);
      expect(t.presses).toBe(stream.length);
      expect(t.steps.filter((s) => s.symbols.toLowerCase() === 'e').map((s) => s.key)).toEqual([
        'R0',
        'R0',
      ]);
    }
  });

  it('still reports a genuinely missing letter after a sentence-ending space', () => {
    const t = explain(compileLayout(mini({ sentenceCase: {} })), '. zB', {
      ...OPTS,
      caseMode: 'model',
    });
    expect([...t.coverage.unproducible]).toEqual([['z', 1]]);
    expect(t.steps.map((s) => s.symbols).join('')).toBe('. B');
    // A failed timeout retry keeps the pending capital for B, which needs no Shift press.
    expect(t.presses).toBe(3);
  });

  it('retries an accented letter through the sentence morph after the timeout', () => {
    const t = explain(compiled, '. é', { ...OPTS, caseMode: 'model' });
    expect(t.steps.map((s) => s.symbols).join('')).toBe('. é');
    expect([...t.coverage.unproducible]).toEqual([]);
    expect(t.steps.filter((s) => s.keyKind === 'shift')).toEqual([]);
  });

  it("starts a sentence with an accented capital through its Alpha 2 key's sentence morph", () => {
    // `sentence_alpha2`: after a sentence's end the Alpha 2 key arms Shift with Alpha 2, so `É`
    // costs no more than `é`, and no shift press.
    const e = explain(compiled, 'a. É', { caseMode: 'model', crossWord: 'reset' });
    expect(e.steps.map((s) => s.key)).toEqual(['RHM', 'RBR', 'L0', 'R0', 'RHR']);
    expect(e.steps.map((s) => s.symbols).join('')).toBe('a. É');
  });

  it('types accented capitals from shift state, with no pre-shifted layer', () => {
    const e = explain(compiled, 'É', { caseMode: 'model', crossWord: 'reset' });
    expect(e.steps.map((s) => s.key)).toEqual(['R1', 'R0', 'RHR']);
    expect(e.steps.map((s) => s.symbols).join('')).toBe('É');
  });
});
