import { getPreset } from '@layerbench/core/rules';
import { describe, expect, it } from 'vitest';
import { decodeRuleSnapshot, encodeRuleSnapshot } from './rule-snapshot.js';

describe('portable custom rule snapshots', () => {
  it('round-trips a validated rule set in a versioned fragment value', () => {
    const rules = { ...getPreset('cyanophage'), id: 'strict', name: 'Strict' };
    const snapshot = encodeRuleSnapshot(rules);

    expect(snapshot.startsWith('v1.')).toBe(true);
    expect(decodeRuleSnapshot(snapshot)).toEqual({ ok: true, ruleSet: rules });
  });

  it('rejects unsupported, malformed, invalid and oversized snapshots with a usable reason', () => {
    expect(decodeRuleSnapshot('v2.abc')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/version/i),
    });
    expect(decodeRuleSnapshot('v1.%%%')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/invalid/i),
    });
    expect(decodeRuleSnapshot('v1.e30')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/rule-set snapshot/i),
    });
    expect(() =>
      encodeRuleSnapshot({
        ...getPreset('cyanophage'),
        description: 'x'.repeat(2_000_001),
      }),
    ).toThrow(/too large/i);
  });
});
