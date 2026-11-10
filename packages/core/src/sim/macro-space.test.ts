import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileLayout } from '../layout/compile.js';
import { parseLayout } from '../layout/schema.js';
import type { Binding, Layout } from '../layout/types.js';
import { withoutFeatures } from '../layout/without.js';
import type { Universe } from '../presses/press-log.js';
import { explain, type SimulateOptions, simulate } from './resolver.js';

/**
 * A macro that types a mark and then a space, `, ` or `. `, on one key: one press whose space is the
 * word's. It ends the word, and it is counted with Space on only, as the space bar's press is.
 */

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });
const macro = (...steps: Binding[]): Binding => ({ kind: 'macro', steps });
const commaSpace = macro(kp(','), kp(' '));

/** Letters on the home row, space on the left thumb, and `extra` on the right thumb. */
function board(extra: Record<string, Binding> = {}): Layout {
  return {
    format: 'layerbench/layout@1',
    name: 'Macro space',
    hostLocale: 'symbols',
    geometry: { preset: '1333+2' },
    keys: { space: 'L0' },
    layers: [
      {
        id: 'base',
        bindings: {
          LHR: kp('a'),
          LHM: kp('b'),
          LHI: kp('c'),
          RHI: kp('d'),
          RHM: kp('e'),
          RHR: kp('n'),
          L0: kp(' '),
          ...extra,
        },
      },
    ],
  };
}

/** The `, ` macro on a tap, the comma alone on its hold, as the owner's Magic Gust has it. */
const withMacro = board({ R0: { kind: 'hold_tap', tap: commaSpace, hold: kp(',') } });
/** The comma on a key of its own, and the space bar. */
const withComma = board({ R0: kp(',') });

const fold: SimulateOptions = { caseMode: 'fold', crossWord: 'reset' };
const model: SimulateOptions = { caseMode: 'model', crossWord: 'reset' };

function run(layout: Layout, text: string, opts: SimulateOptions = fold) {
  const compiled = compileLayout(layout);
  const r = simulate(compiled, text, opts);
  const t = explain(compiled, text, opts);
  const log = r.tables.presses;
  const labels = (universe: Universe, shape: 'unigram' | 'bigram') => {
    const g = log.ngrams(universe, shape);
    const out: string[] = [];
    for (let i = 0; i < g.size; i++) {
      const ids = Array.from(g.ids.subarray(i * g.n, i * g.n + g.n));
      out.push(ids.map((id) => log.presses[id].label).join(' '));
    }
    return out;
  };
  return {
    stats: r.tables.stats,
    unproducible: Object.fromEntries(r.coverage.unproducible),
    out: t.steps.map((s) => s.symbols).join(''),
    keys: t.steps.filter((s) => s.kind !== 'hold_release').map((s) => s.key),
    log,
    labels,
    words: [...r.tables.words.keys()],
    traces: r.tables.words,
  };
}

describe('a macro that types a mark and a space', () => {
  it('types `, ` with one press, the mark and the word’s space', () => {
    const r = run(withMacro, 'ab, cd');
    expect(r.out).toBe('ab, cd');
    expect(r.keys).toEqual(['LHR', 'LHM', 'R0', 'LHI', 'RHI']);
    expect(r.stats.keystrokes).toBe(5);
    expect(r.stats.macro_presses).toBe(1);
    // The comma is a symbol; the space is not, as no space is.
    expect(r.stats.symbols).toBe(5);
    // Not the space bar: it typed a comma too, and costs as a key.
    expect(r.stats.space_presses).toBe(0);
  });

  it('ends the word, so the next letter starts one', () => {
    const r = run(withMacro, 'ab, cd, e');
    expect(r.stats.words).toBe(3);
    expect(r.words).toEqual(['ab,', 'cd,', 'e']);
    // The same words as the comma and the space bar make.
    const apart = run(withComma, 'ab, cd, e');
    expect(apart.stats.words).toBe(3);
    expect(apart.words).toEqual(r.words);
  });

  it('is counted with Space on, not with it off', () => {
    const r = run(withMacro, 'ab, cd');
    expect(r.labels('with_space', 'unigram')).toContain(',␣');
    expect(r.labels('no_space', 'unigram')).not.toContain(',␣');
    expect(r.log.ngrams('with_space', 'unigram').total).toBe(5);
    expect(r.log.ngrams('no_space', 'unigram').total).toBe(4);
    // The text is the text, however it is typed: five symbols and a space.
    expect(r.log.ngrams('no_space', 'unigram').textTotal).toBe(5);
    expect(r.log.ngrams('with_space', 'unigram').textTotal).toBe(6);
    const apart = run(withComma, 'ab, cd');
    expect(apart.log.ngrams('no_space', 'unigram').textTotal).toBe(5);
    expect(apart.log.ngrams('with_space', 'unigram').textTotal).toBe(6);
  });

  it('pairs with the letters on each side of it with Space on, as the space bar does', () => {
    const r = run(withMacro, 'ab, cd');
    expect(r.labels('with_space', 'bigram')).toEqual(['a b', 'b ,␣', ',␣ c', 'c d']);
    // With Space off the words do not pair across it (`reset`)…
    expect(r.labels('no_space', 'bigram')).toEqual(['a b', 'c d']);
    // …and do when pairs bridge words, the macro left out.
    const bridged = run(withMacro, 'ab, cd', { ...fold, crossWord: 'bridge' });
    expect(bridged.labels('no_space', 'bigram')).toEqual(['a b', 'b c', 'c d']);
  });

  it('makes a same-finger pair with the letter before it on its finger, with Space on', () => {
    // `n` is on the right ring finger; the macro on the right ring finger's top key.
    const ring = board({ RTR: commaSpace });
    const r = run(ring, 'an, d');
    expect(r.keys).toEqual(['LHR', 'RHR', 'RTR', 'RHI']);
    expect(r.labels('with_space', 'bigram')).toContain('n ,␣');
    expect(r.labels('no_space', 'bigram')).not.toContain('n ,␣');
  });

  it('is the last press of its word in the words table, as the comma key is', () => {
    const r = run(withMacro, 'ab, cd');
    const apart = run(withComma, 'ab, cd');
    const word = (x: typeof r) => {
      const t = x.traces.get('ab,');
      return t && { presses: t.presses, labels: t.keys.map((id) => x.log.presses[id].label) };
    };
    expect(word(r)).toEqual({ presses: 3, labels: ['a', 'b', ',␣'] });
    expect(word(apart)).toEqual({ presses: 3, labels: ['a', 'b', ','] });
  });

  it('leaves a word with its space alone: its letters are typed one by one', () => {
    const words = board({ R0: macro(kp('a'), kp('n'), kp('d'), kp(' ')), RTI: kp(',') });
    const r = run(words, 'b and c');
    expect(r.out).toBe('b and c');
    expect(r.stats.macro_presses).toBe(0);
    expect(r.keys).toEqual(['LHM', 'L0', 'LHR', 'RHR', 'RHI', 'L0', 'LHI']);
  });

  it('is pressed on a layer held for it, and on a one-shot layer', () => {
    const layered = (hold: Binding): Layout => {
      const l = board({ R0: hold });
      l.layers.push({ id: 'marks', bindings: { RTI: commaSpace } });
      return l;
    };
    const held = run(layered({ kind: 'mo', layer: 'marks' }), 'ab, cd');
    expect(held.out).toBe('ab, cd');
    expect(held.keys).toEqual(['LHR', 'LHM', 'R0', 'RTI', 'LHI', 'RHI']);
    expect(held.stats.words).toBe(2);
    expect(held.labels('with_space', 'unigram')).toContain(',␣');
    const once = run(layered({ kind: 'sl', layer: 'marks' }), 'ab, cd');
    expect(once.keys).toEqual(['LHR', 'LHM', 'R0', 'RTI', 'LHI', 'RHI']);
    // The one-shot is the word's, in both universes; the macro, Space on only.
    expect(once.log.ngrams('no_space', 'unigram').total).toBe(5);
    expect(once.log.ngrams('with_space', 'unigram').total).toBe(6);
    expect(once.stats.words).toBe(2);
  });

  it('is pressed as a combo', () => {
    const combo = board();
    combo.combos = [{ id: 'cs', keys: ['RHI', 'RHM'], binding: commaSpace }];
    const r = run(combo, 'ab, cd');
    expect(r.out).toBe('ab, cd');
    expect(r.stats.chords).toBe(1);
    expect(r.stats.words).toBe(2);
    expect(r.labels('with_space', 'unigram')).toContain(',␣');
    expect(r.labels('no_space', 'unigram')).not.toContain(',␣');
  });

  it('types the same in the model case', () => {
    const r = run(withMacro, 'ab, cd', model);
    expect(r.out).toBe('ab, cd');
    expect(r.keys).toEqual(['LHR', 'LHM', 'R0', 'LHI', 'RHI']);
    expect(r.stats.words).toBe(2);
  });

  it('wins over the comma and the space bar: one press for two', () => {
    const both = board({ R0: commaSpace, RTI: kp(',') });
    const r = run(both, 'ab, cd');
    expect(r.keys).toEqual(['LHR', 'LHM', 'R0', 'LHI', 'RHI']);
    expect(run(withComma, 'ab, cd').keys).toEqual(['LHR', 'LHM', 'R0', 'L0', 'LHI', 'RHI']);
  });

  it('leaves the hold to type the comma alone where no space follows', () => {
    const r = run(withMacro, 'ab,cd');
    expect(r.out).toBe('ab,cd');
    expect(r.stats.macro_presses).toBe(0);
    expect(r.stats.hold_presses).toBe(1);
    expect(r.stats.words).toBe(1);
  });

  it('is a multi-letter macro: ranked without them, the hold and the space bar type it', () => {
    const r = run(withoutFeatures(withMacro, ['macros']), 'ab, cd');
    expect(r.out).toBe('ab, cd');
    expect(r.keys).toEqual(['LHR', 'LHM', 'R0', 'L0', 'LHI', 'RHI']);
    expect(r.stats.macro_presses).toBe(0);
  });

  it('types a comma only before a space when it is the only comma', () => {
    const only = board({ R0: commaSpace });
    expect(run(only, 'ab, cd').unproducible).toEqual({});
    expect(run(only, 'ab,cd').unproducible).toEqual({ ',': 1 });
    // At the end of the text no space follows.
    expect(run(only, 'ab,').unproducible).toEqual({ ',': 1 });
  });

  it('leaves no capital with a plain space, and one with a sentence space', () => {
    const plain = board({ R0: macro(kp('.'), kp(' ')) });
    expect(run(plain, 'ab. cd', model).out).toBe('ab. cd');
    const sentence = board({ R0: macro(kp('.'), { kind: 'sentence_space' }) });
    const r = run(sentence, 'ab. Cd', model);
    expect(r.out).toBe('ab. Cd');
    // The capital is the sentence's: no Shift is pressed for it.
    expect(r.keys).toEqual(['LHR', 'LHM', 'R0', 'LHI', 'RHI']);
    expect(r.stats.words).toBe(2);
  });
});

describe("the owner's Magic Gust", () => {
  const gust = parseLayout(
    JSON.parse(readFileSync(new URL('../../fixtures/magic-gust.json', import.meta.url), 'utf8')),
  );

  it('has the `, ` and `. ` macros on the taps of Alpha 2’s and Alpha 3’s left thumbs', () => {
    for (const id of ['alpha-2', 'alpha-3']) {
      const b = gust.layers.find((l) => l.id === id)?.bindings ?? {};
      expect(b.L0).toEqual({ kind: 'hold_tap', tap: commaSpace, hold: macro(kp(',')) });
      expect(b.L1).toEqual({
        kind: 'hold_tap',
        tap: macro(kp('.'), kp(' ')),
        hold: macro(kp('.')),
      });
    }
  });

  it('types `, ` and `. ` with those taps', () => {
    const r = run(gust, 'tea, cat. no');
    expect(r.out).toBe('tea, cat. no');
    const steps = explain(compileLayout(gust), 'tea, cat. no', fold).steps;
    const macros = steps.filter((s) => s.symbols.endsWith(' '));
    expect(macros.map((s) => [s.key, s.symbols])).toEqual([
      ['L0', ', '],
      ['L1', '. '],
    ]);
    expect(macros.every((s) => s.layer === 'Alpha 2' || s.layer === 'Alpha 3')).toBe(true);
    expect(r.stats.macro_presses).toBe(2);
    expect(r.stats.words).toBe(3);
    expect(r.labels('with_space', 'unigram')).toEqual(expect.arrayContaining([',␣', '.␣']));
    // No space bar: each macro typed its word's space.
    expect(r.stats.space_presses).toBe(0);
  });

  it('types the mark alone where no space follows', () => {
    const r = run(gust, 'tea,cat');
    expect(r.out).toBe('tea,cat');
    expect(r.stats.words).toBe(1);
    expect(r.labels('with_space', 'unigram')).not.toContain(',␣');
  });
});
