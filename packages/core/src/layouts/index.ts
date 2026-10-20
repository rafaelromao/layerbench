import { getGeometryPreset } from '../geometry/presets.js';
import { layoutCategory } from '../layout/categories.js';
import type { Layout } from '../layout/types.js';
import { CLASSIC_LAYOUTS, classicLayout } from './classic.js';
import { DOCUMENT_LAYOUTS } from './documents.js';
import { magicRomak, romak } from './romak.js';
import { SMALL_DEFS } from './small.js';
import { type ThumbPlacement, withStandardThumbs } from './standard.js';
import { withDefaultLayers } from './templates.js';

export { CLASSIC_DEFS, CLASSIC_LAYOUTS, classicLayout } from './classic.js';
export { DOCUMENT_LAYOUTS, documentLayout, documentMissing } from './documents.js';
export { magicRomak, romak } from './romak.js';
export { SMALL_DEFS } from './small.js';
export {
  BASE_SYMBOLS,
  MAIN_THUMBS,
  type ThumbPlacement,
  withStandardThumbs,
} from './standard.js';
export {
  ACCENTS,
  accentsCombo,
  accentsComboKeys,
  CORE_SPLIT_PAIRS,
  DEFAULT_LAYER_ID_LIST,
  DEFAULT_LAYER_IDS,
  type DefaultLayers,
  defaultAccentMacros,
  defaultDeadKeys,
  defaultLayerSymbols,
  defaultLayers,
  EXTRAS_CONDITION,
  EXTRAS_ORDER,
  mirrorKeyId,
  NUMBERS_CORE,
  NUMBERS_OUTER,
  primeKeys,
  SYMBOL_PAIRS,
  SYMBOLS_CORE,
  SYMBOLS_OUTER,
  vowelsOnLeft,
  withDefaultLayers,
} from './templates.js';

/** Layouts made for small boards: thumb letters, chords, adaptive and repeat keys. */
export const SMALL_LAYOUTS: Layout[] = SMALL_DEFS.map(classicLayout);

/**
 * A layout with the default layers. A Standard or Thumb Alpha one takes the standard thumbs and
 * base-layer symbols too, `placed` saying whose its thumb keys are; a Special one keeps every key
 * it has, with the thumbs and the combo that reach the default layers.
 */
function withDefaults(placed: ThumbPlacement) {
  return (layout: Layout): Layout => {
    const g = layout.geometry;
    if (!('preset' in g)) return layout;
    const geometry = getGeometryPreset(g.preset);
    return layoutCategory(layout) === 'special'
      ? withDefaultLayers(layout, geometry)
      : withStandardThumbs(layout, geometry, placed);
  };
}

/**
 * The layouts written here in code: the set the app started with, and Romak back among them. Each
 * has the default layers. LayerBench placed the thumbs of the classic layouts, their authors having
 * left them to a space bar; the small-board layouts' authors placed their own. Magic Romak keeps
 * its own thumbs on Numbers and Symbols, and reaches Accents from Alpha 2, where it reached Dead
 * keys.
 */
const BUILT_IN_LAYOUTS: Layout[] = [
  magicRomak,
  romak,
  ...CLASSIC_LAYOUTS.map(withDefaults('layerbench')),
  ...SMALL_LAYOUTS.map(withDefaults('author')),
];

/** The layouts the app offers: those written here, then those added since as documents. */
export const BUNDLED_LAYOUTS: Layout[] = [...BUILT_IN_LAYOUTS, ...DOCUMENT_LAYOUTS];

export function bundledLayout(id: string): Layout | undefined {
  return BUNDLED_LAYOUTS.find((l) => l.id === id);
}

/** Any layout with a checked-in document, written here or added as one. */
export function documentedLayouts(): Layout[] {
  return BUNDLED_LAYOUTS;
}

/**
 * The layouts written here in code, whose documents the golden dump writes. One added as a document
 * is its own checked-in document already.
 */
export function goldenLayouts(): Layout[] {
  return BUILT_IN_LAYOUTS;
}

export function documentedLayout(id: string): Layout | undefined {
  return documentedLayouts().find((l) => l.id === id);
}
