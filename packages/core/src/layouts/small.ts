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
/**
 * Tapped, the keymap's `sentence_alpha2`: Alpha 2 for the next key, and while a sentence's capital
 * is pending, the shifted Alpha 2 it reaches with `lt_sft_a2`, here Shift with Alpha 2 for the next
 * key, so an accent that starts a sentence is a capital too.
 */
const ALPHA2_OR_SYMBOLS: Binding = {
  kind: 'hold_tap',
  tap: {
    kind: 'sentence_morph',
    default: { kind: 'sl', layer: 'alpha2' },
    pending: {
      kind: 'macro',
      steps: [{ kind: 'sk', mod: 'LSHIFT' }],
      then: [{ kind: 'sl', layer: 'alpha2' }],
    },
  },
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
  L1: { kind: 'trans' },
  L0: { kind: 'trans' },
  R0: { kind: 'hold_tap', tap: kp(' '), hold: { kind: 'mo', layer: 'sym' } },
  R1: kp('0'),
};

const SYMBOLS_THUMBS: Record<string, Binding> = {
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

// ---------------------------------------------------------------- Authors' layers

/*
 * The layouts below whose authors define layers past the letters bring those layers, in place of
 * the default ones, on the keys the board has. Each is copied from the author's keymap: what it
 * types, and the keys and combos that reach it. What the author put on keys the board lacks is left
 * out, as on the base layer, and so are the keys that type nothing the analysis counts (navigation,
 * functions, a modifier held on a layer's key), the holds that reach a layer that types nothing, a
 * toggle to a layer a hold reaches too, and a dead key the analysis composes nothing with. Nothing
 * is added: what the author's layers do not type, the layout does not type.
 */

/**
 * A layer as its author's keymap draws it, on the keys the board has: a line of tokens for each row
 * of the board that has keys, read left to right across both hands, then one for its thumbs, left
 * outer to inner and right inner to outer. `▽` lets the layer below show through and `∅` types
 * nothing; `space` types space, a token of `keys` is that key, and any other token is the one
 * character it types.
 */
function drawn(
  preset: string,
  lines: readonly string[],
  keys: Readonly<Record<string, Binding>> = {},
): Record<string, Binding> {
  const geometry = getGeometryPreset(preset);
  const rows = [...geometry.textRows.filter((r) => r.length > 0), geometry.textThumbs];
  if (lines.length !== rows.length)
    throw new Error(`${preset}: ${rows.length} lines, not ${lines.length}`);
  const out: Record<string, Binding> = { '*': { kind: 'none' } };
  lines.forEach((line, i) => {
    const tokens = line.trim().split(/\s+/);
    if (tokens.length !== rows[i].length)
      throw new Error(`${preset}: line ${i + 1} has ${tokens.length} keys, not ${rows[i].length}`);
    tokens.forEach((t, j) => {
      if (t === '∅') return;
      if (t !== '▽' && t !== 'space' && !(t in keys) && [...t].length !== 1)
        throw new Error(`${preset}: no key ${t}`);
      out[rows[i][j]] =
        t === '▽' ? { kind: 'trans' } : t === 'space' ? kp(' ') : (keys[t] ?? kp(t));
    });
  });
  return out;
}

/** A combo for typing: its keys by id, what it types, and the layers it types on (all if none). */
const chord = (id: string, keys: string, binding: Binding, layers?: string[]): ComboDef => ({
  id,
  keys: keys.split(' '),
  binding,
  ...(layers && { layers }),
  role: 'typing',
});

/** Tapped, one binding; held, another. */
const tapHold = (tap: Binding, hold: Binding): Binding => ({ kind: 'hold_tap', tap, hold });

// ---------------------------------------------------------------- Magic Sturdy

/**
 * Pascal Getreuer's Symbols and Numbers for Magic Sturdy (`getreuer.c`), on the thirty-four keys:
 * Symbols held on `t` and `a`, Numbers on `n`. His board's outer columns and top row are past these
 * keys. `→` is his arrow key; his user name, a macro on Symbols' right outer thumb, is left out.
 */
const STURDY_SYMBOLS = drawn('3x5+2', [
  '` < > - | ^ { } $ →',
  '! * / = & # ( ) ; "',
  "~ + [ ] % @ : , . '",
  '▽ ▽ ▽ ∅',
]);
const STURDY_NUMBERS = drawn('3x5+2', [
  '/ 9 8 7 * ∅ ∅ [ ] ∅',
  '- 3 2 1 + ∅ ∅ e ∅ ∅',
  'x 6 5 4 % ∅ ∅ , . ∅',
  '▽ ▽ 0 ∅',
]);

/**
 * His home row mods, and Ctrl and Gui on the bottom row: the left modifiers on both hands, as on
 * every layout. `d` holds his navigation layer and `.` his window layer, which type nothing.
 */
const STURDY_MODS: Record<string, Mod> = {
  LHP: 'LALT',
  LHM: 'LSHIFT',
  LBP: 'LGUI',
  LBI: 'LCTRL',
  RHM: 'LSHIFT',
  RHP: 'LALT',
  RBI: 'LCTRL',
  RBP: 'LGUI',
};

/** His combos that type: `j k` a backslash, `, .` a semicolon, on the base layer. */
const STURDY_COMBOS: ComboDef[] = [
  chord('backslash', 'LBR LBM', kp('\\'), ['base']),
  chord('semicolon', 'RBM RBR', kp(';'), ['base']),
];

// ---------------------------------------------------------------- Enthium

/**
 * The Symbol and Number layers of Suraj Kurapati's Glorious Engrammer keymap, where Enthium's README
 * sends a columnar board (`keymap.json` of github.com/sunaku/glove80-keymaps), on the forty-two
 * keys. His Glove80's thumb keys nearest the thumb are the inner ones here: `r` holds Symbol, Tab
 * Number. Its number row and the row under the letters, where Symbol has `(` `)` and `&`, are past
 * these keys, and so are its World and Emoji layers.
 */
const ENTHIUM_SYMBOLS = drawn(
  '3x6+3',
  [
    '! [ { } ] ? . ∅ ∅ ∅ ∅ ∅',
    '# ^ = _ $ * , ∅ ∅ space ∅ ```',
    '~ < | - > / ; " \' ` \\ ▽',
    '@ : % ∅ ∅ ∅',
  ],
  { '```': macro('```') },
);
const ENTHIUM_NUMBERS = drawn('3x6+3', [
  '∅ ∅ space ∅ ∅ 0 G 7 8 9 : %',
  '∅ ∅ ∅ ∅ ∅ x k 4 5 6 - +',
  'e ∅ ∅ ∅ ∅ f j 1 2 3 / *',
  '∅ ∅ ∅ 0 . >',
]);

// ---------------------------------------------------------------- Hands Down

/**
 * The layers Alan Reiser's keymap gives every Hands Down variation (`moutis_layers.h`): Symbols,
 * held on the space thumb; Numbers, beside the function keys, held on the Backspace thumb and on a
 * letter key (`,`, or `f` on Promethium); and a numpad, beside the navigation keys, held on the left
 * inner column's home key. On Symbols, `_` is on the space thumb that holds it, and `¡` and `¿` on
 * the thumbs of that hand, out of reach.
 */
const HD_SYMBOLS = drawn('3x5+2', [
  'z q ¶ † ‡ ¢ $ € £ ¥',
  '§ { ( [ • / = * + -',
  '° } ) ] · ^ | & < >',
  '∅ ∅ ∅ ∅',
]);
const HD_NUMBERS = drawn('3x5+2', [
  '∅ ∅ ∅ ∅ ∅ / 7 8 9 -',
  '∅ ∅ ∅ ∅ ∅ * 1 2 3 +',
  '∅ ∅ ∅ ∅ ∅ , 4 5 6 =',
  '; ∅ 0 .',
]);
const HD_NUMPAD = drawn('3x5+2', [
  '∅ ∅ ∅ ∅ ∅ / 7 8 9 -',
  '∅ ∅ ∅ ∅ ∅ * 4 5 6 +',
  '∅ ∅ space ∅ ∅ , 1 2 3 =',
  '∅ ∅ 0 .',
]);
const HD_LAYERS: NonNullable<ClassicDef['layers']> = [
  { id: 'sym', name: 'Symbols', byKey: HD_SYMBOLS },
  { id: 'num', name: 'Numbers', byKey: HD_NUMBERS },
  { id: 'numpad', name: 'Numpad', byKey: HD_NUMPAD },
];

/** Ctrl, Alt, Gui and Shift from each pinky in, the left modifiers on both hands. */
const HD_MODS: Record<string, Mod> = {
  LHP: 'LCTRL',
  LHR: 'LALT',
  LHM: 'LGUI',
  LHI: 'LSHIFT',
  RHI: 'LSHIFT',
  RHM: 'LGUI',
  RHR: 'LALT',
  RHP: 'LCTRL',
};

/**
 * His combos that type symbols and accents, where every variation has them (`moutis_combo_def.c`):
 * on the base layer the marks that have no key, some held for a second one, and the dead keys, held
 * for the letter each most often makes; on the numpad, pairs of digits held for a symbol. Tapped,
 * those type their two digits, as pressing them one after the other does. The macron, ring and
 * cedilla dead keys type nothing when tapped, as the analysis composes no letter with them, and
 * their letter when held. The combos that type letters, words and commands are left out.
 */
const HD_COMBOS: ComboDef[] = [
  chord('ndash', 'RBC RBI', tapHold(kp('–'), kp('—')), ['base']),
  chord('tilde', 'RBC RBM', kp('~'), ['base']),
  chord('underscore', 'RBI RBR', kp('_'), ['base']),
  chord('equal', 'RBM RBR', tapHold(kp('='), kp('%')), ['base']),
  chord('semicolon', 'RHC RHI', kp(';'), ['base']),
  chord('colon', 'RTI RTR', tapHold(kp(':'), kp('…')), ['base']),
  chord('exclamation', 'RTI RTM', kp('!'), ['base']),
  chord('question', 'RTM RTR', kp('?'), ['base']),
  chord('dollar', 'RTM RTP', kp('$'), ['base']),
  chord('backtick', 'RTR RTP', kp('`'), ['base']),
  chord('section', 'RTC RTM', kp('§'), ['base']),
  chord('at', 'RTC RTI', tapHold(kp('@'), kp('№')), ['base']),
  chord('diaeresis', 'RBI RBM', tapHold(dead('¨'), kp('ü')), ['base']),
  chord('dead-tilde', 'LTP LTC', tapHold(dead('~'), kp('ñ')), ['base']),
  chord('acute', 'RHI RHM', tapHold(dead('´'), kp('é')), ['base']),
  chord('grave', 'RHM RHR', tapHold(dead('`'), kp('è')), ['base']),
  chord('circumflex', 'RHI RHR', tapHold(dead('^'), kp('ê')), ['base']),
  // The cedilla, ring and macron dead keys compose nothing here; held, they type their letter.
  chord('cedilla', 'LHP LHM', tapHold({ kind: 'none' }, kp('ç')), ['base']),
  chord('ring', 'RHI RHP', tapHold({ kind: 'none' }, kp('å')), ['base']),
  chord('macron', 'RHM RHP', tapHold({ kind: 'none' }, kp('ō')), ['base']),
  chord('oe', 'RHM RBM', tapHold(macro('œu'), kp('œ')), ['base']),
  chord('ae', 'RHI RBI', kp('æ'), ['base']),
  ...(
    [
      ['RHI RHM', '('],
      ['RHM RHR', ')'],
      ['RHI RHR', ':'],
      ['RHR RHP', '%'],
      ['RHM RHP', '°'],
      ['RHI RHP', '±'],
      ['RTC RTI', '¥'],
      ['RTI RTM', '$'],
      ['RTI RTR', '¢'],
      ['RTM RTR', '€'],
      ['RTR RTP', '£'],
      ['RTI RTP', '÷'],
      ['RBI RBM', '–'],
      ['RBI RBR', '~'],
      ['RBM RBR', '…'],
      ['RBI RBP', '≠'],
    ] as const
  ).map(([keys, symbol]) =>
    chord(`numpad-${symbol}`, keys, tapHold({ kind: 'none' }, kp(symbol)), ['numpad']),
  ),
];

// ---------------------------------------------------------------- T-34

/**
 * Jonas Hietala's num word: a layer that stays on while the next keys type digits and the marks
 * around them, as `auto_layer` does (it also goes on through letters, which his does not).
 */
const NUM_WORD: Binding = {
  kind: 'auto_layer',
  layer: 'num',
  continueList: [...'0123456789', '%', ',', '.', '/', '-', '*', '+', ':', '=', '_'],
};

/**
 * His layers (`keymap.c`): Numbers, on while a num word lasts; Symbols, held from two combos; the
 * one-shot Specials, with his dead keys, quotes and arrows; and Swedish, toggled. `~` `^` `` ` `` on
 * Symbols type themselves, and Numbers' `G` is the capital.
 */
const T34_NUMBERS = drawn(
  '3x5+2',
  ['j + * ! p x ▽ @u ⟲ ▽', '6 4 0 2 k ▽ 3 1 5 7', ', ▽ G 8 ▽ / 9 ( ) _', '▽ space cancel ▽'],
  { '@u': macro('@u'), '⟲': REPEAT, cancel: NUM_WORD },
);
const T34_SYMBOLS = drawn(
  '3x5+2',
  ['~ + * ! ∅ ∅ # @ ^ .', '| { } - \\ ` ? [ ] ⟲', ', < > % ∅ / & ( ) _', '▽ ▽ ∅ ▽'],
  { '⟲': REPEAT },
);
const T34_SPECIALS = drawn(
  '3x5+2',
  ['d~ ‘ ▽ ’ ▽ ▽ ▽ ▽ d^ d¨', '▽ “ ▽ ” d´ d` ← ↓ ↑ →', '▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽', '∅ ▽ ▽ ∅'],
  {
    'd~': dead('~'),
    'd^': dead('^'),
    'd¨': dead('¨'),
    'd´': dead('´'),
    'd`': dead('`'),
  },
);
const T34_SWEDISH = drawn('3x5+2', [
  '▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽',
  '▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽',
  '▽ ▽ ▽ ▽ ▽ ▽ ▽ å ä ö',
  '▽ ▽ ▽ ▽',
]);

/**
 * His combos that type (`combos.def`), which fire on every layer: marks and strings on the letters,
 * the digits and symbols with a thumb, the Swedish letters, the num word, the two that hold Symbols
 * and the one that toggles Swedish.
 */
const T34_COMBOS: ComboDef[] = [
  chord('equal', 'RTI RTM', kp('=')),
  chord('double-quote', 'LHR LHI', kp('"')),
  chord('quote', 'RHI RHR', kp("'")),
  chord('semicolon', 'LHM LBI', kp(';')),
  chord('dollar', 'RBM RBR', kp('$')),
  chord('interpolation', 'RTC RTI', macro('#{}')),
  chord('left-arrow', 'LTM LHM', macro('<-')),
  chord('less-equal', 'LTI LHI', macro('<=')),
  chord('fat-arrow', 'RTI RHI', macro('=>')),
  chord('right-arrow', 'RTM RHM', macro('->')),
  chord('pipe-to', 'RTR RHR', macro('|>')),
  chord('greater-equal', 'LHI LBI', macro('>=')),
  chord('https', 'L0 RBC', macro('https://')),
  chord('colon', 'RHI RHM', tapHold(kp(':'), { kind: 'mo', layer: 'sym' })),
  chord('escape', 'LHM LHI', tapHold(raw('Esc'), { kind: 'mo', layer: 'sym' })),
  chord('num-word', 'L0 R0', NUM_WORD),
  chord('swedish', 'RBI RBM RBR', { kind: 'tog', layer: 'swe' }),
  chord('e-acute', 'R0 LHC', kp('é')),
  ...(
    [
      ['R0 LHP', '6'],
      ['R0 LHR', '4'],
      ['R0 LHM', '0'],
      ['R0 LHI', '2'],
      ['R0 LBI', '8'],
      ['L0 RBI', '9'],
      ['L0 RHI', '3'],
      ['L0 RHM', '1'],
      ['L0 RHR', '5'],
      ['L0 RHP', '7'],
      ['L0 LTP', '~'],
      ['L0 LTR', '+'],
      ['L0 LTM', '*'],
      ['L0 LTI', '!'],
      ['R0 RTI', '#'],
      ['R0 RTM', '@'],
      ['R0 RTR', '^'],
      ['L0 LHP', '|'],
      ['L0 LHR', '{'],
      ['L0 LHM', '}'],
      ['L0 LHI', '-'],
      ['L0 LHC', '\\'],
      ['R0 RHC', '`'],
      ['R0 RHI', '?'],
      ['R0 RHM', '['],
      ['R0 RHR', ']'],
      ['L0 LBR', '<'],
      ['L0 LBM', '>'],
      ['L0 LBI', '%'],
      ['R0 RBI', '&'],
      ['R0 RBM', '('],
      ['R0 RBR', ')'],
      ['R0 RBP', '_'],
      ['L0 RBM', 'å'],
      ['L0 RBR', 'ä'],
      ['L0 RBP', 'ö'],
    ] as const
  ).map(([keys, symbol]) => chord(`thumb-${symbol}`, keys, kp(symbol))),
];

// ---------------------------------------------------------------- Finch

/**
 * The symbols and numbers layer of grassfedreeve's ʻākohekohe keymap, held on the `e` thumb, and its
 * combos for the brackets, which type on it and on the base layer: `<` and `>` held for arrows.
 * The keymap's inner columns are a key higher than this board's.
 */
const FINCH_SYMBOLS = drawn('13332+1', [
  '! @ # 1 2 3',
  '; * _ - $ = 4 5 6 :',
  '+ % & | 0 7 8 9',
  '∅ ▽',
]);
const FINCH_COMBOS: ComboDef[] = [
  chord('left-brace', 'LTR LHR', kp('{'), ['base', 'sym']),
  chord('left-bracket', 'LTM LHM', kp('['), ['base', 'sym']),
  chord('left-paren', 'LTI LHI', kp('('), ['base', 'sym']),
  chord('less', 'LHC LBC', tapHold(kp('<'), kp('←')), ['base', 'sym']),
  chord('right-brace', 'RTR RHR', kp('}'), ['base', 'sym']),
  chord('right-bracket', 'RTM RHM', kp(']'), ['base', 'sym']),
  chord('right-paren', 'RTI RHI', kp(')'), ['base', 'sym']),
  chord('greater', 'RHC RBC', tapHold(kp('>'), kp('→')), ['base', 'sym']),
  chord('slash', 'RBR RBM', kp('/'), ['base', 'sym']),
  chord('backslash', 'RBM RBI', kp('\\'), ['base', 'sym']),
  chord('backtick', 'RTM RTI', kp('`'), ['base', 'sym']),
];

// ---------------------------------------------------------------- Cem Aksoylar's Colemak-DH

/**
 * The symbol layer of his keymap (`includes/3x5.dtsi`), held on the right inner thumb, digits
 * among its symbols, and his combos for the marks it leaves out, which type on it and on the base
 * layer. The keymap's inner columns are a key higher than this board's.
 */
const CAKSOYLAR_SYMBOLS = drawn(
  '23332+2',
  ['! @ # $ 7 8 9 ∅', '+ = _ - % , 4 5 6 .', '¿ * & ^ 0 1 2 3', 'bspc ▽ ∅ ∅'],
  { bspc: raw('⌫') },
);
const CAKSOYLAR_COMBOS: ComboDef[] = [
  chord('quote', 'RTI RTM', kp("'"), ['base', 'sym']),
  chord('backtick', 'RTM RTR', kp('`'), ['base', 'sym']),
  chord('backslash', 'RBI RBM', kp('\\'), ['base', 'sym']),
  chord('slash', 'RBM RBR', kp('/'), ['base', 'sym']),
  chord('semicolon', 'RBI RBM RBR', kp(';'), ['base', 'sym']),
  chord('left-paren', 'LHR LHI', kp('('), ['base', 'sym']),
  chord('right-paren', 'RHI RHR', kp(')'), ['base', 'sym']),
  chord('left-bracket', 'LHR LHM', kp('['), ['base', 'sym']),
  chord('right-bracket', 'RHM RHR', kp(']'), ['base', 'sym']),
  chord('exclamation', 'LTM LTI', kp('!'), ['sym']),
];

// ---------------------------------------------------------------- Ben Vallack Piano

/**
 * His symbol and number layers (`piano.keymap`), held on the home row: the two symbol layers on the
 * ring and middle fingers, numbers on the pinkies. Its keys type what they do on a US Mac, `£` and
 * the curly quotes among them; `!` is held for `?`. Alpha 2's capitals have a one-shot layer of
 * their own, a comma where Alpha 2 has its full stop.
 */
const PIANO_SYMBOLS = drawn('1222+2', ['£ # $ < > ^', '` ~ - \\ [ ] | /', '▽ ▽ ▽ ▽']);
const PIANO_SYMBOLS_2 = drawn('1222+2', ['@ ’ ” ( ) ;', '* % ! " { } & :', '▽ ▽ ▽ ∅'], {
  '’': tapHold(kp('’'), kp('‘')),
  '”': tapHold(kp('”'), kp('“')),
  '!': tapHold(kp('!'), kp('?')),
});
const PIANO_NUMBERS = drawn('1222+2', ['. 0 1 2 3 4', '- + 5 6 7 8 9 =', '∅ ▽ ▽ ▽']);
const PIANO_ALPHA2_SHIFTED = drawn('1222+2', ['V W M F ▽ Z', 'Q J P K B , X Y', '▽ ▽ ▽ ∅']);

/** Ctrl, Alt and Gui on the top row from each ring finger in, the left modifiers on both hands. */
const PIANO_MODS: Record<string, Mod> = {
  LTR: 'LCTRL',
  LTM: 'LALT',
  LTI: 'LGUI',
  RTI: 'LGUI',
  RTM: 'LALT',
  RTR: 'LCTRL',
};

export const SMALL_DEFS: ClassicDef[] = [
  /**
   * Magic Romak: Romak on 24 keys, two alpha layers and the adaptive behaviours.
   *
   * The firmware needs extra layers for these — pre-shifted copies of the alphas for caps word and
   * shifted Alpha 2, and a one-shot layer armed by every accent macro so the repeat key can offer
   * follow-ups — and had one for sentence case, before it was the module zmk-sentence-case. None of
   * them is a layer a typist reaches. Sentence case and caps word are declared as features, which
   * wrap the space and shift keys: sentence case arms a one-shot shift, caps word is the
   * `caps_word` behaviour, and shift is simply shift state. The `h`/`v` keys and the alt repeat are
   * adaptive keys on their own keys, and the alt-repeat follow-ups match on the tag the accent
   * macro leaves behind. What is left is the layers you can see. It brings its keymap's own Numbers
   * and Symbols, which the default layers leave as they are, and its keymap's home block mods
   * (`MAGIC_ROMAK_MODS`) in place of the default ones.
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
    combos: [{ keys: 'g p', types: 'q' }, { keys: 's d', types: 'z' }, ...HD_COMBOS],
    layers: HD_LAYERS,
    holds: { L1: 'num', R0: 'sym', LHC: 'numpad', RHC: 'num' },
    homeRowMods: HD_MODS,
    description:
      "Hands Down Gold: t on a thumb, q and z on chords, and its author's Symbols, Numbers and numpad.",
    link: HANDS_DOWN,
    note: 'Letters from layouts/hd/au-config.h, layers from moutis_layers.h and combos from moutis_combo_def.c.',
  },
  {
    id: 'hands-down-promethium',
    name: 'Hands Down Promethium',
    author: 'Alan Reiser',
    rows: 'v w g m j # . / " \'\ns n t h k , a e i c\nf p d l x - u o y b',
    thumbs: 'bspc r space ret',
    special: COMMON,
    combos: [{ keys: 'w m', types: 'q' }, { keys: 'n h', types: 'z' }, ...HD_COMBOS],
    layers: HD_LAYERS,
    holds: { L1: 'num', R0: 'sym', LHC: 'numpad', LBP: 'num' },
    homeRowMods: HD_MODS,
    description:
      "Hands Down Promethium: r on a thumb, q and z on chords, and its author's Symbols, Numbers and numpad.",
    link: HANDS_DOWN,
    note: 'Letters from layouts/hd/pm-config.h, layers from moutis_layers.h and combos from moutis_combo_def.c.',
  },
  {
    id: 'hands-down-vibranium',
    name: 'Hands Down Vibranium',
    author: 'Alan Reiser',
    rows: 'x w m g j # . / " \'\ns c n t k , a e i h\nb p l d v - u o y f',
    thumbs: 'bspc r space ret',
    special: COMMON,
    combos: [{ keys: 'w g', types: 'q' }, { keys: 'c t', types: 'z' }, ...HD_COMBOS],
    layers: HD_LAYERS,
    holds: { L1: 'num', R0: 'sym', LHC: 'numpad', RHC: 'num' },
    homeRowMods: HD_MODS,
    description:
      "Hands Down Vibranium: r on a thumb, q and z on chords, and its author's Symbols, Numbers and numpad.",
    link: HANDS_DOWN,
    note: 'Letters from layouts/hd/vb-config.h, layers from moutis_layers.h and combos from moutis_combo_def.c.',
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
    special: {
      ...COMMON,
      '⟲': REPEAT,
      shrt: raw('Shrt'),
      spec: { kind: 'sl', layer: 'spec' },
    },
    combos: [
      { keys: 'j c', types: 'q' },
      { keys: 'c y', types: 'qu' },
      { keys: 'y f', types: 'z' },
      ...T34_COMBOS,
    ],
    layers: [
      { id: 'swe', name: 'Swedish', byKey: T34_SWEDISH },
      { id: 'num', name: 'Numbers', byKey: T34_NUMBERS },
      { id: 'sym', name: 'Symbols', byKey: T34_SYMBOLS },
      { id: 'spec', name: 'Specials', byKey: T34_SPECIALS },
    ],
    description:
      "T-34: e on the right thumb, a repeat key on the home row, q, qu and z on chords, and its author's digits and symbols on thumb combos and layers.",
    link: 'https://github.com/treeman/qmk_firmware/tree/master/keyboards/ferris/keymaps/treeman',
    note: 'Letters and layers from keymap.c, combos from combos.def.',
  },
  {
    id: 'magic-sturdy',
    name: 'Magic Sturdy',
    author: 'Ikcelaks, as Pascal Getreuer types it',
    rows: "v m l c p b ★ u o q\ns t r d y f n e a i\nx k j g w z h , . '",
    thumbs: 'unds space ⟲ esc',
    special: { ...COMMON, '★': STURDY_ADAPTIVE, '⟲': REPEAT, unds: kp('_') },
    layers: [
      { id: 'sym', name: 'Symbols', byKey: STURDY_SYMBOLS },
      { id: 'num', name: 'Numbers', byKey: STURDY_NUMBERS },
    ],
    holds: { LHR: 'sym', RHR: 'sym', RHI: 'num' },
    combos: STURDY_COMBOS,
    homeRowMods: STURDY_MODS,
    description:
      "Magic Sturdy: an adaptive key in the letter block and a repeat key on a thumb, and its keymap's Symbols and Numbers. Its rules are the ones that type letters.",
    link: 'https://github.com/getreuer/qmk-keymap',
    note: 'Letters and layers from getreuer.c.',
  },
  {
    id: 'enthium',
    name: 'Enthium',
    author: 'Suraj N. Kurapati (sunaku)',
    geometry: '3x6+3',
    rows: "∅ q y o u = x l d p z ∅\nb c i a e - k h t n s w\n∅ ' , . ; / j m g f v ∅",
    thumbs: '∅ tab space r bspc ∅',
    special: { ...COMMON, tab: raw('⇥') },
    layers: [
      { id: 'num', name: 'Numbers', byKey: ENTHIUM_NUMBERS },
      { id: 'sym', name: 'Symbols', byKey: ENTHIUM_SYMBOLS },
    ],
    holds: { L1: 'num', R0: 'sym' },
    description:
      "Enthium v14: r on the right thumb, b and w on the outer pinky keys, so a forty-two-key board, and its author's Symbols and Numbers.",
    link: 'https://github.com/sunaku/enthium',
    note: "Letters from layout.json, layers from the author's keymap the README points to, https://github.com/sunaku/glove80-keymaps.",
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
      ...FINCH_COMBOS,
    ],
    layers: [{ id: 'sym', name: 'Symbols and numbers', byKey: FINCH_SYMBOLS }],
    holds: { R0: 'sym' },
    description:
      "Finch on its native twenty-six-key board: e on a thumb; v, z, j and qu on chords; its keymap's symbols and numbers layer. Its adaptive swaps are not modelled.",
    link: 'https://github.com/grassfedreeve/finch',
    note: 'Combos and layers from https://github.com/grassfedreeve/zmk-config-akohekohe.',
  },
  {
    id: 'caksoylar',
    name: "Cem Aksoylar's Colemak-DH",
    author: 'Cem Aksoylar (caksoylar)',
    geometry: '23332+2',
    rows: "q w f p l u y '\na r s t b k n e i o\nx c d g m h , .",
    thumbs: 'esc space sym ret',
    special: { ...COMMON, sym: { kind: 'mo', layer: 'sym' } },
    combos: [
      { keys: 'w f', types: 'q' },
      { keys: 'f p', types: 'j' },
      { keys: 'c d', types: 'v' },
      { keys: 'x c', types: 'z' },
      ...CAKSOYLAR_COMBOS,
    ],
    layers: [{ id: 'sym', name: 'Symbols', byKey: CAKSOYLAR_SYMBOLS }],
    description:
      "The Colemak-DH variant one of ZMK's maintainers types on his thirty-key Rommana: j, v and z on chords, and his keymap's Symbols.",
    link: 'https://github.com/caksoylar/zmk-config',
    note: 'Letters from keymap-drawer/rommana.yaml, layers from config/includes/3x5.dtsi and combos from config/includes/combos.dtsi.',
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
      { id: 'sym', name: 'Symbols 1', byKey: PIANO_SYMBOLS },
      { id: 'symbols2', name: 'Symbols 2', byKey: PIANO_SYMBOLS_2 },
      { id: 'num', name: 'Numbers', byKey: PIANO_NUMBERS },
      { id: 'alpha2cap', name: 'Alpha 2 shifted', byKey: PIANO_ALPHA2_SHIFTED },
    ],
    special: {
      '⇧': { kind: 'sk', mod: 'LSHIFT' },
      alpha2: { kind: 'sl', layer: 'alpha2' },
      caps2: { kind: 'sl', layer: 'alpha2cap' },
    },
    holds: { LHP: 'num', LHR: 'symbols2', LHM: 'sym', RHM: 'sym', RHR: 'symbols2', RHP: 'num' },
    homeRowMods: PIANO_MODS,
    description:
      "Eighteen keys: fourteen letters on the base layer, the rest one tap away on a second letter layer, a one-shot Shift where its keymap has a repeat key, and its keymap's symbol and number layers held on the home row.",
    link: 'https://github.com/benvallack/zmk-config-piano',
    note: 'Letters and layers from piano.keymap.',
  },
];
