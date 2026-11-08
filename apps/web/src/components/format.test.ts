import { bundledLayout, compileLayout, type RuleItem } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { describeKeys } from './format.js';

// Magic Romak types a doubled letter with its Repeat key, on the left thumb beside the space bar.
const compiled = compileLayout(
  bundledLayout('magic-romak') as NonNullable<ReturnType<typeof bundledLayout>>,
);
const at = (id: string) => compiled.keyIndex.get(id) as number;
const item = (ids: string[], extra: Partial<RuleItem> = {}): RuleItem => ({
  label: '⟳␣',
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

  it('names a combo by the keys pressed together, not the id it is stored under', () => {
    const combo = compiled.combos[0];
    const id = combo.keys.map((k) => compiled.positions[k].id).join('+');
    const named = describeKeys(compiled, { label: 'x', keys: [combo.pos, at('L0')] });
    expect(named?.startsWith(`${id} (`)).toBe(true);
    expect(named).not.toContain('combo:');
    expect(named).toContain('→ L0 (space / Numb)');
  });

  it('finds the finger a chord shares with a key, as the rules do', () => {
    const t34 = compileLayout(
      bundledLayout('t-34') as NonNullable<ReturnType<typeof bundledLayout>>,
    );
    const chord = t34.combos.find((c) => t34.positions[c.pos].fingers.length > 1);
    expect(chord, 'a combo pressed with two fingers').toBeDefined();
    const key = (chord as NonNullable<typeof chord>).keys[0];
    const finger = t34.positions[key].fingers[0];
    const named = describeKeys(t34, {
      label: 'x',
      keys: [(chord as NonNullable<typeof chord>).pos, key],
    });
    expect(named?.endsWith(`· same finger, ${finger}`)).toBe(true);
  });

  it('says the finger once for a run of three keys on it', () => {
    expect(describeKeys(compiled, item(['L1', 'L0', 'L1']))).toBe(
      'L1 (Repeat) → L0 (space / Numb) → L1 (Repeat) · same finger, LT',
    );
  });

  it('takes a key with no layer given to be on the first, and one it does not know by its number', () => {
    const named = describeKeys(compiled, item(['L0', 'R0'], { layers: [1] }));
    expect(named).toContain(`L0 (`);
    expect(named?.split(' → ')[0]).toContain(`on ${compiled.layers[1].name}`);
    expect(named?.split(' → ')[1]).not.toContain(' on ');
    expect(
      describeKeys(compiled, { label: 'x', keys: [9999, at('L0')] })?.startsWith('9999 →'),
    ).toBe(true);
  });
});
