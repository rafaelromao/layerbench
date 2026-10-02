import type { Binding, ComboDef, Layout } from '../layout/types.js';

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'á', 'à', 'ã', 'â', 'é', 'ê', 'í', 'ó', 'õ', 'ô', 'ú'];

/**
 * Accented letter as the firmware writes it: one physical press, then the ALTREP2 one-shot layer is
 * armed so the repeat key can offer the follow-ups. Kept for Romak 24 and 34, which model the
 * keymap literally.
 */
const accent = (symbol: string): Binding => ({
  kind: 'macro',
  symbols: symbol,
  then: [{ kind: 'sl', layer: 'altrep2' }],
});

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

const behaviors: Record<string, Binding> = {
  magic: {
    kind: 'adaptive',
    default: kp('h'),
    triggers: [{ afterAny: VOWELS, binding: kp('v') }],
  },
  reversedMagic: {
    kind: 'adaptive',
    default: kp('v'),
    triggers: [{ afterAny: VOWELS, binding: kp('h') }],
  },
  altRepeat: {
    kind: 'adaptive',
    default: { kind: 'key_repeat' },
    triggers: [
      { afterAny: ['a'], binding: kp('h') },
      { afterAny: ['y'], binding: kp('d') },
      { afterAny: ['h'], binding: { kind: 'macro', symbols: 'ões' } },
      { afterAny: ['v', 'x', 'j'], binding: { kind: 'sl', layer: 'alpha2' } },
      { afterAny: ["'"], binding: kp('v') },
      { afterAny: ['I'], binding: kp("'") },
    ],
  },
  a2AltRepeat: {
    kind: 'adaptive',
    default: { kind: 'adaptive', ref: 'altRepeat' },
    triggers: [
      { afterAny: ['á', 'à', 'ã', 'â', 'ó', 'õ', 'ô', 'é', 'ê'], binding: kp('x') },
      { afterAny: ['í'], binding: kp('e') },
      { afterAny: ['u', 'ú'], binding: accent('ê') },
    ],
  },
  sentenceSpace: {
    kind: 'adaptive',
    default: kp(' '),
    triggers: [
      {
        afterAny: ['.', '?', '!'],
        binding: { kind: 'macro', steps: [kp(' '), { kind: 'sl', layer: 'sen_case' }] },
      },
    ],
  },
  shiftOrCaps: {
    kind: 'mod_morph',
    mods: ['LSHIFT', 'RSHIFT'],
    default: { kind: 'sk', mod: 'LSHIFT' },
    morphed: { kind: 'auto_layer', layer: 'case_a1' },
  },
  alpha2OrShifted: {
    kind: 'mod_morph',
    mods: ['LSHIFT', 'RSHIFT'],
    default: { kind: 'sl', layer: 'alpha2' },
    morphed: { kind: 'sl', layer: 'sft_a2' },
  },
};

const CCEDIL_BINDINGS: Record<string, Binding> = {
  '*': { kind: 'trans' },
  LHI: { kind: 'macro', symbols: 'ão' },
  LBI: { kind: 'macro', symbols: 'ões' },
  RHI: kp('ã'),
  RBI: kp('õ'),
  L1: { kind: 'sl', layer: 'alpha2' },
};

const ALTREP2_BINDINGS: Record<string, Binding> = {
  '*': { kind: 'trans' },
  L1: { kind: 'ref', ref: 'a2AltRepeat' },
};

// ---------------------------------------------------------------- Numbers and Symbols

/**
 * A hold reaching one of the keymap's layers this model does not carry — functions, media, macros.
 * Kept as an imported key, so the board still says where the layer is; it types nothing.
 */
const unmodelled = (layer: string): Binding => ({
  kind: 'raw',
  label: layer,
  source: `&mo ${layer}`,
});
const tapOrUnmodelled = (symbol: string, layer: string): Binding => ({
  kind: 'hold_tap',
  tap: kp(symbol),
  hold: unmodelled(layer),
});

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
 * core, so the three Romak layouts share them. Each key is what it types: the firmware's symbol
 * tap-holds jump to the end of the line or past the cursor first when held, which is editing
 * rather than typing, and are left out. Keys it leaves empty are empty here.
 */
const NUMBERS_BINDINGS: Record<string, Binding> = {
  '*': { kind: 'none' },
  LTR: kp('\\'),
  LTM: kp('{'),
  LTI: kp('}'),
  LHP: tapOrUnmodelled(',', 'FUN'),
  LHR: kp('&'),
  LHM: kp('('),
  LHI: kp(')'),
  LBR: kp('|'),
  LBM: kp('['),
  LBI: kp(']'),
  RTI: kp('7'),
  RTM: kp('8'),
  RTR: kp('9'),
  RHI: kp('4'),
  RHM: kp('5'),
  RHR: kp('6'),
  RHP: kp('.'),
  RBI: kp('1'),
  RBM: kp('2'),
  RBR: kp('3'),
  L1: { kind: 'trans' },
  L0: { kind: 'trans' },
  R0: { kind: 'hold_tap', tap: kp(' '), hold: { kind: 'mo', layer: 'sym' } },
  R1: tapOrUnmodelled('0', 'MEDIA'),
};

const SYMBOLS_BINDINGS: Record<string, Binding> = {
  '*': { kind: 'none' },
  LTR: kp('~'),
  LTM: kp('#'),
  LTI: kp("'"),
  LHP: kp('@'),
  LHR: kp('^'),
  LHM: kp('$'),
  LHI: kp('"'),
  LBR: kp('<'),
  LBM: kp('>'),
  LBI: kp('`'),
  RTI: kp('%'),
  RTM: kp('='),
  RTR: kp(':'),
  RHI: kp('?'),
  RHM: kp('-'),
  RHR: kp('+'),
  RHP: tapOrUnmodelled('_', 'MACROS'),
  RBI: kp('!'),
  RBM: kp('/'),
  RBR: kp('*'),
  L1: { kind: 'trans' },
  // The firmware's hold here reaches a copy of Numbers placed above Symbols, which only its layer
  // order needs. The digits are one hold away from Alpha 1 either way.
  L0: kp(' '),
  R1: { kind: 'trans' },
};

const NUMBERS_LAYER = { id: 'num', name: 'Numbers', bindings: NUMBERS_BINDINGS };
const SYMBOLS_LAYER = { id: 'sym', name: 'Symbols', bindings: SYMBOLS_BINDINGS };

// ---------------------------------------------------------------- Romak 24

const ROMAK24_ALPHA1 = rowBindings({
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

function alpha2Bindings(acc: (symbol: string) => Binding, quTag?: string): Record<string, Binding> {
  return {
    '*': { kind: 'trans' },
    LHP: kp('y'),
    LTR: kp('q'),
    LHR: kp('z'),
    LBR: kp('j'),
    LTM: {
      kind: 'macro',
      symbols: 'qu',
      ...(quTag ? { tag: quTag } : { then: [{ kind: 'sl', layer: 'altrep2' }] }),
    },
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

const ROMAK24_ALPHA2: Record<string, Binding> = alpha2Bindings(accent);

function romak24Combos(acc: (symbol: string) => Binding): ComboDef[] {
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
    {
      id: 'question',
      keys: ['RHI', 'RHM'],
      binding: kp('?'),
      layers: ['alpha2'],
      role: 'typing',
      timeoutMs: 30,
      slowRelease: false,
    },
    {
      id: 'exclamation',
      keys: ['RBI', 'RBM'],
      binding: kp('!'),
      layers: ['alpha2'],
      role: 'typing',
      timeoutMs: 30,
      slowRelease: false,
    },
    {
      id: 'agrave',
      keys: ['RHM', 'RHR'],
      binding: acc('\u00e0'),
      layers: ['alpha2'],
      role: 'typing',
      timeoutMs: 30,
      slowRelease: false,
    },
  ];
}

const ROMAK24_COMBOS: ComboDef[] = romak24Combos(accent);

function romak24Base(name: string, id: string, description: string): Layout {
  return {
    format: 'layoutmaster/layout@1',
    id,
    name,
    author: 'Rafael Romão',
    description,
    languages: ['pt-BR', 'en'],
    hostLocale: 'symbols',
    geometry: { preset: '1333+2' },
    keys: { space: 'L0', shift: { key: 'R1', kind: 'sk' } },
    behaviorDefaults: {
      sl: { quickRelease: true, ignoreModifiers: false, releaseAfterMs: 1000 },
      sk: { quickRelease: true, ignoreModifiers: true, releaseAfterMs: 1500 },
    },
    behaviors,
    layers: [
      {
        id: 'alpha1',
        name: 'Alpha 1',
        bindings: {
          ...ROMAK24_ALPHA1,
          L1: { kind: 'key_repeat' },
          L0: SPACE_OR_NUMBERS,
          R0: ALPHA2_OR_SYMBOLS,
          R1: { kind: 'sk', mod: 'LSHIFT' },
        },
      },
      { id: 'alpha2', name: 'Alpha 2', bindings: ROMAK24_ALPHA2 },
      { id: 'ccedil', name: 'Ç extension', bindings: CCEDIL_BINDINGS },
      { id: 'altrep2', name: 'Alt repeat 2', bindings: ALTREP2_BINDINGS },
      NUMBERS_LAYER,
      SYMBOLS_LAYER,
    ],
    combos: ROMAK24_COMBOS,
    repeatPolicy: { doubledLetters: 'repeatKey' },
  };
}

export const romak24: Layout = romak24Base(
  'Romak 24',
  'romak-24',
  'Romak for 24 keys (1333+2): two alpha layers, Ç extension, one-shot shift, and numbers and symbols held from the thumbs.',
);

/** A magic key: types `fallback`, or `afterVowel` when a vowel came just before it. */
const magicKey = (fallback: string, afterVowel: string): Binding => ({
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

/**
 * Magic Romak: Romak 24 plus the adaptive behaviours.
 *
 * The firmware needs four extra layers for these — pre-shifted copies of the alphas for sentence
 * case, caps word and shifted Alpha 2, and a one-shot layer armed by every accent macro so the
 * repeat key can offer follow-ups. None of them is a layer a typist reaches. Sentence case and caps
 * word are declared as features, which wrap the space and shift keys: sentence case arms a one-shot
 * shift, caps word is the `caps_word` behaviour, and shift is simply shift state. The magic keys and
 * the alt repeat are adaptive keys on their own keys, and the alt-repeat follow-ups match on the tag
 * the accent macro leaves behind. What is left is the layers you can see.
 */
export const magicRomak: Layout = (() => {
  const base = romak24Base(
    'Magic Romak',
    'magic-romak',
    'Romak 24 with adaptive magic keys (h/v), alt repeat, sentence case and caps word.',
  );
  const alpha1 = base.layers[0];
  return {
    ...base,
    behaviors: {},
    combos: romak24Combos(taggedAccent),
    layers: [
      // Holding space reaches the numbers and holding the Alpha 2 key the symbols; the
      // sentence-case feature wraps the space's tap arm, so both live on one key.
      {
        ...alpha1,
        bindings: { ...alpha1.bindings, RBI: magicKey('h', 'v'), L1: ALT_REPEAT },
      },
      {
        id: 'alpha2',
        name: 'Alpha 2',
        bindings: { ...alpha2Bindings(taggedAccent, ALPHA2_TAG), LBI: magicKey('v', 'h') },
      },
      { id: 'ccedil', name: '\u00c7 extension', bindings: CCEDIL_BINDINGS },
      NUMBERS_LAYER,
      SYMBOLS_LAYER,
    ],
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
  };
})();

// ---------------------------------------------------------------- Romak 34

const ROMAK34_ALPHA1 = rowBindings({
  LTP: 'q',
  LTR: 'b',
  LTM: 'm',
  LTI: 'g',
  LTC: 'k',
  LHP: 'd',
  LHR: 'n',
  LHM: 's',
  LHI: 't',
  LHC: 'w',
  LBP: 'y',
  LBR: 'f',
  LBM: 'c',
  LBI: 'p',
  LBC: 'v',
  RTC: 'x',
  RTI: 'l',
  RTM: 'o',
  RTR: 'u',
  RTP: ';',
  RHC: 'z',
  RHI: 'r',
  RHM: 'a',
  RHR: 'e',
  RHP: 'i',
  RBC: 'j',
  RBI: 'h',
  RBM: ',',
  RBR: '.',
  RBP: '/',
  L1: { kind: 'key_repeat' },
  L0: SPACE_OR_NUMBERS,
  R0: ALPHA2_OR_SYMBOLS,
  R1: { kind: 'sk', mod: 'LSHIFT' },
});

const ROMAK34_ALPHA2: Record<string, Binding> = {
  '*': { kind: 'trans' },
  LTM: { kind: 'macro', symbols: 'qu', then: [{ kind: 'sl', layer: 'altrep2' }] },
  LBM: { kind: 'macro', symbols: 'ç', then: [{ kind: 'sl', layer: 'ccedil' }] },
  RTI: accent('ô'),
  RTM: accent('ó'),
  RTR: accent('ú'),
  RHI: accent('ã'),
  RHM: accent('á'),
  RHR: accent('é'),
  RHP: accent('í'),
  RBI: accent('õ'),
  RBM: accent('â'),
  RBR: accent('ê'),
  L1: kp("'"),
  R1: kp("'"),
};

export const romak34: Layout = {
  format: 'layoutmaster/layout@1',
  id: 'romak-34',
  name: 'Romak 34',
  author: 'Rafael Romão',
  description:
    'Romak for 34 keys (3x5+2): accented vowels on a one-shot second alpha layer, and numbers and symbols held from the thumbs.',
  languages: ['pt-BR', 'en'],
  hostLocale: 'symbols',
  geometry: { preset: '3x5+2' },
  keys: { space: 'L0', shift: { key: 'R1', kind: 'sk' } },
  behaviorDefaults: {
    sl: { quickRelease: true, ignoreModifiers: false, releaseAfterMs: 1000 },
    sk: { quickRelease: true, ignoreModifiers: true, releaseAfterMs: 1500 },
  },
  behaviors,
  layers: [
    { id: 'alpha1', name: 'Alpha 1', bindings: ROMAK34_ALPHA1 },
    { id: 'alpha2', name: 'Alpha 2', bindings: ROMAK34_ALPHA2 },
    { id: 'ccedil', name: 'Ç extension', bindings: CCEDIL_BINDINGS },
    { id: 'altrep2', name: 'Alt repeat 2', bindings: ALTREP2_BINDINGS },
    NUMBERS_LAYER,
    SYMBOLS_LAYER,
  ],
  combos: [
    {
      id: 'question',
      keys: ['RHI', 'RHM'],
      binding: kp('?'),
      layers: ['alpha2'],
      role: 'typing',
      timeoutMs: 30,
      slowRelease: false,
    },
    {
      id: 'exclamation',
      keys: ['RBI', 'RBM'],
      binding: kp('!'),
      layers: ['alpha2'],
      role: 'typing',
      timeoutMs: 30,
      slowRelease: false,
    },
  ],
  repeatPolicy: { doubledLetters: 'repeatKey' },
};
