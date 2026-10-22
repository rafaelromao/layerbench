import { getGeometryPreset } from '../geometry/presets.js';
import { importTextLayout } from '../layout/text.js';
import type { Binding, ComboDef, Layout, Mod } from '../layout/types.js';

/** A key as a definition writes it: a token, or the binding itself. */
export type KeyDef = string | Binding;

export interface ClassicDef {
  id: string;
  name: string;
  author?: string;
  /** The letter block, three lines of tokens read left to right across both hands. */
  rows?: string;
  /** Thumb tokens (left outer→inner, right inner→outer); `space` marks the space key. */
  thumbs?: string;
  /**
   * Tokens by key id, for a board whose rows the text cannot describe (one with no bottom row,
   * say). Used instead of `rows` and `thumbs`. A key may hold its binding itself instead of a
   * token.
   */
  byKey?: Record<string, KeyDef>;
  /**
   * Keys that are not one symbol, by the token written for them: a repeat or adaptive key, a layer
   * key, a key that types nothing the analysis counts (`null` leaves the position empty).
   */
  special?: Record<string, Binding | null>;
  /**
   * Symbols on chords: the tokens of the keys pressed together on the base layer, and what the
   * chord types; or a combo written whole, kept as it is.
   */
  combos?: ({ keys: string; types: string } | ComboDef)[];
  /**
   * Further layers: letter layers, reached from the base layer by a `special` key, and the layers
   * its author's keymap defines past the letters, which take the place of the default ones: its
   * Numbers and Symbols by the ids the default layers have (`num`, `sym`), the others by their own.
   */
  layers?: { id: string; name: string; byKey: Record<string, KeyDef> }[];
  /**
   * The base layer's keys its author's keymap holds for a layer, by key: the layer held, the key
   * still typing what it typed when tapped.
   */
  holds?: Record<string, string>;
  /** Board this layout was designed for; the 34-key split columnar board when omitted. */
  geometry?: string;
  /** The base layer's id and name, for a layout with more than one alpha layer; `base`, Base. */
  base?: { id: string; name: string };
  /** The key that types space, when `byKey` gives it a binding rather than the `space` token. */
  space?: string;
  /**
   * Home row mods of its own, as its author's keymap holds them: by key, a modifier or any other
   * hold, in place of the ones every other layout gets (`HOME_ROW_MODS`); or `false` for none.
   */
  homeRowMods?: false | Readonly<Record<string, Mod | Binding>>;
  /** The shift key, when the layout has one of its own. */
  shift?: Layout['keys']['shift'];
  /** Typing behaviours declared rather than built of layers: sentence case, caps word. */
  features?: Layout['features'];
  /** How long one-shot layers and keys wait, and what releases them. */
  behaviorDefaults?: Layout['behaviorDefaults'];
  /** Whether a doubled letter is typed with the repeat key. */
  repeatPolicy?: Layout['repeatPolicy'];
  /** The ways into layers the analysis is told rather than left to find. */
  activators?: Layout['activators'];
  description?: string;
  /** Where the letter arrangement came from, one http(s) URL: the layout's link. */
  link?: string;
  /**
   * What the link alone does not say, such as the file there or a second source: a sentence, added
   * to the description.
   */
  note?: string;
}

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });

/** The repeat key, `⟲`. */
export const REPEAT: Binding = { kind: 'key_repeat' };

/** A raw key: drawn with its legend, typing nothing the analysis counts. */
export const raw = (label: string): Binding => ({ kind: 'raw', label });

/** Bindings from keys by id: a binding as it is, a token with the special ones swapped in. */
function bindingsOf(
  byKey: Record<string, KeyDef>,
  special: Record<string, Binding | null>,
): Record<string, Binding> {
  const out: Record<string, Binding> = {};
  for (const [id, key] of Object.entries(byKey)) {
    const s =
      typeof key !== 'string'
        ? key
        : key in special
          ? special[key]
          : key === 'space'
            ? kp(' ')
            : kp(key);
    if (s) out[id] = s;
  }
  return out;
}

/** The key that types `token` on the base layer; a combo names its keys this way. */
function keyFor(bindings: Record<string, Binding>, token: string, layout: string): string {
  const ids = Object.entries(bindings)
    .filter(([, b]) => b.kind === 'kp' && b.symbol === token)
    .map(([id]) => id);
  if (ids.length !== 1) throw new Error(`${layout}: no single key types ${token}`);
  return ids[0];
}

/** Classic single-layer layouts (30-key core), from the Layouts Doc / cyanophage listings. */
export const CLASSIC_DEFS: ClassicDef[] = [
  {
    id: 'romak',
    name: 'Romak',
    author: 'Rafael Romão',
    base: { id: 'alpha1', name: 'Alpha 1' },
    // Alpha 1 of the author's keymap (github.com/rafaelromao/keyboards) on thirty-four keys: Magic
    // Romak's, filled out to the outer and inner columns.
    rows: 'q b m g k x l o u ;\nd n s t w z r a e i\ny f c p v j h , . /',
    description:
      'Romak on 34 keys (3x5+2): one alpha layer, with the default layers and the standard thumbs.',
    link: 'https://rafaelromao.github.io/romak',
  },
  {
    id: 'qwerty',
    name: 'Qwerty',
    rows: 'q w e r t y u i o p\na s d f g h j k l ;\nz x c v b n m , . /',
  },
  {
    id: 'dvorak',
    name: 'Dvorak',
    author: 'August Dvorak',
    rows: "' , . p y f g c r l\na o e u i d h t n s\n; q j k x b m w v z",
  },
  {
    id: 'colemak',
    name: 'Colemak',
    author: 'Shai Coleman',
    rows: 'q w f p g j l u y ;\na r s t d h n e i o\nz x c v b k m , . /',
  },
  {
    id: 'colemak-dh',
    name: 'Colemak-DH',
    author: 'Shai Coleman / Steve P',
    rows: 'q w f p b j l u y ;\na r s t g m n e i o\nz x c d v k h , . /',
  },
  {
    id: 'graphite',
    name: 'Graphite',
    author: 'StronglyTyped',
    rows: "b l d w z ' f o u j\nn r t s g y h a e i\nq x m c v k p . - /",
  },
  {
    id: 'gallium',
    name: 'Gallium',
    author: 'Bryson',
    rows: "b l d c v z y o u ,\nn r t s g p h a e i\nq x m w j k f ' ; .",
  },
  {
    id: 'canary',
    name: 'Canary',
    author: 'Eve',
    rows: 'w l y p b z f o u ;\nc r s t g m n e i a\nq j v d k x h / , .',
  },
  {
    id: 'sturdy',
    name: 'Sturdy',
    author: 'Oxey',
    rows: "v m l c p x f o u j\ns t r d y . n a e i\nz k q g w b h ' ; ,",
  },
  {
    id: 'aptv3',
    name: 'APTv3',
    author: 'Apsu',
    rows: "w g d f b q l u o y\nr s t h k j n e a i\nx c m p v z , . ' /",
  },
  {
    id: 'hands-down-neu',
    name: 'Hands Down Neu',
    author: 'Alan Reiser',
    rows: "w f m p v ⟲ . q ; '\nr s n t b , a e i h\nx c l d g - u o y k",
    // `z` and `j` live in an eleventh column on the board this was drawn for. A 34-key split has
    // no such column, so they go on the free thumbs — until now they were silently dropped, which
    // left the layout unable to type two letters and every metric flattered by their absence.
    // With `z` on the thumb Repeat would have, Repeat takes the key `/` leaves.
    thumbs: 'space z j',
    special: { '⟲': REPEAT },
    link: 'https://sites.google.com/alanreiser.com/handsdown',
  },
  {
    id: 'night',
    name: 'Night',
    author: 'Luminespire',
    rows: "b f l k q p g o u .\nn s h t m y c a e i\nx v j d z ' w - / ,",
    // Twenty-five letters on the alphas and `r` on a thumb, which is what the layout is about.
    thumbs: 'space r',
    description: 'Night: r on a thumb, leaving the home row to the other twenty-five letters.',
    link: 'https://luminespire.github.io/night/home.html',
  },
  {
    id: 'dusk',
    name: 'Dusk',
    author: 'Luminespire',
    rows: "x f d p q j ' o u .\nn s t c y m h a e i\nb v k g w z l - / ,",
    thumbs: 'space r',
    description: 'Dusk, a Night alternative with the same thumb r.',
    link: 'https://luminespire.github.io/night/alternatives.html',
  },
  {
    id: 'recurva',
    name: 'Recurva',
    author: 'GalileoBlues',
    rows: "f r d p v q j u o y\ns n t c b . h e a i\nz x k g w m l ; ' ,",
    link: 'https://github.com/GalileoBlues/Recurva',
  },
  {
    id: 'focal',
    name: 'Focal',
    author: 'Keyhabit',
    rows: "v l h g k q f o u j\ns r n t b y c a e i\nz x m d p ' w . ; ,",
    link: 'https://github.com/Keyhabit/Focal-keyboard-layout',
  },
  {
    id: 'nerps',
    name: 'Nerps',
    author: 'Sertain',
    rows: "x l d p v z k o u ;\nn r t s g y h e i a\nj m c w b f ' , . -",
    // `q` sits in an eleventh column on the original board; here it goes on a thumb.
    thumbs: 'space q',
    link: 'https://www.reddit.com/r/KeyboardLayouts/comments/tpwyjc/',
  },
  {
    id: 'engram',
    name: 'Engram',
    author: 'Arno Klein',
    rows: "b y o u ' l d w v z\nc i e a , h t s n q\ng x j k / ; r m f p",
    link: 'https://engram.dev/',
  },
  {
    id: 'sunlight',
    name: 'Sunlight',
    author: 'Cyanophage',
    rows: 'f w h g k , o u y p\ns n l t v . a e i c\nx b m d q ⟲ ; / - z',
    // `r` on a thumb by design; `j` on another because the original board has an extra column.
    // With `j` on the thumb Repeat would have, Repeat takes the key `=` leaves.
    thumbs: 'space r j',
    special: { '⟲': REPEAT },
    link: 'https://cyanophage.github.io/#sunlight',
  },
  {
    id: 'snth',
    name: 'SNTH',
    author: 'Wren',
    rows: "x p d m q = y o u ,\ns n t h v g c a e i\nf b k l j z w ' / .",
    thumbs: 'space r',
    link: 'https://www.reddit.com/r/KeyboardLayouts/comments/18jefux/snth/',
  },
  {
    id: 'aptmak',
    name: 'Aptmak',
    author: 'Apsu',
    rows: "v w f p b j l u y '\nr s t h k x n a i o\n/ c g d q z m , . -",
    // Twenty-five letters plus `e` on a thumb: a sub-30 alpha block.
    thumbs: 'space e',
    description: 'Aptmak: e on a thumb, so the alphas fit in twenty-five keys.',
    link: 'https://github.com/Apsu/aptmak',
  },
  {
    id: 'bird',
    name: 'Bird',
    author: 'jcmkk3',
    // Twenty-six keys: the pinky loses its bottom key and the inner index its top one.
    geometry: '23332+2',
    rows: "x c l f y o u '\nr s n t p k h e i a\nw m g b j d , .",
    // The twenty-six-key block has no room for `q`, `v` or `z`; the keymap reaches them another
    // way, and on a thumb they are at least reachable and visible.
    thumbs: 'space q v z',
    description: 'Bird on its native twenty-six-key board, in the Hands Down family.',
    link: 'https://github.com/jcmkk3/bird-layout',
  },
  {
    id: 'bird-30',
    name: 'Bird 30',
    author: 'jcmkk3',
    rows: "x c l f v z y o u '\nr s n t p k h e i a\nq w m g b j d , . /",
    description: 'Bird filled out to a thirty-key alpha block.',
    link: 'https://github.com/jcmkk3/bird-layout',
  },
];

export function classicLayout(def: ClassicDef): Layout {
  const preset = def.geometry ?? '3x5+2';
  const special = def.special ?? {};
  let layout: Layout;
  if (def.byKey) {
    const ids = new Set(getGeometryPreset(preset).keys.map((k) => k.id));
    for (const id of Object.keys(def.byKey)) {
      if (!ids.has(id)) throw new Error(`${def.name}: ${preset} has no key ${id}`);
    }
    const bindings = bindingsOf(def.byKey, special);
    const space = def.space ?? Object.entries(def.byKey).find(([, k]) => k === 'space')?.[0];
    if (!space) throw new Error(`${def.name}: no key is space`);
    layout = {
      format: 'layerbench/layout@1',
      name: def.name,
      hostLocale: 'symbols',
      geometry: { preset },
      keys: { space },
      layers: [{ id: 'base', name: 'Base', bindings }],
    };
  } else {
    const text = def.thumbs ? `${def.rows}\n${def.thumbs}` : `${def.rows}\nspace`;
    layout = importTextLayout(text, preset, def.name).layout;
    const base = layout.layers[0].bindings;
    for (const [id, b] of Object.entries(base)) {
      if (b.kind !== 'kp' || b.symbol === undefined || !(b.symbol in special)) continue;
      const s = special[b.symbol];
      if (s) base[id] = s;
      else delete base[id];
    }
  }
  if (def.base) Object.assign(layout.layers[0], def.base);
  for (const extra of def.layers ?? []) {
    layout.layers.push({
      id: extra.id,
      name: extra.name,
      bindings: bindingsOf(extra.byKey, special),
    });
  }
  if (def.combos) {
    const [{ id: baseId, bindings: base }] = layout.layers;
    layout.combos = def.combos.map((combo): ComboDef => {
      if (!('types' in combo)) return combo;
      const { keys, types } = combo;
      return {
        id: types,
        keys: keys.split(' ').map((t) => keyFor(base, t, def.name)),
        binding: types.length === 1 ? kp(types) : { kind: 'macro', symbols: types },
        layers: [baseId],
        role: 'typing',
      };
    });
  }
  const keys = new Set(getGeometryPreset(preset).keys.map((k) => k.id));
  const base = layout.layers[0].bindings;
  for (const [id, layer] of Object.entries(def.holds ?? {})) {
    if (!keys.has(id)) throw new Error(`${def.name}: ${preset} has no key ${id}`);
    const tap = base[id];
    base[id] = tap ? { kind: 'hold_tap', tap, hold: { kind: 'mo', layer } } : { kind: 'mo', layer };
  }
  // A one-shot Shift on the base layer is the Shift the analysis types capitals with.
  const shift = Object.entries(layout.layers[0].bindings).find(
    ([, b]) => b.kind === 'sk' && b.mod === 'LSHIFT',
  )?.[0];
  if (shift) layout.keys = { ...layout.keys, shift: { key: shift, kind: 'sk' } };
  layout.id = def.id;
  layout.author = def.author;
  layout.description = [
    def.description ?? `${def.name} on a split columnar board (space on the left thumb).`,
    def.note,
  ]
    .filter(Boolean)
    .join(' ');
  if (def.link) layout.link = def.link;
  if (def.shift) layout.keys = { ...layout.keys, shift: def.shift };
  if (def.features) layout.features = def.features;
  if (def.behaviorDefaults) layout.behaviorDefaults = def.behaviorDefaults;
  if (def.repeatPolicy) layout.repeatPolicy = def.repeatPolicy;
  if (def.activators) layout.activators = def.activators;
  return layout;
}

export const CLASSIC_LAYOUTS: Layout[] = CLASSIC_DEFS.map(classicLayout);
