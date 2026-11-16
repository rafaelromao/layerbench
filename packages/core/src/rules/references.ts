/**
 * Where each rule comes from.
 *
 * Kept apart from the rules themselves on purpose: a rule set is a document, written and read by
 * another engine too, and citations are facts about the catalog rather than settings of a set. A
 * custom or shared rule set therefore shows the same sources as the catalog rule it was made from,
 * without carrying them.
 *
 * Every locator was checked against its source when it was written. A rule LayerBench added
 * cites the glossary and says so, rather than borrowing another tool's authority. A definition
 * LayerBench shares with the Keyboard Layouts Doc cites the Doc, wherever else it is also counted;
 * a convention a preset adopts to read as another tool does cites that tool, and says which
 * preset adopts it. How LayerBench uses each source is in the glossary's "Implementation and
 * attribution".
 */
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
const SCISSOR_WEIGHTS = kld('§6.5 Adjacent vs non adjacent scissors — weights');
const TRIGRAMS = kld('§8.1 Alts, rolls, 3rolls & redir — definition');
const LAYERS = 'layers-layerbench-specific';
const ADDITION = 'LayerBench addition';
const COUNTS = 'how-layerbench-counts';
const NO_THUMB_TRIGRAM = glossary(
  COUNTS,
  'Thumbs — no thumb press rolls or alternates, a LayerBench departure',
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
  lsb: [
    kld('§7.2 Lateral stretch bigrams (LSBs) — definition'),
    kld('§7.4 Row stagger vs matrix LSBs'),
  ],
  fsb: [kld('§6.2 Full scissors bigrams (FSBs) — definition'), SCISSOR_WEIGHTS, THRESHOLDS],
  hsb: [kld('§6.7 Half scissors bigrams (HSBs) — definition')],
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
  fss: [kld('§6.6 Full scissor skipgrams (FSSs)')],
  hss: [kld('§6.8 Half scissor skipgrams (HSSs)')],

  alternation: [TRIGRAMS, kld('§18.1 Alternation'), THRESHOLDS, NO_THUMB_TRIGRAM],
  alt_sfs: [cyanophage('"alt sfs" trigram category'), NO_THUMB_TRIGRAM],
  roll_in: [TRIGRAMS, kld('§15.1 In-rolls & out-rolls'), NO_THUMB_TRIGRAM],
  roll_out: [TRIGRAMS, kld('§15.1 In-rolls & out-rolls'), NO_THUMB_TRIGRAM],
  rolls: [TRIGRAMS, kld('§16.1 Rolls & redirects'), THRESHOLDS, NO_THUMB_TRIGRAM],
  in_out_ratio: [kld('§15.5 In-roll ratio'), THRESHOLDS],
  onehand_in: [TRIGRAMS, kld('§17.1 3rolls')],
  onehand_out: [TRIGRAMS, kld('§17.1 3rolls')],
  redirect: [TRIGRAMS, kld('§16.1 Rolls & redirects'), THRESHOLDS],
  weak_redirect: [kld('§8.9 “Weak” redirects')],

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
    cyanophage('Effort — per-key grid, 577 × Σ effort ÷ input length'),
    glossary('effort', 'Effort — a thumb press costs 1, a LayerBench departure'),
  ],
  hard_words: [
    cyanophage('"Hard Words"'),
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
   * Catalog sources that no longer describe a rule under the preset, left out of its list: a
   * ruler or a weight the preset does not use.
   */
  omits?: Readonly<Record<string, readonly RuleReference[]>>;
}

/** Where the glossary says what each preset reproduces, and where the methods differ. */
const DIFFERENCES = 'where-the-methods-differ';

/**
 * The cyanophage-like percentages: pairs and skipgrams over the playground's keystrokes
 * (`m_input_length`, every character of a word plus one for its space).
 */
const KEYSTROKES = playground(
  'cyanophage-like percentages: pairs and skipgrams over keystrokes, one space per word, every character typed or not',
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
      // The Doc took its SFB from Genkey (§13.3), which divides by the letters it types.
      sfb: [
        {
          title: 'Genkey source, semilin/genkey',
          url: 'https://github.com/semilin/genkey',
          locator:
            'output.go, layout.go — SFBs as a percent of the letters on the layout’s keys (Total), no space',
        },
      ],
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
      ],
      fsb: [
        cyanophage(
          '"Scissors" — the cyanophage-like definition: adjacent columns, two or more rows apart, two fingers of one hand, unweighted',
        ),
        KEYSTROKES,
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
      ],
      weak_redirect: [
        cyanophage(
          '"weak redirect" trigram category — the cyanophage-like definition: three different fingers, none an index',
        ),
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
      // Its scissors are unweighted.
      fsb: [SCISSOR_WEIGHTS],
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
