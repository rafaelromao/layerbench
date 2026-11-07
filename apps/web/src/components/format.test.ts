import { bundledLayout, compileLayout, type RuleItem } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { describeKeys } from './format.js';

// Magic Romak types a doubled letter with its Repeat key, on the left thumb beside the space bar.
const compiled = compileLayout(
  bundledLayout('magic-romak') as NonNullable<ReturnType<typeof bundledLayout>>,
);
const at = (id: string) => compiled.keyIndex.get(id) as number;
const item = (ids: string[], extra: Partial<RuleItem> = {}): RuleItem => ({
  label: 'l␣',
  keys: ids.map(at),
  ...extra,
});

describe('describeKeys', () => {
  it('names the Repeat key that typed a doubled letter, and the space after it, on one thumb', () => {
    expect(describeKeys(compiled, item(['L1', 'L0']))).toBe(
      'L1 (Repeat) → L0 (space / Numb) · same finger, LT',
    );
  });

  it('leaves the finger out for keys on different fingers', () => {
    expect(describeKeys(compiled, item(['L0', 'R0']))).toBe('L0 (space / Numb) → R0 (A2 / Symb)');
  });

  it('does not call one key pressed twice a same-finger pair', () => {
    expect(describeKeys(compiled, item(['L0', 'L0']))).not.toContain('same finger');
  });

  it('says nothing for one key, whose label is its own', () => {
    expect(describeKeys(compiled, item(['L1']))).toBeNull();
  });

  it('names the layer a key was pressed on, past the first', () => {
    const named = describeKeys(compiled, item(['L0', 'R0'], { layers: [0, 1] }));
    expect(named).toContain(`on ${compiled.layers[1].name}`);
    expect(named?.startsWith('L0 (space / Numb) →')).toBe(true);
  });

  it('names a combo by the id its position has', () => {
    const combo = compiled.combos[0];
    const id = compiled.positions[combo.pos].id;
    const named = describeKeys(compiled, { label: 'x', keys: [combo.pos, at('L0')] });
    expect(named?.startsWith(`${id} (`)).toBe(true);
    expect(named).toContain('→ L0 (space / Numb)');
  });
});
