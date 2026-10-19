import { getGeometryPreset } from '../geometry/presets.js';
import type { Binding, ComboDef, LayerDef, Layout } from '../layout/types.js';
import { withStandardThumbs } from './standard.js';
import { DEFAULT_LAYER_IDS, defaultLayers } from './templates.js';

/** Where Romak and Magic Romak are published. */
const ROMAK_LINK = 'https://rafaelromao.github.io/romak';

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });
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
 * core, and every board's default layers start from them (`templates.ts`). Each key is what it
 * types: the firmware's symbol tap-holds jump to the end of the line or past the cursor first when
 * held, which is editing rather than typing, and are left out. Keys it leaves empty are empty here.
 *
 * Magic Romak has the default layers in their place, on these thumbs.
 */
const NUMBERS_THUMBS: Record<string, Binding> = {
  LHP: tapOrUnmodelled(',', 'FUN'),
  L1: { kind: 'trans' },
  L0: { kind: 'trans' },
  R0: { kind: 'hold_tap', tap: kp(' '), hold: { kind: 'mo', layer: 'sym' } },
  R1: tapOrUnmodelled('0', 'MEDIA'),
};

const SYMBOLS_THUMBS: Record<string, Binding> = {
  RHP: tapOrUnmodelled('_', 'MACROS'),
  L1: { kind: 'trans' },
  // The firmware's hold here reaches a copy of Numbers placed above Symbols, which only its layer
  // order needs. The digits are one hold away from Alpha 1 either way.
  L0: kp(' '),
  R1: { kind: 'trans' },
};

const THUMBS = new Set(['L0', 'L1', 'R0', 'R1']);

/**
 * The default layers on a Romak board: the keymap's thumbs on Numbers and Symbols, and its empty
 * keys there empty, the default grid on every other key. Accents, and Extras where the board needs
 * it, are the defaults as they are.
 */
function romakDefaultLayers(preset: string): Pick<Layout, 'layers' | 'conditionalLayers'> {
  const defaults = defaultLayers(getGeometryPreset(preset));
  const own: Record<string, Record<string, Binding>> = {
    [DEFAULT_LAYER_IDS.numbers]: NUMBERS_THUMBS,
    [DEFAULT_LAYER_IDS.symbols]: SYMBOLS_THUMBS,
  };
  const layers = defaults.layers.map((l): LayerDef => {
    const thumbs = own[l.id];
    if (!thumbs) return l;
    const keys = Object.entries(l.bindings).filter(([id]) => id !== '*' && !THUMBS.has(id));
    return {
      ...l,
      bindings: { '*': { kind: 'none' }, ...Object.fromEntries(keys), ...thumbs },
    };
  });
  return { layers, conditionalLayers: defaults.conditionalLayers };
}

// ---------------------------------------------------------------- Magic Romak

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

function alpha2Combo(id: string, keys: string[], binding: Binding): ComboDef {
  return {
    id,
    keys,
    binding,
    layers: ['alpha2'],
    role: 'typing',
    timeoutMs: 30,
    slowRelease: false,
  };
}

const dead = (diacritic: string): Binding => ({ kind: 'dead_key', diacritic });
const tapOrHeld = (tap: string, held: string): Binding => ({
  kind: 'hold_tap',
  tap: kp(tap),
  hold: kp(held),
});

/**
 * Alpha 2's combos in the keymap (`zmk/features/combos.dtsi`): the accents Alpha 2 has no key for,
 * as dead keys \u2014 the keymap types an apostrophe, a double quote, a grave, a caret and a tilde,
 * which the host composes with the next letter, so each is the accent it stands for \u2014 then `-` and
 * `:`, `?` and `!`, which type `\u00bf` and `\u00a1` when held, and `\u00e0`.
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

/**
 * Magic Romak: Romak on 24 keys, two alpha layers and the adaptive behaviours.
 *
 * The firmware needs four extra layers for these — pre-shifted copies of the alphas for sentence
 * case, caps word and shifted Alpha 2, and a one-shot layer armed by every accent macro so the
 * repeat key can offer follow-ups. None of them is a layer a typist reaches. Sentence case and caps
 * word are declared as features, which wrap the space and shift keys: sentence case arms a one-shot
 * shift, caps word is the `caps_word` behaviour, and shift is simply shift state. The `h`/`v` keys
 * and the alt repeat are adaptive keys on their own keys, and the alt-repeat follow-ups match on
 * the tag the accent macro leaves behind. What is left is the layers you can see.
 */
export const magicRomak: Layout = (() => {
  const defaults = romakDefaultLayers('1333+2');
  return {
    format: 'layerbench/layout@1',
    id: 'magic-romak',
    name: 'Magic Romak',
    author: 'Rafael Romão',
    description:
      'Romak 24 with adaptive keys (h/v), alt repeat, sentence case, caps word, and dead keys for Spanish, French and Italian.',
    link: ROMAK_LINK,
    languages: ['pt-BR', 'en'],
    hostLocale: 'symbols',
    geometry: { preset: '1333+2' },
    keys: { space: 'L0', shift: { key: 'R1', kind: 'sk' } },
    behaviorDefaults: {
      sl: { quickRelease: true, ignoreModifiers: false, releaseAfterMs: 1000 },
      sk: { quickRelease: true, ignoreModifiers: true, releaseAfterMs: 1500 },
    },
    repeatPolicy: { doubledLetters: 'repeatKey' },
    behaviors: {},
    combos: [...alpha1Combos(), SEMICOLON_COMBO, ...alpha2Combos()],
    layers: [
      // Holding space reaches the numbers and holding the Alpha 2 key the symbols; the
      // sentence-case feature wraps the space's tap, so both live on one key. Tapping the
      // Alpha 2 key, then the right outer thumb, reaches Accents.
      {
        id: 'alpha1',
        name: 'Alpha 1',
        bindings: {
          ...ALPHA1_24,
          RBI: adaptiveKey('h', 'v'),
          L1: ALT_REPEAT,
          L0: SPACE_OR_NUMBERS,
          R0: ALPHA2_OR_SYMBOLS,
          R1: { kind: 'sk', mod: 'LSHIFT' },
        },
      },
      {
        id: 'alpha2',
        name: 'Alpha 2',
        bindings: {
          ...alpha2Bindings(),
          LBI: adaptiveKey('v', 'h'),
          // The second apostrophe makes way for the accents the other languages need.
          R1: { kind: 'sl', layer: DEFAULT_LAYER_IDS.accents },
        },
      },
      { id: 'ccedil', name: '\u00c7 extension', bindings: CCEDIL_BINDINGS },
      ...defaults.layers,
    ],
    conditionalLayers: defaults.conditionalLayers,
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
      accents: [{ from: 'alpha2', via: 'key:alpha2/R1' }],
    },
  };
})();

// ---------------------------------------------------------------- Romak

/**
 * Romak's Alpha 1 on 34 keys (3x5+2), as its keymap has it: Magic Romak's filled out to the outer
 * and inner columns. Like every Standard layout's, its base layer keeps no symbol but `'` `,` `.`
 * `;`, so the standard thumbs leave its `/` empty.
 */
const ROMAK_ALPHA1 = rowBindings({
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
});

/**
 * Romak: one alpha layer on 34 keys, with the default layers and the thumbs every bundled Standard
 * layout shares.
 */
export const romak: Layout = withStandardThumbs(
  {
    format: 'layerbench/layout@1',
    id: 'romak',
    name: 'Romak',
    author: 'Rafael Romão',
    description:
      'Romak on 34 keys (3x5+2): one alpha layer, with the default layers and the standard thumbs.',
    link: ROMAK_LINK,
    languages: ['pt-BR', 'en'],
    hostLocale: 'symbols',
    geometry: { preset: '3x5+2' },
    keys: { space: 'L0' },
    layers: [{ id: 'alpha1', name: 'Alpha 1', bindings: ROMAK_ALPHA1 }],
  },
  getGeometryPreset('3x5+2'),
  'layerbench',
);
