import { describe, expect, it } from 'vitest';
import { normalizeText } from '../corpus/normalize.js';
import { FIXTURE_MIXED } from '../fixtures/index.js';
import { compileLayout } from '../layout/compile.js';
import { importTextLayout } from '../layout/text.js';
import type { Layout } from '../layout/types.js';
import { CLASSIC_LAYOUTS } from '../layouts/classic.js';
import { magicRomak, romak24, romak34 } from '../layouts/romak.js';
import { explain, simulate } from './resolver.js';

const opts = { caseMode: 'fold' as const, crossWord: 'reset' as const };

function trace(layout: Layout, text: string, extra: Partial<Parameters<typeof explain>[2]> = {}) {
  const compiled = compileLayout(layout);
  const r = explain(compiled, text, { ...opts, ...extra });
  return {
    ...r,
    keys: r.steps.filter((s) => s.kind !== 'hold_release').map((s) => s.key),
    out: r.steps.map((s) => s.symbols).join(''),
  };
}

describe('Romak acceptance traces (SPEC §11.3)', () => {
  it('ação with the ão macro enabled: a · ² · ç · ão (4 presses)', () => {
    const t = trace(romak24, 'ação');
    expect(t.out).toBe('ação');
    expect(t.keys).toEqual(['RHM', 'R0', 'LBM', 'LHI']);
    expect(t.presses).toBe(4);
  });

  it('ação with the ão macro disabled: a · ² · ç · ã · o (5 presses)', () => {
    const t = trace(romak24, 'ação', {
      typingPaths: { ão: [{ producer: 'macro:ccedil/LHI', enabled: false }] },
    });
    expect(t.out).toBe('ação');
    expect(t.keys).toEqual(['RHM', 'R0', 'LBM', 'RHI', 'RTM']);
  });

  it('açúcar needs a second alpha-2 activation (from the Ç extension thumb)', () => {
    const t = trace(romak24, 'açúcar');
    expect(t.out).toBe('açúcar');
    const activations = t.steps.filter((s) => s.keyKind === 'layer_tap');
    expect(activations.length).toBe(2);
    expect(t.keys).toEqual(['RHM', 'R0', 'LBM', 'L1', 'RTR', 'LBM', 'RHM', 'RHI']);
  });

  it('chave uses the magic key for h (after consonant) and v (after vowel): 5 presses', () => {
    const t = trace(magicRomak, 'chave');
    expect(t.out).toBe('chave');
    expect(t.keys).toEqual(['LBM', 'RBI', 'RHM', 'RBI', 'RHR']);
  });

  it('doubled letters use the repeat key when the policy says so', () => {
    const t = trace(magicRomak, 'hello');
    expect(t.out).toBe('hello');
    expect(t.keys).toEqual(['RBI', 'RHR', 'RTI', 'L1', 'RTM']);
    const t2 = trace(magicRomak, 'hello', { repeatPolicy: 'tap_twice' });
    expect(t2.keys).toEqual(['RBI', 'RHR', 'RTI', 'RTI', 'RTM']);
  });

  it('sentence case (model mode): the letter after ". " needs no shift press', () => {
    const t = trace(magicRomak, 'x. Ab', { caseMode: 'model' });
    expect(t.out).toBe('x. Ab');
    expect(t.steps.filter((s) => s.keyKind === 'shift').length).toBe(0);
    const t2 = trace(magicRomak, 'Ab', { caseMode: 'model' });
    expect(t2.out).toBe('Ab');
    expect(t2.steps.filter((s) => s.keyKind === 'shift').length).toBe(1);
  });

  it('shifted alpha-2 twin: an uppercase accented letter uses shift then the layer key', () => {
    const t = trace(magicRomak, 'É', { caseMode: 'model' });
    expect(t.out).toBe('É');
    expect(t.keys[0]).toBe('R1');
    expect(t.keys).toContain('R0');
  });

  it('greedy tokenization: qu is one press', () => {
    const t = trace(romak24, 'quando');
    expect(t.out).toBe('quando');
    expect(t.keys).toEqual(['R0', 'LTM', 'RHM', 'LHR', 'LHP', 'RTM']);
  });

  it('Romak 34 types accents and plain letters', () => {
    const t = trace(romak34, 'não é');
    expect(t.out).toBe('não é');
  });
});

describe('simulate — tables and coverage', () => {
  it('unproducible symbols are reported and act as boundaries', () => {
    const compiled = compileLayout(romak24);
    const r = simulate(compiled, normalizeText('ab#cd ok', opts), opts);
    // `#` is dropped by normalization; use a producible stream and check counts
    expect(r.coverage.unproducible.size).toBe(0);
    expect(r.tables.stats.words).toBe(2);
    const r2 = simulate(compiled, 'aßb', opts);
    expect(r2.coverage.unproducible.get('ß')).toBe(1);
    expect(r2.tables.noSpace.totals.bigram).toBe(0);
  });

  it('no-space universe resets at word boundaries in reset mode; with-space includes space keys', () => {
    const compiled = compileLayout(romak24);
    const stream = normalizeText('ab cd', opts);
    const r = simulate(compiled, stream, opts);
    expect(r.tables.noSpace.totals.unigram).toBe(4);
    expect(r.tables.noSpace.totals.bigram).toBe(2); // K − W = 4 − 2
    expect(r.tables.withSpace.totals.unigram).toBe(5);
    expect(r.tables.withSpace.totals.bigram).toBe(4);
    const bridged = simulate(compiled, stream, { ...opts, crossWord: 'bridge' });
    expect(bridged.tables.noSpace.totals.bigram).toBe(3);
  });

  it('layer taps appear in the key stream and layer stats', () => {
    const compiled = compileLayout(romak24);
    const r = simulate(compiled, normalizeText('quero', opts), opts);
    expect(r.tables.stats.layer_taps).toBe(1);
    expect(r.tables.stats.keystrokes).toBe(5); // ² qu e r o
    expect(r.tables.stats.symbols).toBe(5);
  });

  it('every bundled layout simulates the fixture corpus without crashing', () => {
    const stream = normalizeText(FIXTURE_MIXED, opts);
    for (const layout of [magicRomak, romak24, romak34, ...CLASSIC_LAYOUTS]) {
      const compiled = compileLayout(layout);
      const r = simulate(compiled, stream, opts);
      expect(r.tables.stats.keystrokes).toBeGreaterThan(1000);
    }
  });

  it('Magic Romak covers the whole Portuguese fixture except soft punctuation', () => {
    const compiled = compileLayout(magicRomak);
    const r = simulate(compiled, normalizeText(FIXTURE_MIXED, opts), opts);
    expect([...r.coverage.unproducible.keys()]).toEqual([]);
  });
});

describe('text import', () => {
  it('imports a cyanophage 34-character string onto 3x5+2', () => {
    const { layout, overflow } = importTextLayout("qwertyuiop-asdfghjkl;'zxcvbnm,./\\^", '3x5+2');
    const b = layout.layers[0].bindings;
    expect(b.LTP).toEqual({ kind: 'kp', symbol: 'q' });
    expect(b.RTP).toEqual({ kind: 'kp', symbol: 'p' });
    expect(overflow).toEqual(['-', "'"]);
  });

  it('imports newline rows with a thumb row', () => {
    const { layout } = importTextLayout(
      'q w e r t y u i o p\na s d f g h j k l ;\nz x c v b n m , . /\ne space',
      '3x5+2',
    );
    expect(layout.layers[0].bindings.L1).toEqual({ kind: 'kp', symbol: 'e' });
    expect(layout.keys.space).toBe('L0');
  });
});

describe('the cheapest way to type a character', () => {
  const kp = (symbol: string) => ({ kind: 'kp' as const, symbol });
  /** A board where `x` is on two layers: one tapped straight from the base, one through another. */
  const twoWays = (extra: Partial<Layout> = {}): Layout => ({
    format: 'layoutmaster/layout@1',
    name: 'Two ways',
    hostLocale: 'symbols',
    geometry: { preset: '3x5+2' },
    keys: { space: 'L0' },
    layers: [
      {
        id: 'base',
        bindings: {
          L0: kp(' '),
          R0: { kind: 'sl', layer: 'mid' },
          L1: { kind: 'sl', layer: 'zz' },
          LBP: kp('y'),
          RHI: kp('y'),
        },
      },
      { id: 'mid', bindings: { '*': { kind: 'trans' }, LHM: { kind: 'sl', layer: 'aa' } } },
      // `aa` sorts first, so taking the first way that works would go through `mid` to get here.
      { id: 'aa', bindings: { '*': { kind: 'trans' }, RHI: kp('x') } },
      { id: 'zz', bindings: { '*': { kind: 'trans' }, RHI: kp('x') } },
    ],
    ...extra,
  });

  it('takes the layer that is a press closer', () => {
    const t = trace(twoWays(), 'x');
    expect(t.keys).toEqual(['L1', 'RHI']);
    expect(t.presses).toBe(2);
  });

  it('breaks a tie in presses by Effort: a home-row key over a bottom-row pinky', () => {
    // Both are one press on the base layer; the pinky's sorts first.
    expect(trace(twoWays(), 'y').keys).toEqual(['RHI']);
  });

  it('leaves no layer key held when another way costs the same, so a capital after ! needs no shift', () => {
    // `!` is two presses either way on Magic Romak: tap Alpha 2 and press a combo, or hold Symbols
    // and tap. Held, the thumb would still be down through the space, and its release would end
    // the shift sentence case armed for the capital.
    const t = trace(magicRomak, 'oi! Ola', { caseMode: 'model' });
    expect(t.out).toBe('oi! Ola');
    expect(t.keys).not.toContain('R1');
    expect(t.presses).toBe(8);
  });

  it('keeps an order set by hand, whatever it costs', () => {
    const t = trace(twoWays({ typingPaths: { y: [{ producer: 'direct:base/LBP' }] } }), 'y');
    expect(t.keys).toEqual(['LBP']);
    const far = trace(twoWays({ typingPaths: { x: [{ producer: 'direct:aa/RHI' }] } }), 'x');
    expect(far.keys).toEqual(['R0', 'LHM', 'RHI']);
  });
});

describe('the kind of key a press is, in the statistics', () => {
  it('counts a magic key on the tap of a tap-hold among the adaptive presses', () => {
    const magic = {
      kind: 'adaptive' as const,
      default: { kind: 'kp' as const, symbol: 'h' },
      triggers: [{ afterAny: ['a'], binding: { kind: 'kp' as const, symbol: 'v' } }],
    };
    const layout: Layout = {
      format: 'layoutmaster/layout@1',
      name: 'Held magic',
      hostLocale: 'symbols',
      geometry: { preset: '3x5+2' },
      keys: { space: 'L0' },
      layers: [
        {
          id: 'base',
          bindings: {
            L0: { kind: 'kp', symbol: ' ' },
            LHM: { kind: 'kp', symbol: 'a' },
            LHR: { kind: 'hold_tap', tap: magic, hold: { kind: 'mod', mod: 'LGUI' } },
          },
        },
      ],
    };
    // h from the default, then v from the branch after a.
    const compiled = compileLayout(layout);
    const sim = simulate(compiled, normalizeText('ha av', { caseMode: 'fold' }), opts);
    expect(sim.tables.stats.adaptive_presses).toBe(2);
    expect(sim.tables.stats.adaptive_trigger_hits).toBe(2);
    // One logical key per legend it typed, both of them the magic key they are.
    const lhr = compiled.keyIndex.get('LHR');
    const atKey = sim.tables.registry.all().filter((k) => k.pos === lhr);
    expect(atKey.map((k) => [k.label, k.keyKind])).toEqual([
      ['h', 'magic'],
      ['v', 'magic'],
    ]);
  });
});
