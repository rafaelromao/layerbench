import { describe, expect, it } from 'vitest';
import { toCanonicalJson } from './json.js';
import { safeParseLayout } from './schema.js';
import type { AdaptiveTrigger, Layout } from './types.js';

function withBranches(triggers: AdaptiveTrigger[]): Layout {
  return {
    format: 'layoutmaster/layout@1',
    name: 'Branches',
    geometry: { preset: '3x5+2' },
    keys: { space: 'L0' },
    layers: [
      {
        id: 'base',
        bindings: {
          LHM: { kind: 'adaptive', default: { kind: 'kp', symbol: 'h' }, triggers },
        },
      },
    ],
  };
}

const branchesOf = (l: Layout) => {
  const b = l.layers[0].bindings.LHM;
  return b.kind === 'adaptive' ? b.triggers : undefined;
};

describe('adaptive branches in the canonical document', () => {
  it('keeps a branch that names no key yet, so the document reads back', () => {
    const fresh = withBranches([{ afterAny: [], binding: { kind: 'kp', symbol: '' } }]);
    const json = toCanonicalJson(fresh);
    const parsed = safeParseLayout(JSON.parse(JSON.stringify(json)));
    expect(parsed.ok, parsed.ok ? '' : parsed.error).toBe(true);
    if (!parsed.ok) return;
    expect(branchesOf(parsed.layout)).toEqual([
      { afterAny: [], binding: { kind: 'kp', symbol: '' } },
    ]);
  });

  it('writes a branch on tags, or on keys, as it is', () => {
    const triggers: AdaptiveTrigger[] = [
      { afterTags: ['alpha2'], binding: { kind: 'kp', symbol: 'x' } },
      { afterAny: ['a'], binding: { kind: 'kp', symbol: 'h' } },
    ];
    const parsed = safeParseLayout(toCanonicalJson(withBranches(triggers)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(branchesOf(parsed.layout)).toEqual(triggers);
  });
});
