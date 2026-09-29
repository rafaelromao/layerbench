import { describe, expect, it } from 'vitest';
import { normalizeText } from '../corpus/normalize.js';
import { compileLayout } from '../layout/compile.js';
import { bundledLayout } from '../layouts/index.js';
import { simulate } from '../sim/resolver.js';
import { catalogRule } from './catalog.js';
import { CYANOPHAGE_EFFORT_GRID, defaultEffort } from './effort.js';
import { evaluate } from './engine.js';
import type { RuleSet } from './types.js';

const OPTS = { caseMode: 'fold', crossWord: 'reset' } as const;
const qwerty = compileLayout(bundledLayout('qwerty')!);

function effortOf(text: string): number {
  const sim = simulate(qwerty, normalizeText(text, OPTS), OPTS);
  const ruleSet: RuleSet = { globals: {}, rules: [catalogRule('effort')!] };
  return evaluate(sim.tables, qwerty, ruleSet).results[0].value as number;
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

  it('costs nothing on a thumb, as cyanophage does', () => {
    const effort = defaultEffort(qwerty);
    for (const k of qwerty.keys.filter((key) => key.thumb)) expect(effort[k.id]).toBe(0);
  });

  it('is 577 × Σ effort ÷ keystrokes, spaces counted as keystrokes that cost nothing', () => {
    // a 1 + b 8 + space 0 + c 2 + d 0 = 11 over five presses.
    expect(effortOf('ab cd')).toBeCloseTo((577 * 11) / 5, 6);
    // Home-row index keys cost nothing at all.
    expect(effortOf('fj fj')).toBe(0);
  });
});
