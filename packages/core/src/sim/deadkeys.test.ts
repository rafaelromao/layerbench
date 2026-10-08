import { describe, expect, it } from 'vitest';
import { layoutLanguageCoverage, producibleSymbols } from '../lang/coverage.js';
import { compileLayout } from '../layout/compile.js';
import type { Binding, Layout } from '../layout/types.js';
import { Machine } from './machine.js';
import { enumerateProducers } from './producers.js';
import { explain } from './resolver.js';

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });
const dead = (diacritic: string): Binding => ({ kind: 'dead_key', diacritic });

/** The letters a dead key composes with, on the base layer. */
const LETTERS: Record<string, Binding> = {
  LHP: kp('a'),
  LHR: kp('n'),
  LHM: kp('e'),
  LHI: kp('c'),
  RHI: kp('o'),
  RHM: kp('u'),
  RHR: kp('i'),
  RHP: kp('y'),
  RBR: kp('.'),
  RBM: kp('x'),
};

/** The accents, mirrored on the layer as the default Dead keys layer places them. */
const ACCENTS: Record<string, Binding> = {
  LTR: dead('~'),
  LTI: dead('´'),
  LHR: dead('^'),
  LHI: dead('¨'),
  LBI: dead('`'),
};

function board(reach: Binding, extra: Partial<Layout> = {}, deadExtra = {}): Layout {
  return {
    format: 'layerbench/layout@1',
    name: 'Dead keys',
    hostLocale: 'symbols',
    geometry: { preset: '3x5+2' },
    keys: { space: 'L0', shift: { key: 'R1', kind: 'sk' } },
    layers: [
      {
        id: 'base',
        bindings: {
          ...LETTERS,
          L0: kp(' '),
          R0: reach,
          R1: { kind: 'sk', mod: 'LSHIFT' },
        },
      },
      { id: 'dead', bindings: { '*': { kind: 'trans' }, ...ACCENTS, ...deadExtra } },
    ],
    ...extra,
  };
}

const oneShot = board({ kind: 'sl', layer: 'dead' });
const held = board({ kind: 'mo', layer: 'dead' });

function trace(layout: Layout, text: string, caseMode: 'fold' | 'model' = 'fold') {
  const r = explain(compileLayout(layout), text, { caseMode, crossWord: 'reset' });
  return {
    ...r,
    keys: r.steps.filter((s) => s.kind !== 'hold_release').map((s) => s.key),
    kinds: r.steps.map((s) => `${s.kind}:${s.key}`),
    out: r.steps.map((s) => s.symbols).join(''),
  };
}

describe('dead keys as producers', () => {
  it('types ñ as the tilde, then n, from a one-shot layer', () => {
    const t = trace(oneShot, 'ñ');
    expect(t.out).toBe('ñ');
    expect(t.keys).toEqual(['R0', 'LTR', 'LHR']);
    expect(t.coverage.unproducible.size).toBe(0);
  });

  it('lets go of a held layer before the letter, as a typist does', () => {
    const t = trace(held, 'ñ');
    expect(t.out).toBe('ñ');
    expect(t.kinds).toEqual(['hold_press:R0', 'tap:LTR', 'hold_release:R0', 'tap:LHR']);
  });

  it('composes each accent the five languages need', () => {
    const t = trace(oneShot, 'é è ê ë ñ ã õ ô î ï ü ÿ ç');
    expect(t.out).toBe('é è ê ë ñ ã õ ô î ï ü ÿ ç');
    expect(t.coverage.unproducible.size).toBe(0);
  });

  it('prefers a key that types ç to the acute and c', () => {
    const direct = board({ kind: 'sl', layer: 'dead' }, {}, { RHM: kp('ç') });
    const t = trace(direct, 'ç');
    expect(t.keys).toEqual(['R0', 'RHM']);
  });

  it('shifts the letter, not the accent, for a capital', () => {
    const t = trace(oneShot, 'É', 'model');
    expect(t.out).toBe('É');
    expect(t.keys).toEqual(['R0', 'LTI', 'R1', 'LHM']);
  });

  it('presses shift again when the accent spent the one sentence case armed', () => {
    const t = trace(
      board({ kind: 'sl', layer: 'dead' }, { features: { sentenceCase: {} } }),
      'x. É',
      'model',
    );
    expect(t.out).toBe('x. É');
    expect(t.keys.slice(-4)).toEqual(['R0', 'LTI', 'R1', 'LHM']);
  });

  it('names its producers after the dead key and the letter', () => {
    const index = enumerateProducers(compileLayout(oneShot), 'fold');
    const ids = (index.bySymbol.get('ñ') ?? []).map((p) => `${p.kind} ${p.id}`);
    expect(ids).toEqual(['deadkey deadkey:dead/LTR+direct:base/LHR']);
    // Fold mode composes lowercase letters only.
    expect(index.bySymbol.has('Ñ')).toBe(false);
  });

  it('counts composed letters as producible, so a language is covered', () => {
    const compiled = compileLayout(oneShot);
    expect(producibleSymbols(compiled).has('ñ')).toBe(true);
    for (const tag of ['pt-BR', 'es', 'it'])
      expect(layoutLanguageCoverage(compiled, tag)?.missingRequired).toEqual([]);
  });

  it('leaves the last symbol the plain letter, as firmware sees it', () => {
    const layout = board({ kind: 'sl', layer: 'dead' });
    layout.layers[0].bindings.L1 = { kind: 'key_repeat' };
    const compiled = compileLayout(layout);
    const m = new Machine(compiled);
    const tap = (id: string) =>
      m.perform({ type: 'tap', pos: compiled.keyIndex.get(id) as number });
    tap('R0');
    tap('LTR');
    expect(tap('LHR')[0].symbols).toBe('ñ');
    expect(m.state.lastSymbol).toBe('n');
    expect(tap('L1')[0].symbols).toBe('n');
  });
});

describe('a dead key with a shifted accent', () => {
  /** `´`, and `¨` with shift, on one key, as US-International has them. */
  const shifted = board(
    { kind: 'sl', layer: 'dead' },
    {},
    { LTI: { kind: 'dead_key', diacritic: '´', shifted: '¨' }, LHI: { kind: 'trans' } },
  );

  it('arms the shifted accent while shift is on', () => {
    const compiled = compileLayout(shifted);
    const m = new Machine(compiled);
    const tap = (id: string) =>
      m.perform({ type: 'tap', pos: compiled.keyIndex.get(id) as number });
    tap('R1');
    tap('R0');
    tap('LTI');
    expect(tap('RHM')[0].symbols).toBe('ü');
    tap('R0');
    tap('LTI');
    expect(tap('RHM')[0].symbols).toBe('ú');
  });

  it('is typed with shift on for the accent, and off for the letter', () => {
    const t = trace(shifted, 'ü', 'model');
    expect(t.out).toBe('ü');
    expect(t.keys).toEqual(['R1', 'R0', 'LTI', 'RHM']);
    const capital = trace(shifted, 'Ü', 'model');
    expect(capital.out).toBe('Ü');
    expect(capital.keys).toEqual(['R1', 'R0', 'LTI', 'R1', 'RHM']);
  });

  it('needs shift, so with case folded it is out of reach, as a shifted symbol is', () => {
    const index = enumerateProducers(compileLayout(shifted), 'fold');
    expect(index.bySymbol.has('ü')).toBe(false);
    expect(index.excludedByCase.map((p) => p.id)).toContain(
      'deadkey:dead/LTI#shifted+direct:base/RHM',
    );
    // Still a letter the layout can write: a shift press reaches it.
    expect(producibleSymbols(compileLayout(shifted)).has('ü')).toBe(true);
  });
});
