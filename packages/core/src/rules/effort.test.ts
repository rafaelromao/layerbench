import { describe, expect, it } from 'vitest';
import { normalizeText } from '../corpus/normalize.js';
import type { CompiledLayout } from '../layout/compile.js';
import { compileLayout } from '../layout/compile.js';
import { bundledLayout, tapOf } from '../layouts/index.js';
import { simulate } from '../sim/resolver.js';
import { catalogRule } from './catalog.js';
import {
  CHORD_EXTRA_SHARE,
  CYANOPHAGE_EFFORT_GRID,
  chordEffort,
  chordShares,
  cyanophageEffort,
  defaultEffort,
  THUMB_EFFORT,
} from './effort.js';
import { evaluate } from './engine.js';
import type { Globals, RuleSet } from './types.js';

const OPTS = { caseMode: 'fold', crossWord: 'reset' } as const;
const qwerty = compileLayout(bundledLayout('qwerty')!);
const piano = compileLayout(bundledLayout('ben-vallack-piano')!);

function effortOf(text: string, globals: Partial<Globals> = {}, layout = qwerty): number {
  const sim = simulate(layout, normalizeText(text, OPTS), OPTS);
  const ruleSet: RuleSet = { globals, rules: [catalogRule('effort')!] };
  return evaluate(sim.tables, layout, ruleSet).results[0].value as number;
}

function thumbs(layout: CompiledLayout): string[] {
  return layout.keys.filter((k) => k.thumb).map((k) => k.id);
}

/** The key a symbol sits on in Qwerty's base layer, a home row mod's tap among them. */
function keyFor(symbol: string): string {
  const base = qwerty.layout.layers[0].bindings;
  const id = Object.entries(base).find(([, b]) => {
    const tap = tapOf(b);
    return tap?.kind === 'kp' && tap.symbol === symbol;
  })?.[0];
  if (!id) throw new Error(`no key types ${symbol}`);
  return id;
}

describe('effort', () => {
  it('reads cyanophage’s grid by position, for both hands', () => {
    const effort = defaultEffort(qwerty);
    // Top, home and bottom rows of the left hand, pinky to inner column.
    expect(['q', 'w', 'e', 'r', 't'].map((s) => effort[keyFor(s)])).toEqual(
      CYANOPHAGE_EFFORT_GRID[0].slice(1, 6),
    );
    expect(['a', 's', 'd', 'f', 'g'].map((s) => effort[keyFor(s)])).toEqual(
      CYANOPHAGE_EFFORT_GRID[1].slice(1, 6),
    );
    expect(['z', 'x', 'c', 'v', 'b'].map((s) => effort[keyFor(s)])).toEqual(
      CYANOPHAGE_EFFORT_GRID[2].slice(1, 6),
    );
    // The right hand mirrors: its inner column comes first reading left to right.
    expect(['y', 'u', 'i', 'o', 'p'].map((s) => effort[keyFor(s)])).toEqual(
      CYANOPHAGE_EFFORT_GRID[0].slice(6, 11),
    );
    expect(['h', 'j', 'k', 'l', ';'].map((s) => effort[keyFor(s)])).toEqual(
      CYANOPHAGE_EFFORT_GRID[1].slice(6, 11),
    );
  });

  it('charges a thumb press, where cyanophage’s own grid, which the simulator chooses on, does not', () => {
    const effort = defaultEffort(qwerty);
    const grid = cyanophageEffort(qwerty);
    expect(thumbs(qwerty).length).toBeGreaterThan(0);
    for (const id of thumbs(qwerty)) {
      expect(effort[id]).toBe(THUMB_EFFORT);
      expect(grid[id]).toBe(0);
    }
  });

  it('charges the thumb tapped for a layer: Piano types v with its one-shot, then the key', () => {
    const effort = defaultEffort(piano);
    expect(effort.R1).toBe(THUMB_EFFORT);
    // One character, two presses: R1 taps Alpha 2, LTR types v there.
    expect(effortOf('v', {}, piano)).toBeCloseTo(577 * (effort.R1 + effort.LTR), 6);
  });

  it('never charges a space, though a thumb types it', () => {
    expect(thumbs(qwerty)).toContain(qwerty.layout.keys?.space);
    // With the space in the stream: a 1 + b 8 + space 0 + c 2 + d 0 = 11 over five presses.
    expect(effortOf('ab cd', { universe: 'with_space' })).toBeCloseTo((577 * 11) / 5, 6);
  });

  it('is 577 × Σ effort ÷ keystrokes, spaces counted as keystrokes that cost nothing', () => {
    // a 1 + b 8 + space 0 + c 2 + d 0 = 11 over five presses.
    expect(effortOf('ab cd')).toBeCloseTo((577 * 11) / 5, 6);
    // Home-row index keys cost nothing at all.
    expect(effortOf('fj fj')).toBe(0);
  });
});

describe('what a chord costs', () => {
  it('charges the costliest key in full and every other at a share of its own', () => {
    expect(CHORD_EXTRA_SHARE).toBe(0.5);
    expect(chordShares([3, 1])).toEqual([3, 0.5]);
    expect(chordShares([1, 3])).toEqual([0.5, 3]);
    expect(chordShares([5, 0, 2])).toEqual([5, 0, 1]);
    // Equal keys: the first is the full one.
    expect(chordShares([2, 2])).toEqual([2, 1]);
  });

  it('charges one key what it costs, and a chord between one key and two', () => {
    expect(chordShares([4])).toEqual([4]);
    expect(chordEffort([4])).toBe(4);
    expect(chordEffort([2, 2])).toBe(3);
    expect(chordEffort([2, 2])).toBeGreaterThan(2);
    expect(chordEffort([2, 2])).toBeLessThan(4);
    // A free key beside a dear one adds nothing.
    expect(chordEffort([0, 6])).toBe(6);
  });

  describe('in the Effort rule', () => {
    const kp = (symbol: string) => ({ kind: 'kp' as const, symbol });
    /** `y` on a chord of the bottom pinky (3) and ring (2), the one way to type it. */
    const layout = compileLayout({
      format: 'layerbench/layout@1',
      name: 'A chord',
      hostLocale: 'symbols',
      geometry: { preset: '3x5+2' },
      keys: { space: 'L0' },
      layers: [{ id: 'base', bindings: { L0: kp(' ') } }],
      combos: [
        { id: 'c', keys: ['LBP', 'LBR'], binding: kp('y'), layers: ['base'], timeoutMs: 30 },
      ],
    });

    it('is the pair charged 3 + half of 2, not 5', () => {
      expect(effortOf('y', {}, layout)).toBeCloseTo(577 * 4, 6);
    });

    it("credits each key with its share, so the keys' parts add up to the value", () => {
      const sim = simulate(layout, normalizeText('y', OPTS), OPTS);
      const ruleSet: RuleSet = { globals: {}, rules: [catalogRule('effort')!] };
      const r = evaluate(sim.tables, layout, ruleSet).results[0];
      const perKey = r.per_key ?? {};
      const part = (id: string) => perKey[layout.keys.findIndex((k) => k.id === id)] ?? 0;
      expect(part('LBP')).toBe(3);
      expect(part('LBR')).toBe(1);
      expect((part('LBP') + part('LBR')) * (r.key_scale ?? 0)).toBeCloseTo(r.value as number, 6);
    });
  });
});
