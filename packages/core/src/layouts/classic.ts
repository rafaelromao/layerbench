import { getGeometryPreset } from '../geometry/presets.js';
import { importTextLayout } from '../layout/text.js';
import type { Binding, ComboDef, Layout } from '../layout/types.js';

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
   * say). Used instead of `rows` and `thumbs`.
   */
  byKey?: Record<string, string>;
  /**
   * Keys that are not one symbol, by the token written for them: a repeat or adaptive key, a layer
   * key, a key that types nothing the analysis counts (`null` leaves the position empty).
   */
  special?: Record<string, Binding | null>;
  /** Symbols on chords: the tokens of the keys pressed together, and what the chord types. */
  combos?: { keys: string; types: string }[];
  /** Further letter layers, reached from the base layer by a `special` key. */
  layers?: { id: string; name: string; byKey: Record<string, string> }[];
  /** Board this layout was designed for; the 34-key split columnar board when omitted. */
  geometry?: string;
  languages?: string[];
  description?: string;
  /** Where the letter arrangement came from. Shown on the card and in the document. */
  source?: string;
}

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });

/** A raw key: drawn with its legend, typing nothing the analysis counts. */
export const raw = (label: string): Binding => ({ kind: 'raw', label });

/** Bindings from tokens by key id, with the special ones swapped in. */
function bindingsOf(
  byKey: Record<string, string>,
  special: Record<string, Binding | null>,
): Record<string, Binding> {
  const out: Record<string, Binding> = {};
  for (const [id, token] of Object.entries(byKey)) {
    const s = token in special ? special[token] : token === 'space' ? kp(' ') : kp(token);
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
    rows: "w f m p v / . q ; '\nr s n t b , a e i h\nx c l d g - u o y k",
    // `z` and `j` live in an eleventh column on the board this was drawn for. A 34-key split has
    // no such column, so they go on the free thumbs — until now they were silently dropped, which
    // left the layout unable to type two letters and every metric flattered by their absence.
    thumbs: 'space z j',
    source: 'https://sites.google.com/alanreiser.com/handsdown',
  },
  {
    id: 'night',
    name: 'Night',
    author: 'Luminespire',
    rows: "b f l k q p g o u .\nn s h t m y c a e i\nx v j d z ' w - / ,",
    // Twenty-five letters on the alphas and `r` on a thumb, which is what the layout is about.
    thumbs: 'space r',
    description: 'Night: r on a thumb, leaving the home row to the other twenty-five letters.',
    source: 'https://luminespire.github.io/night/home.html',
  },
  {
    id: 'dusk',
    name: 'Dusk',
    author: 'Luminespire',
    rows: "x f d p q j ' o u .\nn s t c y m h a e i\nb v k g w z l - / ,",
    thumbs: 'space r',
    description: 'Dusk, a Night alternative with the same thumb r.',
    source: 'https://luminespire.github.io/night/alternatives.html',
  },
  {
    id: 'recurva',
    name: 'Recurva',
    author: 'GalileoBlues',
    rows: "f r d p v q j u o y\ns n t c b . h e a i\nz x k g w m l ; ' ,",
    source: 'https://github.com/GalileoBlues/Recurva',
  },
  {
    id: 'focal',
    name: 'Focal',
    author: 'Keyhabit',
    rows: "v l h g k q f o u j\ns r n t b y c a e i\nz x m d p ' w . ; ,",
    source: 'https://github.com/Keyhabit/Focal-keyboard-layout',
  },
  {
    id: 'nerps',
    name: 'Nerps',
    author: 'Sertain',
    rows: "x l d p v z k o u ;\nn r t s g y h e i a\nj m c w b f ' , . -",
    // `q` sits in an eleventh column on the original board; here it goes on a thumb.
    thumbs: 'space q',
    source: 'https://www.reddit.com/r/KeyboardLayouts/comments/tpwyjc/',
  },
  {
    id: 'engram',
    name: 'Engram',
    author: 'Arno Klein',
    rows: "b y o u ' l d w v z\nc i e a , h t s n q\ng x j k / ; r m f p",
    source: 'https://engram.dev/',
  },
  {
    id: 'sunlight',
    name: 'Sunlight',
    author: 'Cyanophage',
    rows: 'f w h g k , o u y p\ns n l t v . a e i c\nx b m d q = ; / - z',
    // `r` on a thumb by design; `j` on another because the original board has an extra column.
    thumbs: 'space r j',
    source: 'https://cyanophage.github.io/#sunlight',
  },
  {
    id: 'snth',
    name: 'SNTH',
    author: 'Wren',
    rows: "x p d m q = y o u ,\ns n t h v g c a e i\nf b k l j z w ' / .",
    thumbs: 'space r',
    source: 'https://www.reddit.com/r/KeyboardLayouts/comments/18jefux/snth/',
  },
  {
    id: 'aptmak',
    name: 'Aptmak',
    author: 'Apsu',
    rows: "v w f p b j l u y '\nr s t h k x n a i o\n/ c g d q z m , . -",
    // Twenty-five letters plus `e` on a thumb: a sub-30 alpha block.
    thumbs: 'space e',
    description: 'Aptmak: e on a thumb, so the alphas fit in twenty-five keys.',
    source: 'https://github.com/Apsu/aptmak',
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
    source: 'https://github.com/jcmkk3/bird-layout',
  },
  {
    id: 'bird-30',
    name: 'Bird 30',
    author: 'jcmkk3',
    rows: "x c l f v z y o u '\nr s n t p k h e i a\nq w m g b j d , . /",
    description: 'Bird filled out to a thirty-key alpha block.',
    source: 'https://github.com/jcmkk3/bird-layout',
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
    const space = Object.entries(def.byKey).find(([, t]) => t === 'space')?.[0];
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
  for (const extra of def.layers ?? []) {
    layout.layers.push({
      id: extra.id,
      name: extra.name,
      bindings: bindingsOf(extra.byKey, special),
    });
  }
  if (def.combos) {
    const base = layout.layers[0].bindings;
    layout.combos = def.combos.map(
      ({ keys, types }): ComboDef => ({
        id: types,
        keys: keys.split(' ').map((t) => keyFor(base, t, def.name)),
        binding: types.length === 1 ? kp(types) : { kind: 'macro', symbols: types },
        layers: ['base'],
        role: 'typing',
      }),
    );
  }
  layout.id = def.id;
  layout.author = def.author;
  const where = def.source ? ` Letters from ${def.source}.` : '';
  layout.description = `${def.description ?? `${def.name} on a split columnar board (space on the left thumb).`}${where}`;
  layout.languages = def.languages ?? ['en'];
  return layout;
}

export const CLASSIC_LAYOUTS: Layout[] = CLASSIC_DEFS.map(classicLayout);
