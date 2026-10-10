import { beforeAll, describe, expect, it } from 'vitest';
import type { Layout } from '../layout/types.js';
import { CLASSIC_LAYOUTS, SMALL_LAYOUTS } from '../layouts/index.js';
import { toLayout } from './emit.js';
import { scoreLayout } from './engine.js';
import {
  type Board,
  board3x5,
  CONFIGS,
  type Config,
  type Design,
  emptyDesign,
  FastScorer,
  makeSlots,
  PRESET,
  place,
  randomDesign,
  rng,
  scoreExact,
} from './model.js';
import { buildSample, LETTERS, loadSample, type Sample, SYMBOLS } from './tables.js';

/**
 * The generator's scorers against the engine, on the request the Library makes. The fast scorer
 * drives the search, so it must agree with the exact pass; the exact pass decides what is kept, so
 * it must agree with the engine.
 */

let sample: Sample;
let board: Board;

beforeAll(async () => {
  sample = await loadSample();
  board = board3x5();
}, 60_000);

/** A bundled layout as a design: one layer of plain keys on the 3×5+2 board. */
function designOf(layout: Layout): Design | null {
  if (!('preset' in layout.geometry) || layout.geometry.preset !== PRESET) return null;
  if (layout.layers.length !== 1 || layout.combos?.length || layout.fingering) return null;
  const bindings = layout.layers[0].bindings;
  const index = new Map(SYMBOLS.map((s, i) => [s, i] as const));
  const letterThumbs: string[] = [];
  const placed: [string, number][] = [];
  for (const [id, b] of Object.entries(bindings)) {
    if (b.kind !== 'kp' || b.symbol === undefined) return null;
    if (id === layout.keys.space) continue;
    const key = board.byId.get(id);
    if (!key) return null;
    const symbol = index.get(b.symbol);
    if (symbol === undefined) continue;
    if (key.thumb) letterThumbs.push(id);
    placed.push([id, symbol]);
  }
  const config: Config = {
    id: `flat:${layout.id}`,
    space: layout.keys.space,
    osl: null,
    rep: null,
    letterThumbs,
    layers: 1,
    description: '',
  };
  const design = emptyDesign(board, config, SYMBOLS.length);
  const slots = makeSlots(board, config);
  for (const [id, symbol] of placed) {
    const slot = slots.findIndex((s) => s.key.id === id);
    place(design, symbol, slot);
  }
  return design;
}

describe('the sample', () => {
  it('is cut where the engine cuts it', () => {
    let nonSpace = 0;
    for (const t of sample.tokens) if (t !== -1) nonSpace++;
    expect(nonSpace).toBe(100_000);
    const design = randomDesign(board, CONFIGS.c1, SYMBOLS.length, rng(1));
    const engine = scoreLayout(toLayout(design, sample, { name: 'cut' }), sample);
    const exact = scoreExact(sample, design);
    expect(exact.chars).toBe(engine.symbols);
    expect(exact.words).toBe(engine.words);
    expect(exact.chars).toBe(sample.chars);
    expect(exact.words).toBe(sample.words);
  });
});

describe('the exact pass', () => {
  it('scores bundled flat layouts as the engine does', () => {
    let checked = 0;
    // The bundled layouts as written, one layer each, before the default layers join them.
    for (const layout of [...CLASSIC_LAYOUTS, ...SMALL_LAYOUTS]) {
      const design = designOf(layout);
      if (!design) continue;
      const exact = scoreExact(sample, design);
      const engine = scoreLayout(layout, sample);
      expect(exact.effort, layout.id).toBeCloseTo(engine.effort, 6);
      expect(exact.sfb, layout.id).toBeCloseTo(engine.sfb, 6);
      expect(exact.chars, layout.id).toBe(engine.symbols);
      expect(exact.words, layout.id).toBe(engine.words);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  }, 120_000);

  it('scores random two-layer designs as the engine does, repeat key and thumb letters included', () => {
    for (const config of [CONFIGS.c1, CONFIGS.c2, CONFIGS.c3, CONFIGS.c4]) {
      for (let seed = 1; seed <= 3; seed++) {
        const design = randomDesign(board, config, SYMBOLS.length, rng(seed * 101 + 7));
        const layout = toLayout(design, sample, { name: `${config.id} ${seed}` });
        const exact = scoreExact(sample, design);
        const engine = scoreLayout(layout, sample);
        const label = `${config.id} seed ${seed}`;
        expect(exact.effort, label).toBeCloseTo(engine.effort, 6);
        expect(exact.sfb, label).toBeCloseTo(engine.sfb, 6);
        expect(exact.taps, label).toBeCloseTo(engine.tapsPer100, 6);
      }
    }
  }, 120_000);
});

describe('the exact pass with a one-shot shift', () => {
  it('scores a one-layer design with a thumb letter, repeat key and shift as the engine does', () => {
    const symbols = [...LETTERS, ',', '.', "'", '-'];
    const s = rebuild(sample, symbols);
    for (let seed = 1; seed <= 3; seed++) {
      const design = randomDesign(board, CONFIGS.c5, symbols.length, rng(seed * 59 + 3));
      const layout = toLayout(design, s, { name: `c5 ${seed}` });
      expect(layout.keys.shift).toEqual({ key: 'R1', kind: 'sk' });
      const exact = scoreExact(s, design);
      const engine = scoreLayout(layout, s);
      expect(exact.effort, `seed ${seed}`).toBeCloseTo(engine.effort, 6);
      expect(exact.sfb, `seed ${seed}`).toBeCloseTo(engine.sfb, 6);
      expect(engine.tapsPer100, `seed ${seed}`).toBe(0);
    }
  });
});

describe('the fast scorer', () => {
  it('equals the exact pass without a repeat key, and keeps up through swaps', () => {
    for (const config of [CONFIGS.flat, CONFIGS.c1]) {
      const symbols = config.layers === 1 ? [...LETTERS, ',', '.', "'", '-'] : SYMBOLS;
      const s = config.layers === 1 ? rebuild(sample, symbols) : sample;
      const rand = rng(42);
      const design = randomDesign(board, config, symbols.length, rand);
      const fast = new FastScorer(s, design);
      const check = (): void => {
        const exact = scoreExact(s, fast.design);
        expect(fast.effortSum).toBeCloseTo(exact.effortSum, 6);
        expect(fast.sfbPairs).toBeCloseTo(exact.sfbPairs, 6);
        expect(fast.oslTaps).toBeCloseTo(exact.oslTaps, 6);
      };
      check();
      const n = design.slots.length;
      for (let k = 0; k < 300; k++) {
        const i = Math.floor(rand() * n);
        const j = Math.floor(rand() * n);
        if (i === j) continue;
        fast.swap(i, j);
        if (k % 50 === 0) check();
      }
      check();
    }
  });

  it('stays within a hair of the exact pass with a repeat key', () => {
    for (const config of [CONFIGS.c2, CONFIGS.c3, CONFIGS.c4]) {
      const rand = rng(7);
      const design = randomDesign(board, config, SYMBOLS.length, rand);
      const fast = new FastScorer(sample, design);
      const n = design.slots.length;
      for (let k = 0; k < 200; k++) {
        const i = Math.floor(rand() * n);
        const j = Math.floor(rand() * n);
        if (i !== j) fast.swap(i, j);
      }
      const exact = scoreExact(sample, fast.design);
      expect(Math.abs(fast.effort - exact.effort), config.id).toBeLessThan(2);
      expect(Math.abs(fast.sfb - exact.sfb), config.id).toBeLessThan(0.03);
      expect(Math.abs(fast.taps - exact.taps), config.id).toBeLessThan(0.1);
    }
  });
});

/** Same text, fewer symbols: what a flat design leaves out is skipped, as the engine skips it. */
function rebuild(s: Sample, symbols: readonly string[]): Sample {
  return buildSample(s.text, s.settings, symbols);
}
