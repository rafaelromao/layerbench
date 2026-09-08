import { importTextLayout } from '../layout/text.js';
import type { Layout } from '../layout/types.js';

interface ClassicDef {
  id: string;
  name: string;
  author?: string;
  rows: string;
  /** Thumb tokens (left outer→inner, right inner→outer); `space` marks the space key. */
  thumbs?: string;
  /** Board this layout was designed for; the 34-key split columnar board when omitted. */
  geometry?: string;
  description?: string;
  /** Where the letter arrangement came from. Shown on the card and in the document. */
  source?: string;
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
  const text = def.thumbs ? `${def.rows}\n${def.thumbs}` : `${def.rows}\nspace`;
  const preset = def.geometry ?? '3x5+2';
  const { layout } = importTextLayout(text, preset, def.name);
  layout.id = def.id;
  layout.author = def.author;
  const where = def.source ? ` Letters from ${def.source}.` : '';
  layout.description = `${def.description ?? `${def.name} on a split columnar board (space on the left thumb).`}${where}`;
  layout.languages = ['en'];
  return layout;
}

export const CLASSIC_LAYOUTS: Layout[] = CLASSIC_DEFS.map(classicLayout);
