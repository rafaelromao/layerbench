import { describe, expect, it } from 'vitest';
import { normalizeText } from '../corpus/normalize.js';
import { magicRomak } from '../layouts/romak.js';
import { explain, simulate } from '../sim/resolver.js';
import { compileLayout } from './compile.js';
import { expandFeatures } from './features.js';
import type { Layout, LayoutFeatures } from './types.js';

const OPTS = { caseMode: 'fold', crossWord: 'reset' } as const;

function trace(layout: Layout, word: string): string[] {
  return explain(compileLayout(layout), word, OPTS).steps.map((s) => s.key);
}

/** A two-key layout, so a feature's effect on one binding is easy to read. */
function mini(features?: LayoutFeatures, extra: Partial<Layout> = {}): Layout {
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
    ...extra,
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

  it('wraps the space key for sentence case and leaves a plain space alone', () => {
    const { layout, owned } = expandFeatures(mini({ sentenceCase: {} }));
    const space = layout.layers[0].bindings.L0;
    expect(space.kind).toBe('adaptive');
    expect(owned.get('base')?.get('L0')).toBe('sentenceCase');

    const c = compileLayout(mini({ sentenceCase: {} }));
    // A sentence-ending space arms a one-shot shift, so the capital after it costs no extra
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

  it('leaves the document behaviours as they are', () => {
    const behaviors = { magic: { kind: 'kp', symbol: 'z' } } as const;
    const e = expandFeatures(mini({ sentenceCase: {} }, { behaviors }));
    expect(e.layout.behaviors).toBe(behaviors);
  });
});

describe('Magic Romak after the features rewrite', () => {
  const compiled = compileLayout(magicRomak);

  it('has three alpha layers plus the numbers and symbols the board really has', () => {
    expect(compiled.layers.map((l) => l.id)).toEqual(['alpha1', 'alpha2', 'ccedil', 'num', 'sym']);
  });

  it('reaches numbers by holding the space key, without losing sentence case on its tap', () => {
    const space = compiled.expanded.layers[0].bindings.L0;
    expect(space.kind).toBe('hold_tap');
    if (space.kind !== 'hold_tap') return;
    expect(space.hold).toEqual({ kind: 'mo', layer: 'num' });
    // The feature wrapped the tap arm rather than replacing the whole binding.
    expect(space.tap.kind).toBe('adaptive');

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
    expect(compiled.layout.behaviors).toEqual({});
    // Only the space and shift keys are wrapped; the magic keys and the alt repeat are bindings.
    expect(compiled.expanded.behaviors).toEqual({});
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

  /**
   * The shift a sentence start arms cannot be cancelled — the firmware's `&sk LSHIFT` behaves the
   * same way — so a *lowercase* letter after `. ` is genuinely unproducible. The pre-shifted layer
   * this replaced looked better only because `upperCopy` skipped the adaptive magic key, letting
   * `h` and `v` through unshifted. This pins the honest behaviour.
   */
  it('cannot type a lowercase letter straight after a sentence-ending space', () => {
    const capital = explain(compiled, '. H', { caseMode: 'model', crossWord: 'reset' });
    expect(capital.presses).toBe(3);
    expect([...capital.coverage.unproducible.keys()]).toEqual([]);

    const lower = explain(compiled, '. h', { caseMode: 'model', crossWord: 'reset' });
    expect([...lower.coverage.unproducible.keys()]).toEqual(['h']);
  });

  it('types accented capitals from shift state, with no pre-shifted layer', () => {
    const e = explain(compiled, 'É', { caseMode: 'model', crossWord: 'reset' });
    expect(e.steps.map((s) => s.key)).toEqual(['R1', 'R0', 'RHR']);
    expect(e.steps.map((s) => s.symbols).join('')).toBe('É');
  });
});
