import { describe, expect, it } from 'vitest';
import { ruleSetFromJson, safeParseRuleSet } from './serialize.js';

describe('rule-set serialization', () => {
  it('drops globals the engine no longer has, so sets saved with them still load', () => {
    const parsed = safeParseRuleSet({
      globals: {
        universe: 'with_space',
        normalization: 'percent_of_keystrokes',
        repeats_count_as_sfb: true,
      },
      rules: [],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.ruleSet.globals).toEqual({ universe: 'with_space' });
  });

  it('rejects a predicate outside the vocabulary rather than matching everything', () => {
    const of = (where: unknown) => ruleSetFromJson(JSON.stringify({ rules: [{ id: 'r', where }] }));
    const bare = of({ min_run: 3 });
    expect(bare.ok).toBe(false);
    if (!bare.ok) expect(bare.error).toContain('Unrecognized key: "min_run"');
    // Inside a combinator, zod names only the rule's `where`, not the key.
    expect(of({ all: [{ same_hand: true }, { min_run: 3 }] }).ok).toBe(false);
  });
});
