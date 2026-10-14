import { describe, expect, it } from 'vitest';
import type { KeyEvent } from '../sim/machine.js';
import { type PressLog, recordPresses, SHAPES, type Shape, type Universe } from './press-log.js';

function ev(pos: number, label: string, extra: Partial<KeyEvent> = {}): KeyEvent {
  return {
    kind: 'tap',
    pos,
    layer: 0,
    symbols: label,
    keyKind: 'alpha',
    label,
    leafKind: 'kp',
    reaches: null,
    wastedOneShot: false,
    underHold: 0,
    ...extra,
  };
}

const SPACE = ev(9, '␣', { keyKind: 'space', symbols: ' ' });

/** A text as words of single-character presses, recorded the way the resolver records it. */
function record(words: string[]): PressLog {
  const r = recordPresses();
  words.forEach((word, w) => {
    if (w > 0) {
      r.boundary('no_space');
      r.press(SPACE, 'with_space');
      r.symbol('with_space');
    }
    for (const ch of word) {
      r.press(ev(ch.charCodeAt(0) - 97, ch), 'both');
      r.symbol('both');
    }
  });
  return r.seal();
}

const SKIPS: Record<Shape, number[]> = {
  unigram: [0],
  bigram: [0, 1],
  trigram: [0, 1, 2],
  skip1: [0, 2],
  skip2: [0, 3],
  skip3: [0, 4],
};

/** The n-grams counted the slow way, keyed by the presses' labels. */
function naive(runs: string[][], shape: Shape): Map<string, number> {
  const offsets = SKIPS[shape];
  const span = offsets[offsets.length - 1];
  const out = new Map<string, number>();
  for (const run of runs) {
    for (let i = 0; i + span < run.length; i++) {
      const key = offsets.map((o) => run[i + o]).join(' ');
      out.set(key, (out.get(key) ?? 0) + 1);
    }
  }
  return out;
}

function asLabels(log: PressLog, universe: Universe, shape: Shape): Map<string, number> {
  const g = log.ngrams(universe, shape);
  const out = new Map<string, number>();
  for (let i = 0; i < g.size; i++) {
    const key = Array.from(
      g.ids.subarray(i * g.n, i * g.n + g.n),
      (id) => log.presses[id].label,
    ).join(' ');
    out.set(key, g.counts[i]);
  }
  return out;
}

describe('the press log', () => {
  const words = ['abcab', 'ba', 'cabcd', 'a', 'dcba'];
  const log = record(words);

  it('counts every shape in each universe as a slow recount does, in the order each was first made', () => {
    const noSpace = words.map((w) => [...w]);
    const withSpace = [words.flatMap((w, i) => (i > 0 ? ['␣', ...w] : [...w]))];
    for (const shape of SHAPES) {
      for (const [universe, runs] of [
        ['no_space', noSpace],
        ['with_space', withSpace],
      ] as const) {
        const want = naive(runs, shape);
        const got = asLabels(log, universe, shape);
        expect([...got.entries()], `${universe} ${shape}`).toEqual([...want.entries()]);
        const g = log.ngrams(universe, shape);
        expect(g.total).toBe([...want.values()].reduce((a, b) => a + b, 0));
        expect(g.textTotal).toBe(g.total);
      }
    }
  });

  it('gives each press its id in the order it was first made, with what it did', () => {
    expect(log.presses.map((p) => p.label)).toEqual(['a', 'b', 'c', '␣', 'd']);
    expect(log.presses.every((p, i) => p.id === i)).toBe(true);
    expect(log.presses[3]).toMatchObject({ kind: 'space', pos: 9, layer: 0, reaches: null });
  });

  it('counts the text apart from the presses: a press with no character of its own adds n-grams, not characters', () => {
    const r = recordPresses();
    r.press(ev(0, 'a'), 'both');
    r.symbol('both');
    r.press(ev(5, '→A2', { keyKind: 'layer_tap', symbols: '', reaches: 1 }), 'both');
    r.press(ev(1, 'b', { layer: 1 }), 'both');
    r.symbol('both');
    const g = r.seal().ngrams('no_space', 'bigram');
    expect(g.total).toBe(2);
    expect(g.textTotal).toBe(1);
  });

  it('finds the entries through a press, ascending and each once', () => {
    const g = log.ngrams('no_space', 'trigram');
    const a = log.presses.findIndex((p) => p.label === 'a');
    const through = g.through(a);
    expect(through).toEqual([...through].sort((x, y) => x - y));
    expect(new Set(through).size).toBe(through.length);
    for (let e = 0; e < g.size; e++) {
      const has = Array.from(g.ids.subarray(e * 3, e * 3 + 3)).includes(a);
      expect(through.includes(e)).toBe(has);
    }
    expect(g.through(999)).toEqual([]);
  });

  it('says what came after one press, and after two in a row, in the order each first came', () => {
    const id = (label: string) => log.presses.findIndex((p) => p.label === label);
    const label = (m: ReadonlyMap<number, number>) =>
      [...m].map(([p, c]) => [log.presses[p].label, c]);
    expect(label(log.next('no_space', [id('a')]))).toEqual([['b', 3]]);
    expect(label(log.next('with_space', [id('a')]))).toEqual([
      ['b', 3],
      ['␣', 2],
    ]);
    expect(label(log.next('no_space', [id('c'), id('a')]))).toEqual([['b', 2]]);
    expect(label(log.next('no_space', [id('d'), id('c')]))).toEqual([['b', 1]]);
    expect(log.next('no_space', [id('a')])).toBe(log.next('no_space', [id('a')]));
  });

  it('moves the keys at two positions of a layer and shares everything else', () => {
    const r = recordPresses();
    r.press(ev(0, 'a'), 'both');
    r.press(ev(1, 'b'), 'both');
    r.press(ev(1, 'B', { layer: 1 }), 'both');
    const before = r.seal();
    const after = before.moved(0, 0, 1);
    expect(after.presses.map((p) => [p.label, p.pos])).toEqual([
      ['a', 1],
      ['b', 0],
      ['B', 1],
    ]);
    expect(before.presses.map((p) => p.pos)).toEqual([0, 1, 1]);
    expect(after.ngrams('no_space', 'bigram')).toBe(before.ngrams('no_space', 'bigram'));
  });

  it('keeps presses apart that reach different layers under the same legend', () => {
    const r = recordPresses();
    r.press(ev(5, '→A2', { keyKind: 'layer_tap', symbols: '', reaches: 1 }), 'both');
    r.press(ev(5, '→A2', { keyKind: 'layer_tap', symbols: '', reaches: 2 }), 'both');
    r.press(ev(5, '→A2', { keyKind: 'layer_tap', symbols: '', reaches: 1 }), 'both');
    expect(r.seal().presses.map((p) => p.reaches)).toEqual([1, 2]);
  });

  it('holds at most 1024 presses, and nothing is recorded once it is sealed', () => {
    const r = recordPresses();
    for (let i = 0; i < 1024; i++) r.press(ev(i, `k${i}`), 'both');
    expect(() => r.press(ev(0, 'one more'), 'both')).toThrow('Too many presses');
    r.seal();
    expect(() => r.press(ev(0, 'k0'), 'both')).toThrow('sealed');
  });
});
