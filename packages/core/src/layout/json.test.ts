import { describe, expect, it } from 'vitest';
import { structureHash } from '../analysis/hash.js';
import { compileLayout } from './compile.js';
import { toCanonicalJson } from './json.js';
import { duplicateLayer } from './ops.js';
import { isLayoutLink, safeParseLayout } from './schema.js';
import type { AdaptiveTrigger, Layout } from './types.js';

function withBranches(triggers: AdaptiveTrigger[]): Layout {
  return {
    format: 'layerbench/layout@1',
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

describe("a layer's colour", () => {
  const coloured = (color?: 'red' | 'teal'): Layout => {
    const l = withBranches([]);
    return { ...l, layers: [{ ...l.layers[0], ...(color ? { color } : {}) }] };
  };

  it('is written after the name, read back, and absent when the layer chose none', () => {
    const json = toCanonicalJson(coloured('red'));
    expect(Object.keys((json.layers as Record<string, unknown>[])[0])).toEqual([
      'id',
      'color',
      'bindings',
    ]);
    const parsed = safeParseLayout(json);
    expect(parsed.ok && parsed.layout.layers[0].color).toBe('red');
    expect('color' in (toCanonicalJson(coloured()).layers as Record<string, unknown>[])[0]).toBe(
      false,
    );
  });

  it('must be one of the palette', () => {
    const json = toCanonicalJson(coloured('red'));
    (json.layers as Record<string, unknown>[])[0].color = '#ff0000';
    expect(safeParseLayout(json).ok).toBe(false);
  });

  it('is drawn, not typed: it leaves the analysis identity alone', () => {
    expect(structureHash(coloured('teal'))).toBe(structureHash(coloured()));
    expect(compileLayout(coloured('teal')).layers[0].color).toBe('teal');
  });

  it('is not carried to a duplicate, so the copy can be told apart', () => {
    const copy = duplicateLayer(coloured('red'), 0);
    expect(copy?.layout.layers[1].color).toBeUndefined();
    expect(copy?.layout.layers[0].color).toBe('red');
  });
});

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

describe('a conditional layer in the document', () => {
  const waitingFor = (n: number) => {
    const ids = Array.from({ length: n }, (_, i) => `l${i}`);
    const l = withBranches([]);
    return toCanonicalJson({
      ...l,
      layers: [
        ...l.layers,
        ...[...ids, 't'].map((id) => ({ id, bindings: { '*': { kind: 'trans' as const } } })),
      ],
      conditionalLayers: [{ if: ids, then: 't' }],
    });
  };

  it('waits for at most four layers, which the analysis can bring on in any order', () => {
    expect(safeParseLayout(waitingFor(4)).ok).toBe(true);
    expect(safeParseLayout(waitingFor(5)).ok).toBe(false);
  });

  it('waits for no other conditional layer', () => {
    const json = waitingFor(2);
    json.conditionalLayers = [...(json.conditionalLayers as unknown[]), { if: ['l0'], then: 'l1' }];
    expect(safeParseLayout(json).ok).toBe(false);
  });
});

describe("a layout's link", () => {
  const linked = (link: string): Layout => ({ ...withBranches([]), author: 'Ana', link });

  it('is kept in the document, after the description', () => {
    const doc = toCanonicalJson({ ...linked('https://example.com/mine'), description: 'Mine.' });
    expect(Object.keys(doc).slice(0, 6)).toEqual([
      'format',
      'name',
      'author',
      'description',
      'link',
      'hostLocale',
    ]);
    const back = safeParseLayout(doc);
    expect(back.ok && back.layout.link).toBe('https://example.com/mine');
  });

  it('is optional, and left out when there is none', () => {
    expect('link' in toCanonicalJson(withBranches([]))).toBe(false);
    expect(safeParseLayout(toCanonicalJson(withBranches([]))).ok).toBe(true);
  });

  it('is one http or https URL', () => {
    for (const link of ['https://example.com', 'http://example.com/a?b#c']) {
      expect(isLayoutLink(link), link).toBe(true);
    }
    for (const link of [
      'example.com',
      'ftp://example.com',
      'https://',
      'https://a b',
      ' https://a',
    ]) {
      expect(isLayoutLink(link), link).toBe(false);
    }
    expect(safeParseLayout(linked('javascript:alert(1)')).ok).toBe(false);
  });
});
