/**
 * Where each rule comes from.
 *
 * Kept apart from the rules themselves on purpose: a rule set is a document, written and read by
 * another engine too, and citations are facts about the catalog rather than settings of a set. A
 * saved or shared rule set therefore shows the same sources as the catalog rule it was made from,
 * without carrying them.
 *
 * Every locator was checked against its source when it was written. A rule LayoutMaster added
 * cites the glossary and says so, rather than borrowing another tool's authority.
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

const keysolve = (locator: string): RuleReference => ({
  title: 'Keysolve README',
  url: 'https://github.com/grassfedreeve/keysolve-web/blob/master/README.md',
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
export const GLOSSARY_URL = 'https://github.com/rafaelromao/layoutmaster/blob/main/docs/METRICS.md';
const glossary = (anchor: string, locator: string): RuleReference => ({
  title: 'LayoutMaster metric glossary',
  url: `${GLOSSARY_URL}#${anchor}`,
  locator,
});

const THRESHOLDS = kld('§13.4 Stats thresholds — bands');
const TRIGRAMS = kld('§8.1 Alts, rolls, 3rolls & redir — definition');
const LAYERS = 'layers-layoutmaster-specific';
const ADDITION = 'LayoutMaster addition';

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
  fsb: [
    kld('§6.2 Full scissors bigrams (FSBs) — definition'),
    kld('§6.5 Adjacent vs non adjacent scissors — weights'),
    THRESHOLDS,
  ],
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

  alternation: [TRIGRAMS, kld('§18.1 Alternation'), THRESHOLDS],
  alt_sfs: [cyanophage('"alt sfs" trigram category')],
  roll_in: [TRIGRAMS, kld('§15.1 In-rolls & out-rolls')],
  roll_out: [TRIGRAMS, kld('§15.1 In-rolls & out-rolls')],
  rolls: [TRIGRAMS, kld('§16.1 Rolls & redirects'), THRESHOLDS],
  in_out_ratio: [kld('§15.5 In-roll ratio'), THRESHOLDS],
  onehand_in: [TRIGRAMS, kld('§17.1 3rolls')],
  onehand_out: [TRIGRAMS, kld('§17.1 3rolls')],
  redirect: [TRIGRAMS, kld('§16.1 Rolls & redirects'), THRESHOLDS],
  weak_redirect: [kld('§8.9 “Weak” redirects')],

  finger_usage: [
    kld('§4.8 Distributing movement across the fingers'),
    glossary('usage', 'Finger usage'),
  ],
  hand_balance: [kld('§13.5 Hand balance nuances'), kld('§16.4.5 Hand balance and space')],
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

  effort: [cyanophage('Effort — per-key grid, 577 × Σ effort ÷ input length')],
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
  /** What the preset as a whole follows. */
  preset: readonly RuleReference[];
  /** Rules the preset redefines, which then answer to a different source first. */
  rules: Readonly<Record<string, readonly RuleReference[]>>;
}

export const PRESET_REFERENCES: Readonly<Record<string, PresetReferences>> = {
  layouts_doc: {
    preset: [kld('definitions throughout; §13.4 Stats thresholds')],
    rules: {},
  },
  cyanophage: {
    preset: [
      {
        title: 'cyanophage keyboard layout playground',
        url: 'https://cyanophage.github.io/playground.html',
        locator: 'bigram percentages over keystrokes, one space per word',
      },
    ],
    rules: {
      lsb: [cyanophage('"Lat Stretch Bigrams" — fixed column pairs')],
      fsb: [cyanophage('"Scissors" — adjacent fingers, two or more rows apart')],
      redirect: [cyanophage('"redirect" trigram category')],
    },
  },
  keysolve: {
    preset: [keysolve('metric definitions'), kld('§6.9 Keysolve analyzer')],
    rules: {
      fsb: [keysolve('FS — full scissor'), kld('§6.9 Keysolve analyzer')],
      hsb: [keysolve('HS — half scissor')],
    },
  },
};

/**
 * The sources for one rule. Under a preset that redefines the rule, the preset's source comes
 * first, since that is the definition in force; the catalog's follow as background.
 */
export function ruleReferences(ruleId: string, presetId?: string): RuleReference[] {
  const base = RULE_REFERENCES[ruleId] ?? [];
  const override = presetId ? (PRESET_REFERENCES[presetId]?.rules[ruleId] ?? []) : [];
  return [...override, ...base];
}
