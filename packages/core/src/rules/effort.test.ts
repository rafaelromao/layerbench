import { describe, expect, it } from 'vitest';
import { normalizeText } from '../corpus/normalize.js';
import type { CompiledLayout } from '../layout/compile.js';
import { compileLayout } from '../layout/compile.js';
import { bundledLayout } from '../layouts/index.js';
import { simulate } from '../sim/resolver.js';
import { catalogRule } from './catalog.js';
import { CYANOPHAGE_EFFORT_GRID, cyanophageEffort, defaultEffort, THUMB_EFFORT } from './effort.js';
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

/** The key a symbol sits on in Qwerty's base layer. */
function keyFor(symbol: string): string {
  const base = qwerty.layout.layers[0].bindings;
  const id = Object.entries(base).find(([, b]) => b.kind === 'kp' && b.symbol === symbol)?.[0];
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
