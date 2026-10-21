import { describe, expect, it } from 'vitest';
import type { Binding } from '../layout/types.js';
import { classicLayout } from './classic.js';

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });
const ADAPTIVE: Binding = {
  kind: 'adaptive',
  default: kp('h'),
  triggers: [{ afterAny: ['a'], binding: kp('v') }],
};

/** Ben Vallack Piano's eighteen keys, the smallest board a definition is written for by key. */
const PIANO = {
  LTR: 'l',
  LTM: 'g',
  LTI: 'd',
  RTI: 'h',
  RTM: 'u',
  RTR: 'o',
  LHP: 'i',
  LHR: 's',
  LHM: 'r',
  LHI: 't',
  RHI: 'n',
  RHM: 'e',
  RHR: 'a',
  RHP: 'c',
  L1: 'space',
  L0: 'x',
  R0: 'y',
  R1: 'z',
};

describe('a layout written in code', () => {
  it('takes a binding in place of a token, on its base layer and on another', () => {
    const layout = classicLayout({
      id: 'bound',
      name: 'Bound',
      geometry: '1222+2',
      byKey: { ...PIANO, RTI: ADAPTIVE, L0: { kind: 'sl', layer: 'alpha2' } },
      layers: [{ id: 'alpha2', name: 'Alpha 2', byKey: { LTR: 'v', LTM: kp('é') } }],
    });

    const [base, alpha2] = layout.layers;
    expect(base.bindings.RTI).toEqual(ADAPTIVE);
    expect(base.bindings.L0).toEqual({ kind: 'sl', layer: 'alpha2' });
    expect(base.bindings.LTR).toEqual(kp('l'));
    expect(base.bindings.L1).toEqual(kp(' '));
    expect(layout.keys.space).toBe('L1');
    expect(alpha2.bindings).toEqual({ LTR: kp('v'), LTM: kp('é') });
  });

  it('keeps a combo written whole as it is, beside the ones written by tokens', () => {
    const chord = {
      id: 'dead-acute',
      keys: ['LHM', 'LHI'],
      binding: { kind: 'dead_key', diacritic: '´' } satisfies Binding,
      layers: ['alpha2'],
      role: 'typing' as const,
      timeoutMs: 30,
      slowRelease: false,
    };
    const layout = classicLayout({
      id: 'chorded',
      name: 'Chorded',
      geometry: '1222+2',
      byKey: PIANO,
      layers: [{ id: 'alpha2', name: 'Alpha 2', byKey: { LTR: 'v' } }],
      combos: [chord, { keys: 'l g', types: 'q' }],
    });

    expect(layout.combos).toEqual([
      chord,
      { id: 'q', keys: ['LTR', 'LTM'], binding: kp('q'), layers: ['base'], role: 'typing' },
    ]);
  });

  it('names its base layer, and its chords by tokens fire there', () => {
    const layout = classicLayout({
      id: 'named',
      name: 'Named',
      geometry: '1222+2',
      base: { id: 'alpha1', name: 'Alpha 1' },
      byKey: PIANO,
      combos: [{ keys: 'l g', types: 'q' }],
    });

    expect(layout.layers.map((l) => [l.id, l.name])).toEqual([['alpha1', 'Alpha 1']]);
    expect(layout.combos?.[0].layers).toEqual(['alpha1']);
    const rows = classicLayout({
      id: 'rows',
      name: 'Rows',
      base: { id: 'alpha1', name: 'Alpha 1' },
      rows: 'q w e r t y u i o p\na s d f g h j k l ;\nz x c v b n m , . /',
    });
    expect(rows.layers[0]).toMatchObject({ id: 'alpha1', name: 'Alpha 1' });
  });

  it('carries its shift key, features, behaviour defaults, repeat policy and ways into layers', () => {
    const layout = classicLayout({
      id: 'featured',
      name: 'Featured',
      geometry: '1222+2',
      byKey: { ...PIANO, R1: { kind: 'sk', mod: 'LSHIFT' } },
      shift: { key: 'R1', kind: 'sk' },
      features: { sentenceCase: {}, capsWord: { continueList: ['_'] } },
      behaviorDefaults: { sk: { quickRelease: true, releaseAfterMs: 1500 } },
      repeatPolicy: { doubledLetters: 'repeatKey' },
      activators: { alpha2: [{ from: 'base', via: 'key:base/R0' }] },
    });

    expect(layout.keys).toEqual({ space: 'L1', shift: { key: 'R1', kind: 'sk' } });
    expect(layout.features).toEqual({ sentenceCase: {}, capsWord: { continueList: ['_'] } });
    expect(layout.behaviorDefaults).toEqual({ sk: { quickRelease: true, releaseAfterMs: 1500 } });
    expect(layout.repeatPolicy).toEqual({ doubledLetters: 'repeatKey' });
    expect(layout.activators).toEqual({ alpha2: [{ from: 'base', via: 'key:base/R0' }] });
  });
});
