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
  type CountingGlobal,
  citeRule,
  GLOBAL_READS,
  GLOSSARY_URL,
  PRESET_REFERENCES,
  presetReferences,
  RULE_REFERENCES,
  type RuleReference,
  ruleReferences,
} from './references.js';
import { ruleSetFromJson } from './serialize.js';
import { DEFAULT_GLOBALS, type Rule, type RuleSet } from './types.js';

const catalogIds = catalogRules().map((r) => r.id);

/**
 * The globals that change what a rule counts, and the rules whose count each reads
 * (`GLOBAL_READS`). A preset that sets any other one away from its default fails the test; a test
 * below flips each one and runs the engine, so a rule one moves that the table misses fails too.
 */
const READS: Partial<Record<string, (r: Rule) => boolean>> = GLOBAL_READS;

/** A value for each counting global other than its default, which the engine tests flip it to. */
const FLIPPED = {
  cross_word: 'bridge',
  skip_weights: [1, 1, 1],
  distance_model: 'manhattan',
  lsb_adjacent_u: 1,
  lsb_semi_adjacent_u: 2,
  space_per_word_in_keystrokes: true,
  untyped_in_keystrokes: true,
} satisfies Record<CountingGlobal, unknown>;

/** The rules a preset changes: by their definition, or by a global their count reads. */
function changedBy(set: RuleSet): string[] {
  const catalog = new Map(catalogRules().map((r) => [r.id, JSON.stringify(r)]));
  const reads: ((r: Rule) => boolean)[] = [];
  for (const [name, value] of Object.entries(set.globals)) {
    const read = READS[name];
    const isDefault =
      JSON.stringify(value) ===
      JSON.stringify(DEFAULT_GLOBALS[name as keyof typeof DEFAULT_GLOBALS]);
    if (read) {
      if (!isDefault) reads.push(read);
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
  'the cyanophage-like denominator: pairs and skipgrams as a percent of the playground’s keystrokes',
] as const;

/**
 * Every rule a preset changes, with the sources it then shows: what the preset follows first, then
 * the catalog's that still describe it. Under the Layouts Doc set only the denominator of SFB and
 * of its part two or more rows apart is another tool's; under the cyanophage-like set every rule it changes cites the playground, and the
 * Doc stays cited for the concepts the two share.
 */
const UNDER: Record<string, Record<string, Cited>> = {
  layouts_doc: {
    sfb: [
      ['Genkey', 'SFBs as a percent of the letters'],
      ['Doc', '§4.1'],
      ['Doc', '§13.4'],
    ],
    sfb_2u: [
      ['Genkey', 'the denominator only: the letters on the layout’s keys'],
      ['Doc', '§4.3'],
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
    ],
    fsb: [
      ['keyboard_svg.js', '"Scissors" — the cyanophage-like definition'],
      KEYSTROKES,
      ['Doc', '§6.2 Full scissors bigrams (FSBs) — the shared concept'],
      ['Doc', '§13.4'],
    ],
    hsb: [KEYSTROKES, ['Doc', '§6.7'], ['glossary', 'Scissor weights']],
    thumb_bigrams: [KEYSTROKES, ['Doc', '§12.2'], ['glossary', 'Thumb bigrams']],
    thumb_double: [KEYSTROKES, ['Doc', '§12.3'], ['glossary', 'Thumb double taps']],
    layer_tap_sfb: [KEYSTROKES, ['glossary', 'Layer tap → same finger'], ['ZMK', 'behaviour']],
    sfs: [KEYSTROKES, ['Doc', '§4.5'], ['Doc', '§13.4']],
    sfs_weighted: [KEYSTROKES, ['Doc', '§4.6']],
    lss: [KEYSTROKES, ['Doc', '§7.3']],
    fss: [KEYSTROKES, ['Doc', '§6.6'], ['glossary', 'Scissor weights']],
    hss: [KEYSTROKES, ['Doc', '§6.8'], ['glossary', 'Scissor weights']],
    redirect: [
      ['keyboard_svg.js', 'the cyanophage-like definition: three different fingers'],
      ['Doc', '§8.1 Alts, rolls, 3rolls & redir — the shared concept'],
      ['Doc', '§16.1 Rolls & redirects — the shared concept'],
      ['Doc', '§13.4'],
      ['glossary', 'no thumb key, space included'],
    ],
    weak_redirect: [
      ['keyboard_svg.js', 'three different fingers, none an index'],
      ['Doc', '§8.9 “Weak” redirects — the shared concept'],
      ['glossary', 'no thumb key, space included'],
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

  it('names every rule a counting global moves', () => {
    const stream = normalizeText(`${FIXTURE_MIXED} çà ñö`, { caseMode: 'fold' });
    const { layout } = importTextLayout("qwertyuiop-asdfghjkl;'zxcvbnm,./\\^", 'ansi', 'qwerty');
    const values = (ruleSet: RuleSet) =>
      new Map(
        analyze(layout, stream, { ruleSet, maxSymbols: 20_000 }).results.map((r) => [
          r.id,
          JSON.stringify(r.value),
        ]),
      );
    const exercised = new Set<string>();
    for (const id of PRESET_IDS) {
      const set = getPreset(id);
      const before = values(set);
      for (const [name, value] of Object.entries(FLIPPED)) {
        const read = READS[name] as (r: Rule) => boolean;
        // Away from what the preset has: to the flipped value, or back to the default.
        const fallback = DEFAULT_GLOBALS[name as CountingGlobal];
        const has = set.globals[name as CountingGlobal] ?? fallback;
        const to = JSON.stringify(has) === JSON.stringify(value) ? fallback : value;
        const flipped = values({ ...set, globals: { ...set.globals, [name]: to } });
        for (const [ruleId, v] of flipped) {
          if (before.get(ruleId) === v) continue;
          exercised.add(name);
          const r = set.rules.find((x) => x.id === ruleId) as Rule;
          // A ratio moves with the rules it divides.
          const parts = set.rules.filter((x) =>
            [r.aggregate_opts?.numerator, r.aggregate_opts?.denominator].includes(x.id),
          );
          expect(read(r) || parts.some(read), `${id}: ${name} moves ${ruleId}`).toBe(true);
        }
      }
    }
    // The text does exercise each one.
    expect([...exercised].sort()).toEqual(Object.keys(FLIPPED).sort());
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

  it('cites LayerBench’s thumb rule under every trigram rule that leaves thumbs out', () => {
    // Rolls and alternation leave out thumb presses but space; redirects and one-hand rolls leave
    // out every thumb key. Neither is the Doc's, which counts a space thumb in them (§16.4.2).
    for (const set of [{ id: undefined, rules: catalogRules() }, ...PRESET_IDS.map(getPreset)]) {
      for (const r of set.rules) {
        if (r.family !== 'trigram' || !r.where) continue;
        const where = JSON.stringify(r.where);
        const locators = ruleReferences(r.id, set.id).map((ref) => ref.locator ?? '');
        const at = `${set.id ?? 'catalog'}: ${r.id}`;
        const keys = where.includes('"any_thumb":false');
        const presses = where.includes('"key_kind":"space"');
        expect(keys || presses, at).toBe(true);
        if (keys)
          expect(
            locators.some((l) => l.includes('no thumb key, space included')),
            at,
          ).toBe(true);
        if (presses)
          expect(
            locators.some((l) => l.includes('no thumb press rolls')),
            at,
          ).toBe(true);
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
    expect(fsb.some((l) => l?.includes('weigh 1'))).toBe(false);
    // The catalog's weights are LayerBench's: the Doc says only which scissors to cut first.
    const weights = ruleReferences('fsb').filter((r) => r.locator?.includes('weigh 1'));
    expect(weights.map(sourceOf)).toEqual(['glossary']);
    const priority = ruleReferences('fsb').find((r) => r.locator?.includes('§6.5'));
    expect(priority?.locator).not.toContain('weigh');
    // Every rule that weighs its pairs by fingers cites the weights, under every rule set, and no
    // other rule does.
    for (const set of [{ id: undefined, rules: catalogRules() }, ...PRESET_IDS.map(getPreset)]) {
      for (const r of set.rules) {
        const cites = ruleReferences(r.id, set.id).some((ref) => ref.locator?.includes('weigh 1'));
        expect(cites, `${set.id ?? 'catalog'}: ${r.id}`).toBe(Boolean(r.weight));
      }
    }
    // Where it counts by its own definition, the Doc is cited for the concept the two share and
    // for its bands, never as the definition in force.
    const SHARED = 'the shared concept; the definition in force differs';
    for (const ruleId of ['lsb', 'fsb', 'redirect', 'weak_redirect']) {
      const doc = ruleReferences(ruleId, 'cyanophage').filter((r) => sourceOf(r) === 'Doc');
      for (const r of doc) {
        expect(r.locator, ruleId).toMatch(new RegExp(`(${SHARED}|§13\\.4 .* — bands)$`));
      }
      expect(
        doc.some((r) => r.locator?.endsWith(SHARED)),
        ruleId,
      ).toBe(true);
    }
    // What is left out is a source the catalog cites for that rule, never one it does not, and
    // only for a rule the preset changes, whose own sources then take its place.
    for (const id of PRESET_IDS) {
      for (const [ruleId, omitted] of Object.entries(PRESET_REFERENCES[id].omits ?? {})) {
        expect(PRESET_REFERENCES[id].rules[ruleId], `${id}: ${ruleId}`).toBeDefined();
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

  it('cites the playground only for the name of a rule it defines another way', () => {
    // The playground ranks its Hard Words by pairwise costs; LayerBench's by its per-key grid.
    const hard = ruleReferences('hard_words');
    expect(cited(hard)).toEqual([
      ['keyboard_svg.js', expect.stringContaining('"Hard Words" — the name only')],
      ['glossary', expect.stringContaining('per-key effort')],
    ]);
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

describe('the sources of a rule as a set has it', () => {
  /** A preset as a custom set keeps it: under its own id, written to JSON and read back. */
  const copyOf = (id: string, change?: (set: RuleSet) => void): RuleSet => {
    const set: RuleSet = JSON.parse(JSON.stringify({ ...getPreset(id), id: 'mine', name: 'Mine' }));
    change?.(set);
    return set;
  };
  const rule = (set: RuleSet, id: string): Rule => {
    const found = set.rules.find((r) => r.id === id);
    if (!found) throw new Error(id);
    return found;
  };

  it('cites a copy of a preset as the preset, rule by rule', () => {
    for (const id of PRESET_IDS) {
      const set = copyOf(id);
      for (const r of set.rules) {
        // Where both presets count a rule alike, the one the copy was made from is named.
        expect(citeRule(r, set), `${id}: ${r.id}`).toEqual({
          refs: ruleReferences(r.id, id),
          follows: id,
          edited: false,
        });
      }
    }
    // The rules the cyanophage-like set changes are its, and lead with what it follows.
    const set = copyOf('cyanophage');
    for (const ruleId of Object.keys(PRESET_REFERENCES.cyanophage.rules)) {
      expect(citeRule(rule(set, ruleId), set).follows, ruleId).toBe('cyanophage');
    }
  });

  it('cites a rule renamed, turned off or scored differently as before', () => {
    const set = copyOf('cyanophage', (s) => {
      const lsb = rule(s, 'lsb');
      lsb.label = 'My stretches';
      lsb.description = 'Mine.';
      lsb.enabled = false;
      lsb.score = { weight: 3 };
    });
    expect(citeRule(rule(set, 'lsb'), set)).toEqual({
      refs: ruleReferences('lsb', 'cyanophage'),
      follows: 'cyanophage',
      edited: false,
    });
  });

  it('cites the catalog, marked as edited, for a rule that counts as no preset’s', () => {
    const set = copyOf('cyanophage', (s) => {
      rule(s, 'lsb').where = { all: [{ same_hand: true }, { any_inner: true }] };
    });
    const cited = citeRule(rule(set, 'lsb'), set);
    expect(cited).toEqual({ refs: ruleReferences('lsb'), edited: true });
    expect(cited.refs.some((r) => r.url.includes('cyanophage'))).toBe(false);
  });

  it('keeps the preset’s sources for a rule rated on other bands, marked as edited', () => {
    const set = copyOf('cyanophage', (s) => {
      rule(s, 'sfb').bands = rule(getPreset('layouts_doc'), 'sfb').bands;
    });
    expect(citeRule(rule(set, 'sfb'), set)).toEqual({
      refs: ruleReferences('sfb', 'cyanophage'),
      follows: 'cyanophage',
      edited: true,
    });
  });

  it('follows the globals a rule reads', () => {
    // Without the characters the layout cannot type, Effort counts as the catalog's, and a pair
    // over keystrokes as no preset's.
    const set = copyOf('cyanophage', (s) => {
      s.globals.untyped_in_keystrokes = false;
    });
    expect(citeRule(rule(set, 'effort'), set)).toEqual({
      refs: ruleReferences('effort', 'layouts_doc'),
      follows: 'layouts_doc',
      edited: false,
    });
    expect(citeRule(rule(set, 'sfb'), set).edited).toBe(true);
    expect(citeRule(rule(set, 'lsb'), set).edited).toBe(true);
    // A rule that reads neither, a trigram's share of trigrams, is cited as before.
    expect(citeRule(rule(set, 'redirect'), set).follows).toBe('cyanophage');
  });

  it('cites the catalog, marked as edited, for a rule a global set in Rules changes', () => {
    const cited = (change: (s: RuleSet) => void, ruleId: string, from = 'layouts_doc') => {
      const set = copyOf(from, change);
      return citeRule(rule(set, ruleId), set);
    };
    const edited = { refs: expect.any(Array), edited: true };
    expect(cited((s) => (s.globals.skip_weights = [1, 1, 1]), 'sfs_weighted')).toEqual(edited);
    expect(cited((s) => (s.globals.skip_weights = [1, 1, 1]), 'sfs').edited).toBe(false);
    expect(cited((s) => (s.globals.distance_model = 'manhattan'), 'sfb_distance')).toEqual(edited);
    expect(cited((s) => (s.globals.distance_model = 'manhattan'), 'sfb').edited).toBe(false);
    expect(cited((s) => (s.globals.lsb_adjacent_u = 1), 'lsb')).toEqual(edited);
    // The cyanophage-like LSB counts column pairs and reads no width; its skipgram reads them.
    expect(cited((s) => (s.globals.lsb_adjacent_u = 1), 'lsb', 'cyanophage').edited).toBe(false);
    expect(cited((s) => (s.globals.lsb_adjacent_u = 1), 'lss', 'cyanophage')).toEqual(edited);
    expect(cited((s) => (s.globals.cross_word = 'bridge'), 'redirect', 'cyanophage')).toEqual(
      edited,
    );
    expect(cited((s) => (s.globals.cross_word = 'bridge'), 'finger_usage').edited).toBe(false);
    // The catalog's own sources, not the preset's.
    expect(cited((s) => (s.globals.lsb_adjacent_u = 1), 'lss', 'cyanophage').refs).toEqual(
      ruleReferences('lss'),
    );
  });

  it('follows a ratio through the rules it divides', () => {
    const set = copyOf('layouts_doc', (s) => {
      rule(s, 'roll_in').where = { all: [{ same_hand: true }] };
    });
    expect(citeRule(rule(set, 'in_out_ratio'), set).edited).toBe(true);
    // A ratio dividing itself counts as no preset's, and ends.
    const loop = copyOf('layouts_doc', (s) => {
      rule(s, 'in_out_ratio').aggregate_opts = {
        numerator: 'in_out_ratio',
        denominator: 'roll_out',
      };
    });
    expect(citeRule(rule(loop, 'in_out_ratio'), loop).edited).toBe(true);
  });

  it('reads a copy the same whatever order its keys come in', () => {
    // Rules read through the schema come back with their keys in the schema's order.
    const reversed = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reversed)
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([k, v]) => [k, reversed(v)]),
            )
          : value;
    for (const id of PRESET_IDS) {
      const json = JSON.stringify(reversed({ ...getPreset(id), id: 'mine' }));
      const read = ruleSetFromJson(json);
      if (!read.ok) throw new Error(read.error);
      for (const r of read.ruleSet.rules) {
        expect(citeRule(r, read.ruleSet), `${id}: ${r.id}`).toEqual({
          refs: ruleReferences(r.id, id),
          follows: id,
          edited: false,
        });
      }
    }
  });

  it('cites a rule edited into another preset’s as that preset’s', () => {
    const set = copyOf('layouts_doc', (s) => {
      const theirs = rule(getPreset('cyanophage'), 'redirect');
      s.rules = s.rules.map((r) => (r.id === 'redirect' ? theirs : r));
    });
    expect(citeRule(rule(set, 'redirect'), set).refs).toEqual(
      ruleReferences('redirect', 'cyanophage'),
    );
    // A pair over keystrokes is the cyanophage-like set's only with its globals.
    const pairs = copyOf('layouts_doc', (s) => {
      const theirs = rule(getPreset('cyanophage'), 'fsb');
      s.rules = s.rules.map((r) => (r.id === 'fsb' ? theirs : r));
    });
    expect(citeRule(rule(pairs, 'fsb'), pairs).edited).toBe(true);
  });

  it('cites nothing for a rule composed in the Rules view', () => {
    const set = copyOf('layouts_doc');
    expect(citeRule({ id: 'my_rule', source: 'ngram', ngram: { n: 2 } }, set)).toEqual({
      refs: [],
      edited: false,
    });
  });
});
