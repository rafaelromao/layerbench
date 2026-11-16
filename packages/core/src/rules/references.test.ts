import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyze } from '../analysis/analyze.js';
import { normalizeText } from '../corpus/normalize.js';
import { FIXTURE_MIXED } from '../fixtures/index.js';
import { importTextLayout } from '../layout/text.js';
import { catalogRules } from './catalog.js';
import { getPreset, PRESET_IDS } from './presets.js';
import {
  GLOSSARY_URL,
  PRESET_REFERENCES,
  presetReferences,
  RULE_REFERENCES,
  type RuleReference,
  ruleReferences,
} from './references.js';
import { DEFAULT_GLOBALS, type Rule, type RuleSet } from './types.js';

const catalogIds = catalogRules().map((r) => r.id);

/**
 * The globals a preset may set and the rules whose count each reads. A preset that sets another
 * one away from its default must say here which rules it changes, or the test fails; and a test
 * below runs the engine with and without the preset's globals, so a rule they move that this
 * table misses fails too.
 */
const READS: Record<string, (r: Rule) => boolean> = {
  space_per_word_in_keystrokes: (r) => r.aggregate === 'percent_of_keystrokes',
  untyped_in_keystrokes: (r) =>
    r.aggregate === 'percent_of_keystrokes' || r.aggregate === 'weighted_sum',
};

/** The rules a preset changes: by their definition, or by a global their count reads. */
function changedBy(set: RuleSet): string[] {
  const catalog = new Map(catalogRules().map((r) => [r.id, JSON.stringify(r)]));
  const reads: ((r: Rule) => boolean)[] = [];
  for (const [name, value] of Object.entries(set.globals)) {
    const read = READS[name];
    if (read) {
      if (value) reads.push(read);
    } else {
      expect(value, `${set.id}: ${name}`).toEqual(
        DEFAULT_GLOBALS[name as keyof typeof DEFAULT_GLOBALS],
      );
    }
  }
  return set.rules
    .filter((r) => catalog.get(r.id) !== JSON.stringify(r) || reads.some((read) => read(r)))
    .map((r) => r.id);
}

/** Who a reference is to, by its address. */
function sourceOf(ref: RuleReference): string {
  if (ref.url.startsWith(GLOSSARY_URL)) return 'glossary';
  if (ref.url.includes('docs.google.com')) return 'Doc';
  if (ref.url.includes('cyanophage.github.io/playground.html')) return 'playground';
  if (ref.url.includes('keyboard_svg.js')) return 'keyboard_svg.js';
  if (ref.url.includes('genkey')) return 'Genkey';
  if (ref.url.includes('zmk')) return 'ZMK';
  return ref.url;
}

/** Each source of a rule as who it is to and a piece of what it says, in the order listed. */
type Cited = readonly (readonly [source: string, says: string])[];

const KEYSTROKES = [
  'playground',
  'cyanophage-like percentages: pairs and skipgrams over keystrokes',
] as const;

/**
 * Every rule a preset changes, with the sources it then shows: what the preset follows first, then
 * the catalog's that still describe it. Under the Layouts Doc set only SFB's denominator is
 * another tool's; under the cyanophage-like set every rule it changes cites the playground, and the
 * Doc stays cited for the concepts the two share.
 */
const UNDER: Record<string, Record<string, Cited>> = {
  layouts_doc: {
    sfb: [
      ['Genkey', 'SFBs as a percent of the letters'],
      ['Doc', '§4.1'],
      ['Doc', '§13.4'],
    ],
  },
  cyanophage: {
    sfb: [
      KEYSTROKES,
      ['keyboard_svg.js', 'red = 128 + 6000 × share'],
      ['glossary', 'cyanophage-like SFB ruler'],
      ['Doc', '§4.1'],
    ],
    sfb_2u: [KEYSTROKES, ['Doc', '§4.3']],
    repeats: [KEYSTROKES, ['Doc', '§3.8'], ['glossary', 'Repeated keys']],
    lsb: [
      ['keyboard_svg.js', '"Lat Stretch Bigrams" — the cyanophage-like definition'],
      KEYSTROKES,
      ['Doc', '§7.2 Lateral stretch bigrams (LSBs) — the shared concept'],
      ['Doc', '§7.4'],
    ],
    fsb: [
      ['keyboard_svg.js', '"Scissors" — the cyanophage-like definition'],
      KEYSTROKES,
      ['Doc', '§6.2 Full scissors bigrams (FSBs) — the shared concept'],
      ['Doc', '§13.4'],
    ],
    hsb: [KEYSTROKES, ['Doc', '§6.7']],
    thumb_bigrams: [KEYSTROKES, ['Doc', '§12.2'], ['glossary', 'Thumb bigrams']],
    thumb_double: [KEYSTROKES, ['Doc', '§12.3'], ['glossary', 'Thumb double taps']],
    layer_tap_sfb: [KEYSTROKES, ['glossary', 'Layer tap → same finger'], ['ZMK', 'behaviour']],
    sfs: [KEYSTROKES, ['Doc', '§4.5'], ['Doc', '§13.4']],
    sfs_weighted: [KEYSTROKES, ['Doc', '§4.6']],
    lss: [KEYSTROKES, ['Doc', '§7.3']],
    fss: [KEYSTROKES, ['Doc', '§6.6']],
    hss: [KEYSTROKES, ['Doc', '§6.8']],
    redirect: [
      ['keyboard_svg.js', 'the cyanophage-like definition: three different fingers'],
      ['Doc', '§8.1 Alts, rolls, 3rolls & redir — the shared concept'],
      ['Doc', '§16.1'],
      ['Doc', '§13.4'],
    ],
    weak_redirect: [
      ['keyboard_svg.js', 'three different fingers, none an index'],
      ['Doc', '§8.9'],
    ],
    effort: [
      ['playground', 'cyanophage-like divisor'],
      ['keyboard_svg.js', 'per-key grid'],
      ['glossary', 'a thumb press costs 1'],
    ],
  },
};

function cited(refs: readonly RuleReference[]): Cited {
  return refs.map((r) => [sourceOf(r), r.locator ?? ''] as const);
}

/** GitHub's heading slugs: lower case, punctuation dropped, spaces to hyphens. */
function slugs(markdown: string): Set<string> {
  const out = new Set<string>();
  for (const line of markdown.split('\n')) {
    const m = /^#{1,6}\s+(.*)$/.exec(line);
    if (!m) continue;
    out.add(
      m[1]
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s/g, '-'),
    );
  }
  return out;
}

describe('rule references', () => {
  it('cites a source for every rule in the catalog', () => {
    const missing = catalogIds.filter((id) => ruleReferences(id).length === 0);
    expect(missing).toEqual([]);
  });

  it('cites nothing that is not a rule', () => {
    const orphans = Object.keys(RULE_REFERENCES).filter((id) => !catalogIds.includes(id));
    expect(orphans).toEqual([]);
  });

  it('gives every preset a source, and redefines only rules that exist', () => {
    for (const id of PRESET_IDS) {
      const refs = PRESET_REFERENCES[id];
      expect(refs, id).toBeDefined();
      expect(refs.preset.length, id).toBeGreaterThan(0);
      for (const ruleId of Object.keys(refs.rules)) expect(catalogIds).toContain(ruleId);
    }
  });

  it('points only at absolute web addresses', () => {
    const all = [
      ...Object.values(RULE_REFERENCES).flat(),
      ...Object.values(PRESET_REFERENCES).flatMap((p) => [
        ...p.preset,
        ...Object.values(p.rules).flat(),
      ]),
    ];
    for (const ref of all) {
      expect(ref.url, ref.title).toMatch(/^https?:\/\/[^\s]+$/);
      expect(ref.title.trim()).not.toBe('');
    }
  });

  it('puts the definition in force first under a preset that redefines the rule', () => {
    expect(ruleReferences('lsb', 'cyanophage')[0].url).toContain('cyanophage');
    expect(ruleReferences('fsb', 'cyanophage')[0].url).toContain('cyanophage');
    // A rule the preset leaves alone keeps the catalog's sources only.
    expect(ruleReferences('sfb_distance', 'cyanophage')).toEqual(ruleReferences('sfb_distance'));
    expect(ruleReferences('alternation', 'cyanophage')).toEqual(ruleReferences('alternation'));
  });

  it('cites what each preset follows under every rule it changes', () => {
    for (const id of PRESET_IDS) {
      for (const ruleId of changedBy(getPreset(id))) {
        expect(PRESET_REFERENCES[id].rules[ruleId]?.length, `${id}: ${ruleId}`).toBeGreaterThan(0);
      }
    }
  });

  it('cites the cyanophage-like set under exactly the rules it changes', () => {
    const changed = changedBy(getPreset('cyanophage'));
    // The pair rules over keystrokes, its own LSB, scissors and redirects, and Effort's divisor.
    expect(changed).toHaveLength(17);
    expect(Object.keys(PRESET_REFERENCES.cyanophage.rules).sort()).toEqual([...changed].sort());
  });

  it('cites the preset under every rule whose number its globals move', () => {
    // A text with letters the layout cannot type, so both of the cyanophage-like globals count.
    const stream = normalizeText(`${FIXTURE_MIXED} çà ñö`, { caseMode: 'fold' });
    const { layout } = importTextLayout("qwertyuiop-asdfghjkl;'zxcvbnm,./\\^", 'ansi', 'qwerty');
    const values = (ruleSet: RuleSet) =>
      new Map(
        analyze(layout, stream, { ruleSet, maxSymbols: 20_000 }).results.map((r) => [
          r.id,
          JSON.stringify(r.value),
        ]),
      );
    for (const id of PRESET_IDS) {
      const set = getPreset(id);
      const withGlobals = values(set);
      const without = values({ ...set, globals: {} });
      const moved = [...withGlobals].filter(([ruleId, v]) => without.get(ruleId) !== v);
      for (const [ruleId] of moved) {
        expect(PRESET_REFERENCES[id].rules[ruleId], `${id}: ${ruleId}`).toBeDefined();
      }
      // The text does exercise them: under the cyanophage-like set SFB and Effort both move.
      if (id === 'cyanophage') {
        expect(moved.map(([ruleId]) => ruleId)).toEqual(expect.arrayContaining(['sfb', 'effort']));
      }
    }
  });

  it('shows each rule a preset changes with the sources of the definition in force', () => {
    for (const id of PRESET_IDS) {
      const changed = new Set([...changedBy(getPreset(id)), ...Object.keys(UNDER[id] ?? {})]);
      for (const ruleId of changed) {
        const expected = UNDER[id]?.[ruleId];
        expect(expected, `${id}: ${ruleId} has no expected sources here`).toBeDefined();
        const got = cited(ruleReferences(ruleId, id));
        expect(
          got.map(([source]) => source),
          `${id}: ${ruleId}`,
        ).toEqual(expected?.map(([source]) => source));
        for (const [i, [, says]] of got.entries()) {
          expect(says, `${id}: ${ruleId} #${i + 1}`).toContain(expected?.[i][1]);
        }
      }
    }
  });

  it('leaves out the catalog sources a preset no longer follows, and only those', () => {
    // The cyanophage-like SFB is rated on the playground's ramp, its scissors unweighted.
    const sfb = ruleReferences('sfb', 'cyanophage').map((r) => r.locator);
    expect(sfb.some((l) => l?.includes('§13.4'))).toBe(false);
    expect(ruleReferences('sfb').some((r) => r.locator?.includes('§13.4'))).toBe(true);
    const fsb = ruleReferences('fsb', 'cyanophage').map((r) => r.locator);
    expect(fsb.some((l) => l?.includes('§6.5'))).toBe(false);
    // Where it counts by its own definition, the Doc is cited for the concept, not the definition.
    for (const ruleId of ['lsb', 'fsb', 'redirect']) {
      const doc = ruleReferences(ruleId, 'cyanophage').filter((r) => sourceOf(r) === 'Doc');
      expect(
        doc.filter((r) => r.locator?.endsWith('— definition')),
        ruleId,
      ).toEqual([]);
      expect(
        ruleReferences(ruleId).some((r) => r.locator?.endsWith('— definition')),
        ruleId,
      ).toBe(true);
    }
    // What is left out is a source the catalog cites for that rule, never one it does not.
    for (const id of PRESET_IDS) {
      for (const [ruleId, omitted] of Object.entries(PRESET_REFERENCES[id].omits ?? {})) {
        for (const ref of omitted)
          expect(RULE_REFERENCES[ruleId], `${id}: ${ruleId}`).toContain(ref);
      }
    }
  });

  it('keeps a preset’s own sources apart from the rules', () => {
    expect(cited(presetReferences('cyanophage'))).toEqual([
      [
        'playground',
        expect.stringContaining('selected conventions, reproduced for comparable numbers'),
      ],
      ['glossary', expect.stringContaining('What the cyanophage-like rule set reproduces')],
    ]);
    expect(presetReferences('layouts_doc').map(sourceOf)).toEqual(['Doc', 'glossary']);
    expect(presetReferences(undefined)).toEqual([]);
    expect(presetReferences('custom:mine')).toEqual([]);
  });

  it('cites Genkey for the letters SFB is a share of, under the Layouts Doc preset only', () => {
    const doc = ruleReferences('sfb', 'layouts_doc');
    expect(doc[0].url).toContain('semilin/genkey');
    expect(doc.slice(1)).toEqual(ruleReferences('sfb'));
    expect(ruleReferences('sfb').some((r) => r.url.includes('genkey'))).toBe(false);
  });

  it('links only to headings the glossary actually has', () => {
    const path = fileURLToPath(new URL('../../../../docs/METRICS.md', import.meta.url));
    const headings = slugs(readFileSync(path, 'utf8'));
    const anchors = [
      ...Object.values(RULE_REFERENCES).flat(),
      ...Object.values(PRESET_REFERENCES).flatMap((p) => [
        ...p.preset,
        ...Object.values(p.rules).flat(),
      ]),
    ]
      .filter((r) => r.url.startsWith(GLOSSARY_URL))
      .map((r) => r.url.slice(GLOSSARY_URL.length + 1));
    for (const anchor of new Set(anchors)) expect(headings, anchor).toContain(anchor);
  });
});
