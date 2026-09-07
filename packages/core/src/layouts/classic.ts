import { importTextLayout } from '../layout/text.js';
import type { Layout } from '../layout/types.js';

interface ClassicDef {
  id: string;
  name: string;
  author?: string;
  rows: string;
  /** Thumb tokens (left outer→inner, right inner→outer); `space` marks the space key. */
  thumbs?: string;
  description?: string;
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
  },
];

export function classicLayout(def: ClassicDef): Layout {
  const text = def.thumbs ? `${def.rows}\n${def.thumbs}` : `${def.rows}\nspace`;
  const { layout } = importTextLayout(text, '3x5+2', def.name);
  layout.id = def.id;
  layout.author = def.author;
  layout.description =
    def.description ?? `${def.name} on a 34-key split columnar board (space on the left thumb).`;
  layout.languages = ['en'];
  return layout;
}

export const CLASSIC_LAYOUTS: Layout[] = CLASSIC_DEFS.map(classicLayout);
