/**
 * Where each rule comes from.
 *
 * Kept apart from the rules themselves on purpose: a rule set is a document, written and read by
 * another engine too, and citations are facts about the catalog rather than settings of a set. A
 * custom or shared rule set therefore carries no sources: each of its rules shows those of the
 * preset whose rule it still counts as (`citeRule`), or the catalog's, marked as changed.
 *
 * Every locator was checked against its source when it was written. A rule LayerBench added
 * cites the glossary and says so, rather than borrowing another tool's authority. A definition
 * LayerBench shares with the Keyboard Layouts Doc cites the Doc, wherever else it is also counted;
 * a convention a preset adopts to read as another tool does cites that tool, and says which
 * preset adopts it. How LayerBench uses each source is in the glossary's "Implementation and
 * attribution".
 */
import { getPreset, PRESET_IDS, type PresetId } from './presets.js';
import { DEFAULT_GLOBALS, type Globals, type Rule, type RuleSet } from './types.js';

export interface RuleReference {
  title: string;
  url: string;
  /** Where in the source, and what it supports: "§4.1 Same finger bigrams (SFBs) — definition". */
  locator?: string;
}

const KLD_URL = 'https://docs.google.com/document/d/1W0jhfqJI2ueJ2FNseR4YAFpNfsUM-_FlREHbpNGmC2o';
const kld = (locator: string): RuleReference => ({
  title: 'Keyboard Layouts Doc, 3rd edition',
  url: KLD_URL,
  locator,
});

const CYANOPHAGE_SOURCE =
  'https://github.com/cyanophage/cyanophage.github.io/blob/main/keyboard_svg.js';
const cyanophage = (locator: string): RuleReference => ({
  title: 'cyanophage layout playground, keyboard_svg.js',
  url: CYANOPHAGE_SOURCE,
  locator,
});
const playground = (locator: string): RuleReference => ({
  title: 'cyanophage keyboard layout playground',
  url: 'https://cyanophage.github.io/playground.html',
  locator,
});

const genkey = (locator: string): RuleReference => ({
  title: 'Genkey documentation',
  url: 'http://www.semilin.dev/genkey/docs.html',
  locator,
});

const zmk = (path: string, page: string): RuleReference => ({
  title: `ZMK documentation: ${page}`,
  url: `https://zmk.dev/docs/${path}`,
  locator: 'behaviour semantics',
});

/** Anchors are GitHub's slugs of the glossary's headings; a test holds them to the file. */
export const GLOSSARY_URL = 'https://github.com/rafaelromao/layerbench/blob/main/docs/METRICS.md';
const glossary = (anchor: string, locator: string): RuleReference => ({
  title: 'LayerBench metric glossary',
  url: `${GLOSSARY_URL}#${anchor}`,
  locator,
});

const THRESHOLDS = kld('§13.4 Stats thresholds — bands');
const SCISSOR_PRIORITY = kld('§6.5 Adjacent vs non adjacent scissors — adjacent fingers first');
const LSB_DEFINITION = kld('§7.2 Lateral stretch bigrams (LSBs) — definition');
const FSB_DEFINITION = kld('§6.2 Full scissors bigrams (FSBs) — definition');
const LSB_STAGGER = kld('§7.4 Row stagger vs matrix LSBs');
const WEAK_REDIRECTS = kld('§8.9 “Weak” redirects');
const TRIGRAMS = kld('§8.1 Alts, rolls, 3rolls & redir — definition');
const ROLLS_AND_REDIRECTS = kld('§16.1 Rolls & redirects');
const LAYERS = 'layers-layerbench-specific';
const ADDITION = 'LayerBench addition';
const COUNTS = 'how-layerbench-counts';
const SCISSOR_WEIGHTS = glossary(
  'bigrams',
  `Scissor weights — adjacent fingers weigh 1, others 0.5: ${ADDITION}`,
);
const NO_THUMB_TRIGRAM = glossary(
  COUNTS,
  'Thumbs — no thumb press rolls or alternates, a LayerBench departure',
);
const NO_THUMB_REDIRECT = glossary(
  COUNTS,
  'Thumbs — no thumb key, space included, in a redirect or a one-hand roll, a LayerBench departure',
);

/** The catalog definitions. */
export const RULE_REFERENCES: Readonly<Record<string, readonly RuleReference[]>> = {
  sfb: [kld('§4.1 Same finger bigrams (SFBs) — definition'), THRESHOLDS],
  sfb_distance: [
    kld('§4.2 Calculating the distance between two keys'),
    kld('§4.6 Distance on a layout'),
  ],
  sfb_2u: [kld('§4.3 1U and 2U SFB')],
  repeats: [kld('§3.8 Double letters'), glossary('bigrams', 'Repeated keys')],
  lsb: [LSB_DEFINITION, LSB_STAGGER],
  fsb: [FSB_DEFINITION, SCISSOR_PRIORITY, SCISSOR_WEIGHTS, THRESHOLDS],
  hsb: [kld('§6.7 Half scissors bigrams (HSBs) — definition'), SCISSOR_WEIGHTS],
  thumb_bigrams: [
    kld('§12.2 On what hand should the thumb letter be? — background'),
    glossary('bigrams', `Thumb bigrams — ${ADDITION}`),
  ],
  thumb_double: [
    kld('§12.3 Which should be the thumb letter? — double taps on a thumb'),
    glossary('bigrams', 'Thumb double taps'),
  ],
  layer_tap_sfb: [
    glossary(LAYERS, `Layer tap → same finger — ${ADDITION}`),
    zmk('keymaps/behaviors/layers', 'Layers'),
  ],

  sfs: [kld('§4.5 Same finger Skipgrams (SFSs) — definition'), THRESHOLDS],
  sfs_weighted: [kld('§4.6 Distance on a layout — skip weights 0.5 / 0.25 / 0.125')],
  finger_speed: [
    kld('§4.8 Distributing movement across the fingers'),
    genkey('Finger speed — r = c × ((d + k) × F) / n'),
  ],
  lss: [kld('§7.3 Lateral stretch skipgrams (LSSs)')],
  fss: [kld('§6.6 Full scissor skipgrams (FSSs)'), SCISSOR_WEIGHTS],
  hss: [kld('§6.8 Half scissor skipgrams (HSSs)'), SCISSOR_WEIGHTS],

  alternation: [TRIGRAMS, kld('§18.1 Alternation'), THRESHOLDS, NO_THUMB_TRIGRAM],
  alt_sfs: [
    cyanophage('"alt sfs" trigram category'),
    {
      title: 'Oxeylyzer source, O-X-E-Y/oxeylyzer',
      url: 'https://github.com/O-X-E-Y/oxeylyzer/blob/main/oxeylyzer-core/src/trigram_patterns.rs',
      locator: 'AlternateSfs — the same category',
    },
    NO_THUMB_TRIGRAM,
  ],
  roll_in: [TRIGRAMS, kld('§15.1 In-rolls & out-rolls'), NO_THUMB_TRIGRAM],
  roll_out: [TRIGRAMS, kld('§15.1 In-rolls & out-rolls'), NO_THUMB_TRIGRAM],
  rolls: [TRIGRAMS, ROLLS_AND_REDIRECTS, THRESHOLDS, NO_THUMB_TRIGRAM],
  in_out_ratio: [kld('§15.5 In-roll ratio'), THRESHOLDS],
  onehand_in: [TRIGRAMS, kld('§17.1 3rolls'), NO_THUMB_REDIRECT],
  onehand_out: [TRIGRAMS, kld('§17.1 3rolls'), NO_THUMB_REDIRECT],
  redirect: [TRIGRAMS, ROLLS_AND_REDIRECTS, THRESHOLDS, NO_THUMB_REDIRECT],
  weak_redirect: [WEAK_REDIRECTS, NO_THUMB_REDIRECT],

  finger_usage: [
    kld('§4.8 Distributing movement across the fingers'),
    glossary('usage', 'Finger usage'),
  ],
  hand_balance: [
    THRESHOLDS,
    kld('§13.5 Hand balance nuances'),
    kld('§16.4.5 Hand balance and space'),
  ],
  row_usage: [kld('§6.10.1 Reducing bottom row use — background'), glossary('usage', 'Row usage')],
  column_usage: [
    kld('§7.6.1 Reducing center column use — background'),
    glossary('usage', 'Column usage'),
  ],
  pinky_off: [
    kld('§13.2 Layout stat table — "Pinky off"'),
    kld('§13.3 How the stats were obtained'),
    THRESHOLDS,
  ],
  home_row: [kld('§1.2 The home row — background'), glossary('usage', 'Home row usage')],
  center_column: [kld('§7.1 The center column')],
  layer_distribution: [glossary(LAYERS, `Keystrokes per layer — ${ADDITION}`)],
  finger_travel: [kld('§4.6 Distance on a layout')],

  effort: [
    cyanophage('Effort — per-key grid and its scale of 577'),
    glossary('effort', 'Effort — a thumb press costs 1, a LayerBench departure'),
  ],
  hard_words: [
    cyanophage(
      '"Hard Words" — the name only: the playground ranks words by pairwise costs (bigram_effort.json) LayerBench does not have',
    ),
    glossary('effort', 'Hard words — per-key effort plus the extra presses a word needs'),
  ],

  layer_taps_per_100: [
    glossary(LAYERS, `Layer taps per 100 symbols — ${ADDITION}`),
    zmk('keymaps/behaviors/layers', 'Layers'),
  ],
  one_shots_per_word: [
    glossary(LAYERS, `One-shot activations per word — ${ADDITION}`),
    zmk('keymaps/behaviors/sticky-layer', 'Sticky layer'),
  ],
  wasted_one_shots: [
    glossary(LAYERS, `Wasted one-shots — ${ADDITION}`),
    zmk('keymaps/behaviors/sticky-layer', 'Sticky layer'),
  ],
  macro_usage: [
    glossary(LAYERS, `Macro presses — ${ADDITION}`),
    zmk('keymaps/behaviors/macros', 'Macros'),
  ],
  adaptive_hit_rate: [
    glossary(LAYERS, `Adaptive key hit rate — ${ADDITION}`),
    {
      title: 'zmk-adaptive-key',
      url: 'https://github.com/urob/zmk-adaptive-key',
      locator: 'behaviour semantics',
    },
  ],
  combo_usage: [glossary(LAYERS, `Combo presses — ${ADDITION}`), zmk('keymaps/combos', 'Combos')],
  extra_keystrokes: [glossary(LAYERS, `Extra keystrokes per symbol — ${ADDITION}`)],

  same_hand_runs: [cyanophage('"Same Hand Count"'), glossary('trigrams', 'Same-hand run length')],
  same_hand_strings: [cyanophage('"Same Hand Strings"')],
};

export interface PresetReferences {
  /** What the preset as a whole follows: shown with the rule set, before any one rule. */
  preset: readonly RuleReference[];
  /**
   * What the preset follows for each rule it changes, cited before the catalog's sources: its
   * definition, its denominator or its ruler. A test holds the keys to the rules the preset
   * changes, by their definition or by a global their count reads.
   */
  rules: Readonly<Record<string, readonly RuleReference[]>>;
  /**
   * Catalog sources that no longer describe a rule as the preset counts it, left out of its list:
   * a ruler or a weight the preset does not use, or a definition it replaces, which its own list
   * then cites as the concept the two share.
   */
  omits?: Readonly<Record<string, readonly RuleReference[]>>;
}

/** Where the glossary says what each preset reproduces, and where the methods differ. */
const DIFFERENCES = 'where-the-methods-differ';

/** SFB's denominator as Genkey divides it, which the Doc's SFB figures use (§13.3). */
const GENKEY_SFB: RuleReference = {
  title: 'Genkey source, semilin/genkey',
  url: 'https://github.com/semilin/genkey',
  locator:
    'output.go, layout.go — SFBs as a percent of the letters on the layout’s keys (Total), no space',
};

/** SFB's part two or more rows apart, which Genkey does not print, divided as Genkey divides SFB. */
const GENKEY_SFB_2U: RuleReference = {
  ...GENKEY_SFB,
  locator:
    'output.go, layout.go — the denominator only: the letters on the layout’s keys (Total), no space; Genkey prints no part two or more rows apart',
};

/** A section of the Doc whose definition a preset replaces, cited for the concept they share. */
const shared = (section: string): RuleReference =>
  kld(`${section} — the shared concept; the definition in force differs`);

/**
 * The cyanophage-like percentages: pairs and skipgrams over the playground's keystrokes
 * (`m_input_length`, every character of a word plus one for its space).
 */
const KEYSTROKES = playground(
  'the cyanophage-like denominator: pairs and skipgrams as a percent of the playground’s keystrokes, one space per word, every character typed or not',
);

export const PRESET_REFERENCES: Readonly<Record<string, PresetReferences>> = {
  layouts_doc: {
    preset: [
      kld('definitions throughout; §13.4 Stats thresholds'),
      glossary(
        DIFFERENCES,
        'What the Layouts Doc rule set reproduces of the Doc’s numbers, and what not',
      ),
    ],
    rules: {
      // The Doc took its SFB from Genkey (§13.3), which divides by the letters it types; SFB's
      // part two or more rows apart divides the same way.
      sfb: [GENKEY_SFB],
      sfb_2u: [GENKEY_SFB_2U],
    },
  },
  cyanophage: {
    preset: [
      playground(
        'selected conventions, reproduced for comparable numbers: LSB, scissors, redirects, percentages over keystrokes',
      ),
      glossary(DIFFERENCES, 'What the cyanophage-like rule set reproduces, and where it differs'),
    ],
    rules: {
      sfb: [
        KEYSTROKES,
        cyanophage(
          '"Same Finger Bigrams" finger bars, red = 128 + 6000 × share — the ramp the cyanophage-like SFB ruler is drawn on',
        ),
        glossary(
          'bands',
          'The cyanophage-like SFB ruler — LayerBench reads a finger’s ramp as a layout’s total',
        ),
      ],
      sfb_2u: [KEYSTROKES],
      repeats: [KEYSTROKES],
      lsb: [
        cyanophage(
          '"Lat Stretch Bigrams" — the cyanophage-like definition: an index finger’s inner column with the middle finger’s, any rows',
        ),
        KEYSTROKES,
        shared('§7.2 Lateral stretch bigrams (LSBs)'),
      ],
      fsb: [
        cyanophage(
          '"Scissors" — the cyanophage-like definition: adjacent columns, two or more rows apart, two fingers of one hand, unweighted',
        ),
        KEYSTROKES,
        shared('§6.2 Full scissors bigrams (FSBs)'),
      ],
      hsb: [KEYSTROKES],
      thumb_bigrams: [KEYSTROKES],
      thumb_double: [KEYSTROKES],
      layer_tap_sfb: [KEYSTROKES],
      sfs: [KEYSTROKES],
      sfs_weighted: [KEYSTROKES],
      lss: [KEYSTROKES],
      fss: [KEYSTROKES],
      hss: [KEYSTROKES],
      redirect: [
        cyanophage(
          '"redirect" and "weak redirect" trigram categories — the cyanophage-like definition: three different fingers',
        ),
        shared('§8.1 Alts, rolls, 3rolls & redir'),
        shared('§16.1 Rolls & redirects'),
      ],
      weak_redirect: [
        cyanophage(
          '"weak redirect" trigram category — the cyanophage-like definition: three different fingers, none an index',
        ),
        shared('§8.9 “Weak” redirects'),
      ],
      effort: [
        playground(
          'cyanophage-like divisor: the characters the layout cannot type count among the keystrokes, as in the playground’s input length',
        ),
      ],
    },
    omits: {
      // Its SFB ruler is the playground's ramp, not the Doc's thresholds.
      sfb: [THRESHOLDS],
      // Its own definitions, cited above with the Doc's concept: column pairs, which no stagger
      // changes, unweighted scissors (its half scissors and skipgrams keep the weights), and
      // redirects on three different fingers.
      lsb: [LSB_DEFINITION, LSB_STAGGER],
      fsb: [FSB_DEFINITION, SCISSOR_PRIORITY, SCISSOR_WEIGHTS],
      redirect: [TRIGRAMS, ROLLS_AND_REDIRECTS],
      weak_redirect: [WEAK_REDIRECTS],
    },
  },
};

/**
 * The sources for one rule. Under a preset that changes the rule, what the preset follows for it
 * comes first, since that is the definition in force; the catalog's follow as background, but for
 * those the preset leaves out because they no longer describe the rule.
 */
export function ruleReferences(ruleId: string, presetId?: string): RuleReference[] {
  const preset = presetId ? PRESET_REFERENCES[presetId] : undefined;
  const omitted = preset?.omits?.[ruleId] ?? [];
  const base = (RULE_REFERENCES[ruleId] ?? []).filter((r) => !omitted.includes(r));
  return [...(preset?.rules[ruleId] ?? []), ...base];
}

/** What a preset as a whole follows; nothing for a rule set that is not a preset. */
export function presetReferences(presetId?: string): readonly RuleReference[] {
  return presetId ? (PRESET_REFERENCES[presetId]?.preset ?? []) : [];
}

/**
 * The globals a preset sets away from their defaults, and the rules whose count each one reads. A
 * rule counts as a preset's only if it reads these as the preset sets them. A test runs the engine
 * with and without each preset's globals, so a rule they move that this table misses fails it.
 */
export const PRESET_GLOBAL_READS: Readonly<
  Partial<Record<keyof Globals, (rule: Rule) => boolean>>
> = {
  space_per_word_in_keystrokes: (r) => r.aggregate === 'percent_of_keystrokes',
  untyped_in_keystrokes: (r) =>
    r.aggregate === 'percent_of_keystrokes' || r.aggregate === 'weighted_sum',
};

/** JSON with object keys in a stable order, and no key whose value is undefined. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

/** What names, shows, turns on, scores or rates a rule: none of it changes what the rule counts. */
const NOT_COUNTED = new Set(['label', 'description', 'enabled', 'score', 'bands']);

/** What a rule counts, and nothing else of it. */
function counting(rule: Rule): string {
  return canonical(Object.fromEntries(Object.entries(rule).filter(([k]) => !NOT_COUNTED.has(k))));
}

interface PresetRules {
  globals: Partial<Globals>;
  rules: Map<string, { rule: Rule; counts: string }>;
}

let presetRules: Map<PresetId, PresetRules> | undefined;

/** Each preset's rules by id, read once. */
function presetsByRule(): Map<PresetId, PresetRules> {
  presetRules ??= new Map(
    PRESET_IDS.map((id) => {
      const set = getPreset(id);
      const rules = new Map(set.rules.map((r) => [r.id, { rule: r, counts: counting(r) }]));
      return [id, { globals: set.globals, rules }];
    }),
  );
  return presetRules;
}

function globalOf(globals: Partial<Globals>, name: keyof Globals): unknown {
  return globals[name] ?? DEFAULT_GLOBALS[name];
}

/** The sources of a rule as a rule set has it. */
export interface RuleCitation {
  refs: RuleReference[];
  /**
   * The preset whose rule this one counts as, whose sources these are: none when it counts as no
   * preset's, or is not a built-in rule.
   */
  follows?: PresetId;
  /**
   * Changed in the set from the rule whose sources these are: from the preset's in its bands, or,
   * when it counts as no preset's, from the catalog's.
   */
  edited: boolean;
}

/**
 * The sources of a rule as a set has it, chosen by what the rule counts rather than by the set's
 * name. A rule that counts as a preset's, reading the globals that preset sets as it sets them,
 * shows that preset's sources: a copy of the cyanophage-like set shows its sources, and a rule of
 * a preset edited into another preset's shows the other's. A built-in rule that counts as no
 * preset's shows the catalog's, marked as edited; a rule composed in the Rules view has none.
 */
export function citeRule(rule: Rule, ruleSet: RuleSet): RuleCitation {
  if (!RULE_REFERENCES[rule.id]) return { refs: [], edited: false };
  const counts = counting(rule);
  for (const [id, preset] of presetsByRule()) {
    const own = preset.rules.get(rule.id);
    if (own?.counts !== counts) continue;
    const reads = Object.entries(PRESET_GLOBAL_READS) as [keyof Globals, (r: Rule) => boolean][];
    const sameGlobals = reads.every(
      ([name, read]) =>
        !read(rule) || globalOf(ruleSet.globals, name) === globalOf(preset.globals, name),
    );
    if (!sameGlobals) continue;
    return {
      refs: ruleReferences(rule.id, id),
      follows: id,
      edited: canonical(rule.bands ?? null) !== canonical(own.rule.bands ?? null),
    };
  }
  return { refs: ruleReferences(rule.id), edited: true };
}
