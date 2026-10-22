import { getGeometryPreset } from '../geometry/presets.js';
import type { AdaptiveTrigger, Binding, ComboDef, LayerDef, Mod } from '../layout/types.js';
import { type ClassicDef, REPEAT, raw } from './classic.js';
import { DEFAULT_LAYER_IDS, defaultLayers, SYMBOLS_CORE } from './templates.js';

/*
 * Layouts made for small boards: a letter on a thumb, letters on chords, adaptive and repeat keys,
 * boards under thirty keys. Each arrangement is copied from its author's own firmware or page,
 * its `link`; where a source left something out, the description says what.
 */

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });
const macro = (symbols: string): Binding => ({ kind: 'macro', symbols });
const after = (symbols: string, binding: Binding): AdaptiveTrigger => ({
  afterAny: symbols.split(''),
  binding,
});

/** Keys every one of these layouts has that type nothing the analysis counts. */
const COMMON = {
  bspc: raw('⌫'),
  ret: raw('⏎'),
  esc: raw('Esc'),
  '∅': null,
} satisfies Record<string, Binding | null>;

/**
 * Pascal Getreuer's adaptive key, his "magic key", for Magic Sturdy (`getreuer.c`,
 * `get_alt_repeat_key_keycode_user`): the rules that type letters. His Vim rule for `n`, the code
 * snippets, and what the repeat key types after the adaptive key are left out.
 */
const STURDY_ADAPTIVE: Binding = {
  kind: 'adaptive',
  triggers: [
    after(' ', macro('the')),
    after('a', kp('o')),
    after('o', kp('a')),
    after('e', kp('u')),
    after('u', kp('e')),
    after('i', macro('on')),
    after('m', macro('ent')),
    after('q', macro('uen')),
    after('t', macro('ment')),
    after('cdgp', kp('y')),
    after('y', kp('p')),
    after('ls', kp('k')),
    after('r', kp('l')),
  ],
};

/**
 * Nordrassil's arcane key repeats a letter its own hand typed. After the other hand it is an
 * adaptive key whose outputs the author publishes only in a pastebin; that half is not modelled.
 */
function arcane(hand: string): Binding {
  return { kind: 'adaptive', triggers: [{ afterAny: hand.split(''), binding: REPEAT }] };
}
const NORDRASSIL_LEFT = "jyouhiea-./',;x";
const NORDRASSIL_RIGHT = 'qgnwkmdrspvzclfbt';

const HANDS_DOWN = 'https://github.com/moutis/HandsDown';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const without = (letters: string) => [...LETTERS].filter((c) => !letters.includes(c));

/**
 * Uno's two adaptive keys, as its page states them: `hm` types m after a vowel or a consonant
 * other than t s c p g w x, and h otherwise; `on` types n after e a o i u, and o otherwise.
 */
const UNO_HM: Binding = {
  kind: 'adaptive',
  default: kp('h'),
  triggers: [{ afterAny: without('tscpgwx'), binding: kp('m') }],
};
const UNO_ON: Binding = {
  kind: 'adaptive',
  default: kp('o'),
  triggers: [after('eaoiu', kp('n'))],
};

// ---------------------------------------------------------------- Magic Romak

const VOWELS = ['a', 'e', 'i', 'o', 'u', 'á', 'à', 'ã', 'â', 'é', 'ê', 'í', 'ó', 'õ', 'ô', 'ú'];

/**
 * The same press, tagged instead of arming a layer. The tag is what an adaptive branch matches on,
 * so the follow-ups live on the alt-repeat key itself rather than on a layer nobody visits.
 */
const ALPHA2_TAG = 'alpha2';
const taggedAccent = (symbol: string): Binding => ({
  kind: 'macro',
  symbols: symbol,
  tag: ALPHA2_TAG,
});

function rowBindings(map: Record<string, string | Binding>): Record<string, Binding> {
  const out: Record<string, Binding> = {};
  for (const [k, v] of Object.entries(map)) out[k] = typeof v === 'string' ? kp(v) : v;
  return out;
}

const CCEDIL_BINDINGS: Record<string, Binding> = {
  '*': { kind: 'trans' },
  LHI: { kind: 'macro', symbols: 'ão' },
  LBI: { kind: 'macro', symbols: 'ões' },
  RHI: kp('ã'),
  RBI: kp('õ'),
  L1: { kind: 'sl', layer: 'alpha2' },
};

// ---------------------------------------------------------------- Numbers and Symbols

/** The thumbs that reach the two layers from Alpha 1, as `ltn_num_spc` and `msl_sym_a2` do. */
const SPACE_OR_NUMBERS: Binding = {
  kind: 'hold_tap',
  tap: kp(' '),
  hold: { kind: 'mo', layer: 'num' },
};
const ALPHA2_OR_SYMBOLS: Binding = {
  kind: 'hold_tap',
  tap: { kind: 'sl', layer: 'alpha2' },
  hold: { kind: 'mo', layer: 'sym' },
};

/**
 * The Numbers and Symbols layers of the author's keymap, `numbers_layer` and `symbols_layer` in
 * `zmk/definitions/keymap.dtsi` of github.com/rafaelromao/keyboards. They use only the 24-key
 * core, and every board's default layers start from them (`templates.ts`). Each key is what it
 * types: the firmware's symbol tap-holds jump to the end of the line or past the cursor first when
 * held, which is editing rather than typing, and are left out, as are the holds that reach its
 * layers that type nothing (functions, media, macros). Keys it leaves empty are empty here.
 *
 * Magic Romak has the default Numbers and the keymap's Symbols in their place, on these thumbs
 * (`magicRomakLayers`).
 */
const NUMBERS_THUMBS: Record<string, Binding> = {
  LHP: kp(','),
  L1: { kind: 'trans' },
  L0: { kind: 'trans' },
  R0: { kind: 'hold_tap', tap: kp(' '), hold: { kind: 'mo', layer: 'sym' } },
  R1: kp('0'),
};

const SYMBOLS_THUMBS: Record<string, Binding> = {
  RHP: kp('_'),
  L1: { kind: 'trans' },
  // The firmware's hold here reaches a copy of Numbers placed above Symbols, which only its layer
  // order needs. The digits are one hold away from Alpha 1 either way.
  L0: kp(' '),
  R1: { kind: 'trans' },
};

const THUMBS = new Set(['L0', 'L1', 'R0', 'R1']);

/**
 * Magic Romak's Numbers and Symbols. Numbers is the default layer with the keymap's thumbs, and its
 * empty keys there empty; Symbols is the keymap's whole. It has no Extras and no Accents, the
 * keymap having neither: its combos type the accents and the few symbols they carried
 * (`alpha2Combos`, `KEYMAP_SYMBOL_COMBOS`), and what they don't, it doesn't type.
 */
function magicRomakLayers(): LayerDef[] {
  const numbers = defaultLayers(getGeometryPreset('1333+2')).layers.find(
    (l) => l.id === DEFAULT_LAYER_IDS.numbers,
  );
  if (!numbers) throw new Error('The default layers have no Numbers');
  const keys = Object.entries(numbers.bindings).filter(([id]) => id !== '*' && !THUMBS.has(id));
  return [
    {
      ...numbers,
      bindings: { '*': { kind: 'none' }, ...Object.fromEntries(keys), ...NUMBERS_THUMBS },
    },
    {
      id: DEFAULT_LAYER_IDS.symbols,
      name: 'Symbols',
      bindings: { '*': { kind: 'none' }, ...rowBindings(SYMBOLS_CORE), ...SYMBOLS_THUMBS },
    },
  ];
}

const dead = (diacritic: string): Binding => ({ kind: 'dead_key', diacritic });

const ALPHA1_24 = rowBindings({
  LHP: 'd',
  LTR: 'b',
  LHR: 'n',
  LBR: 'f',
  LTM: 'm',
  LHM: 's',
  LBM: 'c',
  LTI: 'g',
  LHI: 't',
  LBI: 'p',
  RTI: 'l',
  RHI: 'r',
  RBI: 'h',
  RTM: 'o',
  RHM: 'a',
  RBM: ',',
  RTR: 'u',
  RHR: 'e',
  RBR: '.',
  RHP: 'i',
});

function alpha2Bindings(): Record<string, Binding> {
  const acc = taggedAccent;
  return {
    '*': { kind: 'trans' },
    LHP: kp('y'),
    LTR: kp('q'),
    LHR: kp('z'),
    LBR: kp('j'),
    LTM: { kind: 'macro', symbols: 'qu', tag: ALPHA2_TAG },
    LHM: kp('x'),
    LBM: { kind: 'macro', symbols: '\u00e7', then: [{ kind: 'sl', layer: 'ccedil' }] },
    LTI: kp('k'),
    LHI: kp('w'),
    LBI: kp('v'),
    RTI: acc('\u00f4'),
    RHI: acc('\u00e3'),
    RBI: acc('\u00f5'),
    RTM: acc('\u00f3'),
    RHM: acc('\u00e1'),
    RBM: acc('\u00e2'),
    RTR: acc('\u00fa'),
    RHR: acc('\u00e9'),
    RBR: acc('\u00ea'),
    RHP: acc('\u00ed'),
    L1: kp("'"),
    R1: kp("'"),
  };
}

/** The shortcuts on Alpha 1 for letters Alpha 2 has; never pressed by the analysis. */
function alpha1Combos(): ComboDef[] {
  return [
    {
      id: 'ns',
      keys: ['LHR', 'LHM'],
      binding: kp('q'),
      layers: ['alpha1'],
      role: 'command',
      timeoutMs: 30,
      slowRelease: false,
    },
    {
      id: 'mg',
      keys: ['LTM', 'LTI'],
      binding: kp('k'),
      layers: ['alpha1'],
      role: 'command',
      timeoutMs: 30,
      slowRelease: false,
    },
    {
      id: 'st',
      keys: ['LHM', 'LHI'],
      binding: kp('w'),
      layers: ['alpha1'],
      role: 'command',
      timeoutMs: 30,
      slowRelease: false,
    },
    {
      id: 'cp',
      keys: ['LBM', 'LBI'],
      binding: kp('v'),
      layers: ['alpha1'],
      role: 'command',
      timeoutMs: 30,
      slowRelease: false,
    },
    {
      id: 'lo',
      keys: ['RTI', 'RTM'],
      binding: kp('x'),
      layers: ['alpha1'],
      role: 'command',
      timeoutMs: 30,
      slowRelease: false,
    },
    {
      id: 'ra',
      keys: ['RHI', 'RHM'],
      binding: kp('z'),
      layers: ['alpha1'],
      role: 'command',
      timeoutMs: 30,
      slowRelease: false,
    },
    {
      id: 'hcomma',
      keys: ['RBI', 'RBM'],
      binding: kp('j'),
      layers: ['alpha1'],
      role: 'command',
      timeoutMs: 30,
      slowRelease: false,
    },
    {
      id: 'ae',
      keys: ['RHM', 'RHR'],
      binding: kp('y'),
      layers: ['alpha1'],
      role: 'command',
      timeoutMs: 30,
      slowRelease: false,
    },
  ];
}

function typingCombo(id: string, keys: string[], binding: Binding, layers: string[]): ComboDef {
  return {
    id,
    keys,
    binding,
    layers,
    role: 'typing',
    timeoutMs: 30,
    slowRelease: false,
  };
}

const alpha2Combo = (id: string, keys: string[], binding: Binding): ComboDef =>
  typingCombo(id, keys, binding, ['alpha2']);

const tapOrHeld = (tap: string, held: string): Binding => ({
  kind: 'hold_tap',
  tap: kp(tap),
  hold: kp(held),
});

/**
 * Alpha 2's combos in the keymap (`zmk/features/combos.dtsi`): the accents Alpha 2 has no key for,
 * as dead keys \u2014 the keymap types an apostrophe, a double quote, a grave, a caret and a tilde,
 * which the host composes with the next letter, so each is the accent it stands for \u2014 then `-`
 * and `:`, `?` and `!`, which type `\u00bf` and `\u00a1` when held, and `\u00e0`.
 */
function alpha2Combos(): ComboDef[] {
  return [
    alpha2Combo('minus', ['RTI', 'RTM'], kp('-')),
    alpha2Combo('diaeresis', ['LTM', 'LTI'], dead('\u00a8')),
    alpha2Combo('acute', ['LHM', 'LHI'], dead('\u00b4')),
    alpha2Combo('grave', ['LBM', 'LBR'], dead('`')),
    alpha2Combo('circumflex', ['LHR', 'LHM'], dead('^')),
    alpha2Combo('tilde', ['LBI', 'LBM'], dead('~')),
    alpha2Combo('question', ['RHI', 'RHM'], tapOrHeld('?', '\u00bf')),
    alpha2Combo('exclamation', ['RBI', 'RBM'], tapOrHeld('!', '\u00a1')),
    alpha2Combo('colon', ['RBM', 'RBR'], kp(':')),
    alpha2Combo('agrave', ['RHM', 'RHR'], taggedAccent('\u00e0')),
  ];
}

/**
 * `;` on Alpha 1 and Numbers, the keymap's `cb_semi`. Held, the keymap jumps to the end of the line
 * before typing it, which is editing rather than typing, and is left out.
 */
const SEMICOLON_COMBO: ComboDef = {
  id: 'semicolon',
  keys: ['RBM', 'RBR'],
  binding: kp(';'),
  layers: ['alpha1', 'num'],
  role: 'typing',
  timeoutMs: 30,
  slowRelease: false,
};

/**
 * The keymap's combos for the symbols the default layers would have put on Extras: `cb_eu` on
 * Symbols, and `cb_deg` and `cb_ord_o` on Numbers. Held, `cb_eu` types "EUR", a word rather than a
 * symbol, and is left out; `cb_ord_o` types `ª`.
 */
const KEYMAP_SYMBOL_COMBOS: ComboDef[] = [
  typingCombo('euro', ['RTR', 'RTM', 'RTI'], kp('€'), ['sym']),
  typingCombo('degree', ['RBR', 'RBM', 'RBI'], kp('°'), ['num']),
  typingCombo('ordinal', ['RHR', 'RHM', 'RHI'], tapOrHeld('º', 'ª'), ['num']),
];

/**
 * The home block mods of the author's keymap, on the keys Magic Romak has: Ctrl, Alt and Shift
 * from the ring finger in; Shift and Gui together on the left ring and middle fingers' bottom keys,
 * and Gui on the index fingers', the magic key's among them (`ht_magic`). The pinkies hold a layer
 * of shortcuts, which types nothing, and the `,` and `.` keys hold to move the cursor, which is
 * editing: both are left out.
 */
const MAGIC_ROMAK_MODS: Record<string, Mod | Binding> = {
  LHR: 'LCTRL',
  LHM: 'LALT',
  LHI: 'LSHIFT',
  LBR: { kind: 'mod', mod: 'LGUI', also: ['LSHIFT'] },
  LBM: { kind: 'mod', mod: 'LGUI', also: ['LSHIFT'] },
  LBI: 'LGUI',
  RHI: 'LSHIFT',
  RHM: 'LALT',
  RHR: 'LCTRL',
  RBI: 'LGUI',
};

/** An adaptive key: types `fallback`, or `afterVowel` when a vowel came just before it. */
const adaptiveKey = (fallback: string, afterVowel: string): Binding => ({
  kind: 'adaptive',
  default: kp(fallback),
  triggers: [{ afterAny: VOWELS, binding: kp(afterVowel) }],
});

/**
 * The alt repeat: repeats the key before it, unless a branch matches. Branches are tried from the
 * top, so the three that need the `alpha2` tag — a press from an accent or `qu`, never a plain
 * letter — come first: they do what the firmware's one-shot "alt repeat 2" layer does.
 */
const ALT_REPEAT: Binding = {
  kind: 'adaptive',
  default: { kind: 'key_repeat' },
  triggers: [
    {
      afterAny: ['á', 'à', 'ã', 'â', 'ó', 'õ', 'ô', 'é', 'ê'],
      afterTags: [ALPHA2_TAG],
      binding: kp('x'),
    },
    { afterAny: ['í'], afterTags: [ALPHA2_TAG], binding: kp('e') },
    { afterAny: ['u', 'ú'], afterTags: [ALPHA2_TAG], binding: taggedAccent('ê') },
    { afterAny: ['a'], binding: kp('h') },
    { afterAny: ['y'], binding: kp('d') },
    { afterAny: ['h'], binding: { kind: 'macro', symbols: 'ões' } },
    { afterAny: ['v', 'x', 'j'], binding: { kind: 'sl', layer: 'alpha2' } },
    { afterAny: ["'"], binding: kp('v') },
    { afterAny: ['I'], binding: kp("'") },
  ],
};

export const SMALL_DEFS: ClassicDef[] = [
  /**
   * Magic Romak: Romak on 24 keys, two alpha layers and the adaptive behaviours.
   *
   * The firmware needs four extra layers for these — pre-shifted copies of the alphas for sentence
   * case, caps word and shifted Alpha 2, and a one-shot layer armed by every accent macro so the
   * repeat key can offer follow-ups. None of them is a layer a typist reaches. Sentence case and
   * caps word are declared as features, which wrap the space and shift keys: sentence case arms a
   * one-shot shift, caps word is the `caps_word` behaviour, and shift is simply shift state. The
   * `h`/`v` keys and the alt repeat are adaptive keys on their own keys, and the alt-repeat
   * follow-ups match on the tag the accent macro leaves behind. What is left is the layers you can
   * see. It brings its keymap's own Numbers and Symbols, which the default layers leave as they
   * are, and its keymap's home block mods (`MAGIC_ROMAK_MODS`) in place of the default ones.
   */
  {
    id: 'magic-romak',
    name: 'Magic Romak',
    author: 'Rafael Romão',
    geometry: '1333+2',
    base: { id: 'alpha1', name: 'Alpha 1' },
    // Holding space reaches the numbers and holding the Alpha 2 key the symbols; the sentence-case
    // feature wraps the space's tap, so both live on one key.
    byKey: {
      ...ALPHA1_24,
      RBI: adaptiveKey('h', 'v'),
      L1: ALT_REPEAT,
      L0: SPACE_OR_NUMBERS,
      R0: ALPHA2_OR_SYMBOLS,
      R1: { kind: 'sk', mod: 'LSHIFT' },
    },
    space: 'L0',
    layers: [
      { id: 'alpha2', name: 'Alpha 2', byKey: { ...alpha2Bindings(), LBI: adaptiveKey('v', 'h') } },
      { id: 'ccedil', name: '\u00c7 extension', byKey: CCEDIL_BINDINGS },
      ...magicRomakLayers().map(({ id, name = id, bindings }) => ({ id, name, byKey: bindings })),
    ],
    combos: [...alpha1Combos(), SEMICOLON_COMBO, ...alpha2Combos(), ...KEYMAP_SYMBOL_COMBOS],
    shift: { key: 'R1', kind: 'sk' },
    behaviorDefaults: {
      sl: { quickRelease: true, ignoreModifiers: false, releaseAfterMs: 1000 },
      sk: { quickRelease: true, ignoreModifiers: true, releaseAfterMs: 1500 },
    },
    repeatPolicy: { doubledLetters: 'repeatKey' },
    features: {
      sentenceCase: {},
      // Matches what the pre-shifted layer allowed through before.
      capsWord: { continueList: ['_', 'Backspace'] },
    },
    activators: {
      alpha2: [
        { from: 'alpha1', via: 'key:alpha1/R0' },
        { from: 'ccedil', via: 'key:ccedil/L1' },
      ],
      num: [{ from: 'alpha1', via: 'key:alpha1/L0' }],
      sym: [
        { from: 'alpha1', via: 'key:alpha1/R0' },
        { from: 'num', via: 'key:num/R0' },
      ],
    },
    homeRowMods: MAGIC_ROMAK_MODS,
    description:
      'Romak 24 with adaptive keys (h/v), alt repeat, sentence case, caps word, and dead keys for Spanish, French and Italian.',
    link: 'https://rafaelromao.github.io/romak',
  },
  {
    id: 'hands-down-gold',
    name: 'Hands Down Gold',
    author: 'Alan Reiser',
    rows: 'j g m p v # . / " \'\nr s n d b , a e i h\nx f l c w - u o y k',
    thumbs: 'bspc t space ret',
    special: COMMON,
    combos: [
      { keys: 'g p', types: 'q' },
      { keys: 's d', types: 'z' },
    ],
    description: 'Hands Down Gold: t on a thumb, q and z on chords.',
    link: HANDS_DOWN,
    note: 'Letters from layouts/hd/au-config.h.',
  },
  {
    id: 'hands-down-promethium',
    name: 'Hands Down Promethium',
    author: 'Alan Reiser',
    rows: 'v w g m j # . / " \'\ns n t h k , a e i c\nf p d l x - u o y b',
    thumbs: 'bspc r space ret',
    special: COMMON,
    combos: [
      { keys: 'w m', types: 'q' },
      { keys: 'n h', types: 'z' },
    ],
    description: 'Hands Down Promethium: r on a thumb, q and z on chords.',
    link: HANDS_DOWN,
    note: 'Letters from layouts/hd/pm-config.h.',
  },
  {
    id: 'hands-down-vibranium',
    name: 'Hands Down Vibranium',
    author: 'Alan Reiser',
    rows: 'x w m g j # . / " \'\ns c n t k , a e i h\nb p l d v - u o y f',
    thumbs: 'bspc r space ret',
    special: COMMON,
    combos: [
      { keys: 'w g', types: 'q' },
      { keys: 'c t', types: 'z' },
    ],
    description: 'Hands Down Vibranium: r on a thumb, q and z on chords.',
    link: HANDS_DOWN,
    note: 'Letters from layouts/hd/vb-config.h.',
  },
  {
    id: 'rsthd',
    name: 'RSTHD',
    author: 'xsznix',
    rows: 'j c y f k z l , u q\nr s t h d m n a i o\n/ v g p b x w . ; -',
    // The author's thumbs are e, Backspace, Enter and space: e and space move to the inner thumbs,
    // where the other layouts have their space and thumb letter.
    thumbs: 'bspc e space ret',
    special: COMMON,
    description:
      "RSTHD: e on the left thumb, from its author's ErgoDox firmware; the outer columns' = and ' do not fit thirty-four keys.",
    link: 'https://github.com/xsznix/qmk_firmware/blob/master/keyboards/ergodox_ez/keymaps/rsthd/keymap.c',
  },
  {
    id: 't-34',
    name: 'T-34',
    author: 'Jonas Hietala',
    rows: 'j c y f p x w o u .\nr s t h k m n a i ⟲\n, v g d b / l ( ) _',
    thumbs: 'shrt space e spec',
    special: { ...COMMON, '⟲': REPEAT, shrt: raw('Shrt'), spec: raw('Spec') },
    combos: [
      { keys: 'j c', types: 'q' },
      { keys: 'c y', types: 'qu' },
      { keys: 'y f', types: 'z' },
    ],
    description: 'T-34: e on the right thumb, a repeat key on the home row, q, qu and z on chords.',
    link: 'https://github.com/treeman/qmk_firmware/tree/master/keyboards/ferris/keymaps/treeman',
    note: 'Letters from keymap.c and combos.def.',
  },
  {
    id: 'magic-sturdy',
    name: 'Magic Sturdy',
    author: 'Ikcelaks, as Pascal Getreuer types it',
    rows: "v m l c p b ★ u o q\ns t r d y f n e a i\nx k j g w z h , . '",
    thumbs: 'unds space ⟲ esc',
    special: { ...COMMON, '★': STURDY_ADAPTIVE, '⟲': REPEAT, unds: kp('_') },
    description:
      'Magic Sturdy: an adaptive key in the letter block and a repeat key on a thumb. Its rules are the ones that type letters.',
    link: 'https://github.com/getreuer/qmk-keymap',
    note: 'Letters from getreuer.c.',
  },
  {
    id: 'enthium',
    name: 'Enthium',
    author: 'Suraj N. Kurapati (sunaku)',
    geometry: '3x6+3',
    rows: "∅ q y o u = x l d p z ∅\nb c i a e - k h t n s w\n∅ ' , . ; / j m g f v ∅",
    thumbs: '∅ ∅ space r ∅ ∅',
    special: COMMON,
    description:
      'Enthium v14: r on the right thumb, b and w on the outer pinky keys, so a forty-two-key board.',
    link: 'https://github.com/sunaku/enthium',
    note: 'Letters from layout.json.',
  },
  {
    id: 'nordrassil',
    name: 'Nordrassil',
    author: 'empressabyss',
    geometry: '3x6+3',
    rows: "∅ j y o u - q g n w k ∅\n∅ h i e a . m d r s p v\n∅ x / ' , ; z c l f b ∅",
    thumbs: '∅ space ⟐l ⟐r t ∅',
    special: { ...COMMON, '⟐l': arcane(NORDRASSIL_LEFT), '⟐r': arcane(NORDRASSIL_RIGHT) },
    description:
      "Nordrassil as its README publishes it: t on the right thumb and an arcane key on each, modelled as repeating the letter its own hand typed (the author's adaptive outputs are not published with it). The README notes a 2025 refinement.",
    link: 'https://github.com/empressabyss/nordrassil',
  },
  {
    id: 'finch',
    name: 'Finch',
    author: 'grassfedreeve',
    geometry: '13332+1',
    rows: "l y w f o ,\nc r s t m p n a i u\nx g d k b h ' .",
    thumbs: 'space e',
    special: COMMON,
    combos: [
      { keys: 'w y', types: 'qu' },
      { keys: 'l y', types: 'v' },
      { keys: 'x g', types: 'z' },
      { keys: 'd g', types: 'j' },
    ],
    description:
      'Finch on its native twenty-six-key board: e on a thumb; v, z, j and qu on chords. Its adaptive swaps are not modelled.',
    link: 'https://github.com/grassfedreeve/finch',
    note: 'Combos from https://github.com/grassfedreeve/zmk-config-akohekohe.',
  },
  {
    id: 'caksoylar',
    name: "Cem Aksoylar's Colemak-DH",
    author: 'Cem Aksoylar (caksoylar)',
    geometry: '23332+2',
    rows: "q w f p l u y '\na r s t b k n e i o\nx c d g m h , .",
    thumbs: 'esc space sym ret',
    special: { ...COMMON, sym: raw('Sym') },
    combos: [
      { keys: 'w f', types: 'q' },
      { keys: 'f p', types: 'j' },
      { keys: 'c d', types: 'v' },
      { keys: 'x c', types: 'z' },
    ],
    description:
      "The Colemak-DH variant one of ZMK's maintainers types on his thirty-key Rommana: j, v and z on chords.",
    link: 'https://github.com/caksoylar/zmk-config',
    note: 'Letters from keymap-drawer/rommana.yaml.',
  },
  {
    id: 'uno',
    name: 'Uno',
    author: 'Giorgi Chavchanidze',
    byKey: {
      LTP: ',',
      LTR: 'j',
      LTM: 'b',
      LTI: 'w',
      LTC: 'y',
      RTC: 'g',
      RTI: 'p',
      RTM: 'v',
      RTR: 'n',
      RTP: '-',
      LHP: 'f',
      LHR: 'hm',
      LHM: 'on',
      LHI: 'e',
      LHC: 'u',
      RHC: 'd',
      RHI: 't',
      RHM: 'space',
      RHR: 's',
      RHP: 'c',
      LBP: '.',
      LBR: 'z',
      LBM: 'x',
      LBI: 'o',
      LBC: "'",
      RBC: 'k',
      RBI: 'm',
      RBM: 'q',
      RBR: 'h',
      RBP: '/',
      L1: 'i',
      L0: 'a',
      R0: 'r',
      R1: 'l',
    },
    special: { hm: UNO_HM, on: UNO_ON },
    description:
      'Uno: a, i, r and l on the thumbs, space under the right middle finger, and two adaptive keys (h or m, o or n). Made for a 5×15 ortholinear grid; its letters fit thirty-four keys. Thumb letters as in its QMK keymap.',
    link: 'https://lykt.xyz/uno/',
    note: 'That keymap is at https://github.com/gkbd/qmk_firmware/tree/one/keyboards/idobo/keymaps/gkbd_uno.',
  },
  {
    id: 'ben-vallack-piano',
    name: 'Ben Vallack Piano',
    author: 'Ben Vallack',
    geometry: '1222+2',
    byKey: {
      LTR: 'l',
      LTM: 'g',
      LTI: 'd',
      RTI: 'h',
      RTM: 'u',
      RTR: 'o',
      LHP: 'i',
      LHR: 's',
      LHM: 'r',
      LHI: 't',
      RHI: 'n',
      RHM: 'e',
      RHR: 'a',
      RHP: 'c',
      L1: 'space',
      L0: '⇧',
      R0: 'caps2',
      R1: 'alpha2',
    },
    layers: [
      {
        id: 'alpha2',
        name: 'Alpha 2',
        byKey: {
          LTR: 'v',
          LTM: 'w',
          LTI: 'm',
          RTI: 'f',
          RTM: "'",
          RTR: 'z',
          LHP: 'q',
          LHR: 'j',
          LHM: 'p',
          LHI: 'k',
          RHI: 'b',
          RHM: '.',
          RHR: 'x',
          RHP: 'y',
        },
      },
    ],
    special: {
      '⇧': { kind: 'sk', mod: 'LSHIFT' },
      alpha2: { kind: 'sl', layer: 'alpha2' },
      caps2: raw('⇧A2'),
    },
    description:
      'Eighteen keys: fourteen letters on the base layer, the rest one tap away on a second letter layer, and a one-shot Shift where its keymap has a repeat key.',
    link: 'https://github.com/benvallack/zmk-config-piano',
    note: 'Letters from piano.keymap.',
  },
];
