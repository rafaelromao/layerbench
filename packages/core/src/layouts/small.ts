import type { AdaptiveTrigger, Binding } from '../layout/types.js';
import { type ClassicDef, raw } from './classic.js';

/*
 * Layouts made for small boards: a letter on a thumb, letters on chords, magic and repeat keys,
 * boards under thirty keys. Each arrangement is copied from its author's own firmware or page,
 * named in `source`; where a source left something out, the description says what.
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

/** The repeat key, `⟲`. */
const REPEAT: Binding = { kind: 'key_repeat' };

/**
 * Pascal Getreuer's magic key for Magic Sturdy (`getreuer.c`, `get_alt_repeat_key_keycode_user`):
 * the rules that type letters. His Vim rule for `n`, the code snippets, and what the repeat key
 * types after the magic key are left out.
 */
const STURDY_MAGIC: Binding = {
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
 * Nordrassil's arcane key repeats a letter its own hand typed. After the other hand it is a magic
 * key whose outputs the author publishes only in a pastebin; that half is not modelled.
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

export const SMALL_DEFS: ClassicDef[] = [
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
    source: `${HANDS_DOWN} (layouts/hd/au-config.h)`,
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
    source: `${HANDS_DOWN} (layouts/hd/pm-config.h)`,
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
    source: `${HANDS_DOWN} (layouts/hd/vb-config.h)`,
  },
  {
    id: 'rsthd',
    name: 'RSTHD',
    author: 'xsznix',
    rows: 'j c y f k z l , u q\nr s t h d m n a i o\n/ v g p b x w . ; -',
    thumbs: 'e bspc ret space',
    special: COMMON,
    description:
      "RSTHD: e on the left thumb, from its author's ErgoDox firmware; the outer columns' = and ' do not fit thirty-four keys.",
    source:
      'https://github.com/xsznix/qmk_firmware/blob/master/keyboards/ergodox_ez/keymaps/rsthd/keymap.c',
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
    source:
      'https://github.com/treeman/qmk_firmware/tree/master/keyboards/ferris/keymaps/treeman (keymap.c, combos.def)',
  },
  {
    id: 'magic-sturdy',
    name: 'Magic Sturdy',
    author: 'Ikcelaks, as Pascal Getreuer types it',
    rows: "v m l c p b ★ u o q\ns t r d y f n e a i\nx k j g w z h , . '",
    thumbs: 'unds space ⟲ esc',
    special: { ...COMMON, '★': STURDY_MAGIC, '⟲': REPEAT, unds: kp('_') },
    description:
      'Magic Sturdy: a magic key in the letter block and a repeat key on a thumb. The magic rules are the ones that type letters.',
    source: 'https://github.com/getreuer/qmk-keymap (getreuer.c)',
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
    source: 'https://github.com/sunaku/enthium (layout.json)',
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
      "Nordrassil as its README publishes it: t on the right thumb and an arcane key on each, modelled as repeating the letter its own hand typed (the author's magic outputs are not published with it). The README notes a 2025 refinement.",
    source: 'https://github.com/empressabyss/nordrassil',
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
    source:
      'https://github.com/grassfedreeve/finch and https://github.com/grassfedreeve/zmk-config-akohekohe (combos)',
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
    source: 'https://github.com/caksoylar/zmk-config (keymap-drawer/rommana.yaml)',
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
    source:
      'https://lykt.xyz/uno/ and https://github.com/gkbd/qmk_firmware/tree/one/keyboards/idobo/keymaps/gkbd_uno',
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
      L0: '⟲',
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
      '⟲': REPEAT,
      alpha2: { kind: 'sl', layer: 'alpha2' },
      caps2: raw('⇧A2'),
    },
    description:
      'Eighteen keys: fourteen letters on the base layer, the rest one tap away on a second letter layer, and a repeat key.',
    source: 'https://github.com/benvallack/zmk-config-piano (piano.keymap)',
  },
];
