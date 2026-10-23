import { describe, expect, it, vi } from 'vitest';
import { structureHash } from '../analysis/hash.js';
import { compileLayout } from './compile.js';
import { toCanonicalJson } from './json.js';
import { duplicateLayer } from './ops.js';
import {
  isLayoutLink,
  LAYER_MORPH_MATCH,
  LayoutSchema,
  layoutJsonSchema,
  parseLayout,
  safeParseLayout,
} from './schema.js';
import type { AdaptiveTrigger, Binding, Layout } from './types.js';

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

/** Why a document is refused that holds more values than any layout needs. */
const TOO_MANY = 'The document holds more than 50,000 values, too many to be read';

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

describe('a hold of several modifiers in the document', () => {
  const held = (hold: Layout['layers'][number]['bindings'][string]): Layout => ({
    format: 'layerbench/layout@1',
    name: 'Held',
    geometry: { preset: '3x5+2' },
    keys: { space: 'L0' },
    layers: [
      {
        id: 'base',
        bindings: { LBR: { kind: 'hold_tap', tap: { kind: 'kp', symbol: 'f' }, hold } },
      },
    ],
  });
  const holdOf = (l: Layout) => {
    const b = l.layers[0].bindings.LBR;
    return b.kind === 'hold_tap' ? b.hold : undefined;
  };

  it('keeps the modifiers held with the first, and reads them back', () => {
    const doc = toCanonicalJson(held({ kind: 'mod', mod: 'LGUI', also: ['LSHIFT'] }));
    const parsed = safeParseLayout(doc);
    expect(parsed.ok && holdOf(parsed.layout)).toEqual({
      kind: 'mod',
      mod: 'LGUI',
      also: ['LSHIFT'],
    });
  });

  it('writes a plain modifier as it was, with nothing held with it', () => {
    const doc = toCanonicalJson(held({ kind: 'mod', mod: 'LGUI' }));
    expect(JSON.stringify(doc)).toContain('"hold":{"kind":"mod","mod":"LGUI"}');
  });
});

describe('a layer morph in the document', () => {
  type Doc = ReturnType<typeof toCanonicalJson>;
  const morphOf = (doc: Doc) =>
    (doc.layers as { bindings: Record<string, Record<string, unknown>> }[])[0].bindings.LHI;
  /** A morph on the base layer, which says when it comes on as `match` when one is given. */
  const morphing = (match?: string) => {
    const doc = toCanonicalJson({
      format: 'layerbench/layout@1',
      name: 'Morph',
      geometry: { preset: '3x5+2' },
      keys: { space: 'L0' },
      layers: [
        {
          id: 'base',
          bindings: {
            LHI: {
              kind: 'layer_morph',
              layers: ['base'],
              active: { kind: 'kp', symbol: 'b' },
              inactive: { kind: 'kp', symbol: 'a' },
            },
          },
        },
      ],
    });
    if (match !== undefined) morphOf(doc).match = match;
    return doc;
  };

  it('is written with no match: it changes while any of its layers is on', () => {
    expect(morphOf(morphing())).not.toHaveProperty('match');
  });

  it('reads `any`, as it was written on every morph, and is written without it again', () => {
    const parsed = safeParseLayout(morphing('any'));
    expect(parsed.ok, parsed.ok ? '' : parsed.error).toBe(true);
    if (parsed.ok) {
      expect(toCanonicalJson(parsed.layout)).toEqual(morphing());
    }
  });

  it('is refused when it comes on only with all of its layers, which zmk-layer-morph cannot do', () => {
    const parsed = safeParseLayout(morphing('all'));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain(LAYER_MORPH_MATCH);
      expect(parsed.error).toContain('→ at layers[0].bindings.LHI.match');
    }
  });
});

describe('sentence case in the document', () => {
  const doc = (features: unknown, L0: unknown = { kind: 'kp', symbol: ' ' }) => ({
    ...toCanonicalJson(withBranches([])),
    layers: [{ id: 'base', bindings: { L0 } }],
    features,
  });

  it("reads a document that set its punctuation or modifier, and leaves them out: they are the module's", () => {
    const parsed = safeParseLayout(doc({ sentenceCase: { after: ['.', ';'], mod: 'LCTRL' } }));
    expect(parsed.ok, parsed.ok ? '' : parsed.error).toBe(true);
    if (parsed.ok) {
      expect(parsed.layout.features).toEqual({ sentenceCase: {} });
      expect(toCanonicalJson(parsed.layout).features).toEqual({ sentenceCase: { enabled: true } });
    }
  });

  it('reads and writes a sentence space and a sentence morph as they are', () => {
    const morph = {
      kind: 'sentence_morph',
      default: { kind: 'sl', layer: 'base' },
      pending: { kind: 'kp', symbol: 'x' },
    };
    const written = doc(undefined, {
      kind: 'hold_tap',
      tap: { kind: 'sentence_space' },
      hold: morph,
    });
    const parsed = safeParseLayout(written);
    expect(parsed.ok, parsed.ok ? '' : parsed.error).toBe(true);
    if (parsed.ok) expect(toCanonicalJson(parsed.layout).layers).toEqual(written.layers);
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

  it('brings a layer on by one condition at most', () => {
    const json = waitingFor(2);
    json.conditionalLayers = [...(json.conditionalLayers as unknown[]), { if: ['l0'], then: 't' }];
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
    for (const link of ['https://example.com', 'http://example.com/a?b#c', 'HTTPS://Example.com']) {
      expect(isLayoutLink(link), link).toBe(true);
    }
    for (const link of [
      'example.com',
      'ftp://example.com',
      'https://',
      'https://a b',
      ' https://a',
      // These two look like URLs but are none: `new URL` will not read them.
      'https://[x',
      'https://a:99999',
    ]) {
      expect(isLayoutLink(link), link).toBe(false);
    }
    expect(safeParseLayout(linked('javascript:alert(1)')).ok).toBe(false);
  });
});

describe('a document with bindings that are wrong', () => {
  const withBindings = (bindings: Record<string, unknown>, rest: Record<string, unknown> = {}) => ({
    ...toCanonicalJson(withBranches([])),
    layers: [{ id: 'base', bindings }],
    ...rest,
  });
  /** What `safeParseLayout` says is wrong with a document it refuses at once. */
  const refused = (doc: unknown) => {
    const started = performance.now();
    const parsed = safeParseLayout(doc);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(parsed.ok).toBe(false);
    return parsed.ok ? '' : parsed.error;
  };
  const faultsTold = (error: string) => error.match(/✖/g)?.length;

  it('is refused at once, telling its 20 shallowest faults, however many have no `kind` it knows', () => {
    const keys = Array.from({ length: 20_000 }, (_, i) => [`k${i}`, { kind: 'bogus' }]);
    // A combo of one key, wrong nearer the top than any binding, and read after them all.
    const combos = [{ keys: ['LHM'], binding: { kind: 'none' } }];
    const error = refused(withBindings(Object.fromEntries(keys), { combos }));
    expect(error).toContain('→ at combos[0].keys');
    expect(error).toContain('→ at layers[0].bindings.k0.kind');
    expect(error).toContain('→ at layers[0].bindings.k18.kind');
    expect(error).not.toContain('k19.kind');
    expect(error).toMatch(/\n… and 19981 more$/);
    expect(faultsTold(error)).toBe(20);
  });

  it('tells one fault for each binding, however many its parts have', () => {
    const dance = { kind: 'tap_dance', bindings: Array(20_000).fill({ kind: 'bogus' }) };
    const error = refused(withBindings({ LHM: dance }));
    expect(error).toContain('→ at layers[0].bindings.LHM.bindings[0].kind');
    expect(faultsTold(error)).toBe(1);
    // Each holding the next and 400 that are no binding: a fault would otherwise be copied again at
    // every binding around it.
    let nested: unknown = { kind: 'kp', symbol: 'a' };
    for (let i = 0; i < 100; i++) {
      nested = {
        kind: 'tap_dance',
        bindings: [nested, ...Array.from({ length: 400 }, () => ({}))],
      };
    }
    expect(faultsTold(refused(withBindings({ LHM: nested })))).toBe(1);
  });

  it('is refused, not thrown, when it nests deeper than JavaScript can follow', () => {
    let deep: unknown = { kind: 'kp', symbol: 'a' };
    for (let i = 0; i < 10_000; i++) deep = { kind: 'lt', layer: 'base', tap: deep };
    expect(refused(withBindings({ LHM: deep }))).toMatch(/^The document nests too deep/);
  });
});

describe('a document that holds very many values', () => {
  /** How many values `v` holds, itself included, as the reader counts a document from JSON. */
  const values = (v: unknown): number =>
    typeof v === 'object' && v !== null
      ? Object.values(v).reduce((n: number, x) => n + values(x), 1)
      : 1;
  const base = { ...toCanonicalJson(withBranches([])), languages: [] };
  /** A document of `n` values, all but those of `base` in the languages it is written for. */
  const holding = (n: number, language: unknown = 'en') => ({
    ...base,
    languages: Array(n - values(base)).fill(language),
  });

  it('is read up to 50,000 values, and refused past them before any is read', () => {
    expect(values(holding(50_000))).toBe(50_000);
    expect(safeParseLayout(holding(50_000)).ok).toBe(true);
    const read = vi.spyOn(LayoutSchema, 'safeParse');
    expect(safeParseLayout(holding(50_001))).toEqual({ ok: false, error: TOO_MANY });
    expect(read).not.toHaveBeenCalled();
    read.mockRestore();
    expect(() => parseLayout(holding(50_001))).toThrow(TOO_MANY);
  });

  it('counts no field that holds nothing, as JSON writes none', () => {
    // Writing names out gives each combo a `binding` that holds nothing: 30,000 values, not 60,000.
    const parsed = safeParseLayout({ ...base, combos: Array(30_000).fill({}) });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain('→ at combos[0].binding');
  });

  it('is refused at once when it is wrong in a million places', () => {
    const doc = { ...base, languages: Array(1_000_000).fill(1) };
    const started = performance.now();
    expect(safeParseLayout(doc)).toEqual({ ok: false, error: TOO_MANY });
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('is refused quickly when every one of its 50,000 values is wrong, telling the shallowest 20', () => {
    const doc = holding(50_000, 1);
    const started = performance.now();
    const parsed = safeParseLayout(doc);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toMatch(
      /^✖ Invalid input: expected string, received number\n {2}→ at languages\[0\]/,
    );
    expect(parsed.error.match(/✖/g)).toHaveLength(20);
    expect(parsed.error).toMatch(new RegExp(`\\n… and ${doc.languages.length - 20} more$`));
  });
});

describe('a binding in the document', () => {
  it('is one of its kinds in the JSON Schema', () => {
    type Kinds = { oneOf: { properties: { kind: { const: string } } }[] };
    const schema = layoutJsonSchema() as {
      $defs: Record<string, Kinds>;
      properties: {
        layers: { items: { properties: { bindings: { additionalProperties: { $ref: string } } } } };
      };
    };
    const { $ref } = schema.properties.layers.items.properties.bindings.additionalProperties;
    const { oneOf } = schema.$defs[$ref.replace('#/$defs/', '')];
    const kinds = oneOf.map((o) => o.properties.kind.const);
    expect(kinds).toContain('kp');
    expect(kinds).toContain('trans');
    // A key is only what the editor can make.
    expect(kinds).not.toContain('raw');
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

describe('a document saved while layouts named bindings of their own', () => {
  const kp = (symbol: string) => ({ kind: 'kp', symbol });
  const hv = {
    kind: 'adaptive',
    default: kp('h'),
    triggers: [{ afterAny: ['a'], binding: kp('v') }],
  };
  const altRepeat = {
    kind: 'adaptive',
    default: { kind: 'key_repeat' },
    triggers: [{ afterAny: ['e'], binding: { kind: 'ref', ref: 'hv' } }],
  };
  const saved = (bindings: Record<string, unknown>, behaviors: Record<string, unknown>) => ({
    format: 'layerbench/layout@1',
    name: 'Saved',
    geometry: { preset: '3x5+2' },
    keys: { space: 'L0' },
    layers: [{ id: 'base', bindings }],
    behaviors,
    combos: [{ id: 'hv', keys: ['RHI', 'RHM'], binding: { kind: 'ref', ref: 'hv' } }],
  });
  const old = saved(
    {
      LHI: { kind: 'ref', ref: 'hv' },
      LHM: {
        kind: 'hold_tap',
        tap: { kind: 'ref', ref: 'rep' },
        hold: { kind: 'mod', mod: 'LCTRL' },
      },
      LHR: { kind: 'adaptive', ref: 'hv', default: kp('x') },
      LHP: { kind: 'macro', ref: 'qu', tag: 'mine' },
    },
    { hv, rep: altRepeat, qu: { kind: 'macro', symbols: 'qu', tag: 'qu' } },
  );

  it('opens with each name written out where it was used, and no names left', () => {
    const layout = parseLayout(old);
    expect(layout.layers[0].bindings).toEqual({
      LHI: hv,
      LHM: {
        kind: 'hold_tap',
        tap: { ...altRepeat, triggers: [{ afterAny: ['e'], binding: hv }] },
        hold: { kind: 'mod', mod: 'LCTRL' },
      },
      // A key that built on a name is what it named, with its own fields over it.
      LHR: { ...hv, default: kp('x') },
      LHP: { kind: 'macro', symbols: 'qu', tag: 'mine' },
    });
    expect(layout.combos?.[0].binding).toEqual(hv);
    expect('behaviors' in layout).toBe(false);
    expect('behaviors' in toCanonicalJson(layout)).toBe(false);
    expect(() => compileLayout(layout)).not.toThrow();
    expect(safeParseLayout(old)).toEqual({ ok: true, layout });
  });

  it("reads a key that builds on a name as the compiler did, the key's own fields outside it", () => {
    const parsed = safeParseLayout(
      saved(
        {
          // Its own steps name what it builds on, and are read as any other use of the name.
          LHI: { kind: 'macro', ref: 'x', steps: [{ kind: 'ref', ref: 'x' }] },
          // What `b` builds on in turn was never read: `b` is an empty macro with this key's tag.
          LHM: { kind: 'macro', ref: 'b', tag: 'k' },
        },
        {
          x: { kind: 'macro', symbols: 'x' },
          b: { kind: 'macro', ref: 'c' },
          c: { kind: 'macro', symbols: 'c' },
          hv,
        },
      ),
    );
    expect(parsed.ok && parsed.layout.layers[0].bindings).toEqual({
      LHI: { kind: 'macro', symbols: 'x', steps: [{ kind: 'macro', symbols: 'x' }] },
      LHM: { kind: 'macro', tag: 'k' },
    });
  });

  it('puts a feature on the tap of a named tap-hold on its key, as on any other key', () => {
    const spaceHold = { kind: 'hold_tap', tap: kp(' '), hold: { kind: 'mod', mod: 'LCTRL' } };
    const layout = parseLayout({
      ...saved({ L0: { kind: 'ref', ref: 'spaceHold' } }, { spaceHold }),
      features: { sentenceCase: {} },
    });
    expect(layout.layers[0].bindings.L0).toEqual(spaceHold);
    const space = compileLayout(layout).expanded.layers[0].bindings.L0;
    expect(space).toMatchObject({ kind: 'hold_tap', tap: { kind: 'sentence_space' } });
  });

  it('keeps a document that names nothing whole, however deep its bindings nest', () => {
    let deep: unknown = kp('a');
    for (let i = 0; i < 20; i++) deep = { kind: 'hold_tap', tap: deep, hold: kp('b') };
    const { behaviors: _none, combos: _named, ...nameless } = saved({ LHI: deep }, {});
    const layout = parseLayout(nameless);
    expect(layout.layers[0].bindings.LHI).toEqual(deep);
  });

  it('reads a name used several times round a loop no deeper than the compiler did', () => {
    const again = { kind: 'ref', ref: 'again' };
    const layout = parseLayout(
      saved({ LHI: again }, { again: { kind: 'tap_dance', bindings: [again, again, again] } }),
    );
    const dances = (b: Binding): number => (b.kind === 'tap_dance' ? 1 + dances(b.bindings[0]) : 0);
    expect(dances(layout.layers[0].bindings.LHI)).toBe(8);
  });

  it('writes out only so much, however a loop of names repeats or however heavy a name is', () => {
    const again = { kind: 'ref', ref: 'again' };
    const keys = [
      'LTP',
      'LTR',
      'LTM',
      'LTI',
      'LHP',
      'LHR',
      'LHM',
      'LHI',
      'RTI',
      'RTM',
      'RTR',
      'RTP',
    ];
    const everywhere = {
      ...saved(Object.fromEntries(keys.map((k) => [k, again])), {
        again: { kind: 'tap_dance', bindings: [again, again, again, again, again] },
      }),
      combos: keys.slice(1).map((k) => ({ keys: [keys[0], k], binding: again })),
    };
    // A macro that builds on itself, twice in its steps.
    const self = { kind: 'macro', ref: 'self' };
    const selfBuilt = saved({ LHI: self }, { self: { kind: 'macro', steps: [self, self] } });
    // A loop whose every turn holds a long list, many fields the schema does not read, a long text.
    const heavy = { kind: 'ref', ref: 'heavy' };
    const unread = Object.fromEntries(Array.from({ length: 5_000 }, (_, i) => [`x${i}`, i]));
    const heavyLoop = saved(
      { LHI: heavy },
      {
        heavy: {
          kind: 'adaptive',
          default: { kind: 'macro', symbols: 'é'.repeat(50_000) },
          triggers: [
            { afterAny: Array(30_000).fill('a'), binding: heavy },
            { afterAny: ['b'], binding: heavy, ...unread },
          ],
        },
      },
    );
    const looping = (text: string) =>
      saved(
        { LHI: heavy },
        {
          heavy: {
            kind: 'adaptive',
            default: { kind: 'macro', symbols: text },
            triggers: [{ afterAny: Array(1_000).fill('a'), binding: heavy }],
          },
        },
      );
    // One light enough to be written out a few turns before the budget is spent, and heavy enough
    // that the budget, not the depth, stops it.
    const text = 'è'.repeat(40_000);
    const lighter = looping(text);
    // One whose text the document writes six times as long, each character escaped.
    const escaped = looping('\u0001'.repeat(40_000));
    for (const doc of [everywhere, selfBuilt, heavyLoop, lighter, escaped]) {
      expect(JSON.stringify(toCanonicalJson(parseLayout(doc))).length).toBeLessThan(500_000);
    }
    // Written out four turns, where the depth would have let it go eight.
    expect(JSON.stringify(toCanonicalJson(parseLayout(lighter))).split(text)).toHaveLength(5);
  });

  it('is refused when its names write out more than 50,000 values', () => {
    const long = { kind: 'ref', ref: 'long' };
    const behaviors = { long: { kind: 'caps_word', continueList: Array(15_000).fill('a') } };
    // About 15,000 values as it is saved, and 15,000 more at each key that names it.
    expect(safeParseLayout(saved({ LHI: long, LHM: long, LHR: long }, behaviors)).ok).toBe(true);
    expect(
      safeParseLayout(saved({ LHI: long, LHM: long, LHR: long, LHP: long }, behaviors)),
    ).toEqual({ ok: false, error: TOO_MANY });
  });

  it('tells what is wrong in a name used round a loop once, not once for every copy', () => {
    const again = { kind: 'ref', ref: 'again' };
    const parsed = safeParseLayout(
      saved({ LHI: again }, { again: { kind: 'tap_dance', bindings: [again, again, kp('')] } }),
    );
    expect(parsed.ok).toBe(true);
    const wrong = safeParseLayout(
      saved(
        { LHI: again },
        { again: { kind: 'tap_dance', bindings: [again, again, { kind: 'bogus' }] } },
      ),
    );
    expect(wrong.ok).toBe(false);
    if (wrong.ok) return;
    expect(wrong.error).toMatch(
      /^✖ .+\n {2}→ at layers\[0\]\.bindings\.LHI(\.bindings\[\d\])+\.kind$/,
    );
  });

  it('keeps a key whose name led nowhere as Nothing, and one built on it as its own fields', () => {
    const parsed = safeParseLayout(
      saved(
        {
          LHI: { kind: 'ref', ref: 'gone' },
          LHM: { kind: 'ref', ref: 'loop' },
          LHR: { kind: 'macro', ref: 'hv', symbols: 'x' },
          // A name every object has, and no document: it typed nothing, and is Nothing now.
          LHP: { kind: 'ref', ref: 'constructor' },
        },
        { hv, loop: { kind: 'ref', ref: 'around' }, around: { kind: 'ref', ref: 'loop' } },
      ),
    );
    expect(parsed.ok && parsed.layout.layers[0].bindings).toEqual({
      LHI: { kind: 'none' },
      LHM: { kind: 'none' },
      LHR: { kind: 'macro', symbols: 'x' },
      LHP: { kind: 'none' },
    });
  });
});
