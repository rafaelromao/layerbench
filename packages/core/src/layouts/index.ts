import { getGeometryPreset } from '../geometry/presets.js';
import { layoutCategory } from '../layout/categories.js';
import type { Layout } from '../layout/types.js';
import { BUNDLED_IDS } from './bundled-ids.js';
import { CLASSIC_DEFS, type ClassicDef, classicLayout } from './classic.js';
import { DOCUMENT_LAYOUTS } from './documents.js';
import LANGUAGES from './languages.json';
import { SMALL_DEFS } from './small.js';
import { type ThumbPlacement, withStandardThumbs } from './standard.js';
import { bringsOwnLayers, withDefaultLayers, withHomeRowMods } from './templates.js';

export { BUNDLED_IDS, DEFAULT_LAYOUT_ID } from './bundled-ids.js';
export { CLASSIC_DEFS, CLASSIC_LAYOUTS, classicLayout } from './classic.js';
export { DOCUMENT_LAYOUTS, documentLayout, documentMissing } from './documents.js';
export { keptInLibrary } from './library-edit/request.js';
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
  bringsOwnLayers,
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
  HOME_ROW_MODS,
  hasDefaultLayers,
  mirrorKeyId,
  NUMBERS_CORE,
  NUMBERS_OUTER,
  primeKeys,
  SYMBOL_PAIRS,
  SYMBOLS_CORE,
  SYMBOLS_OUTER,
  tapOf,
  vowelsOnLeft,
  withDefaultLayers,
  withHomeRowMods,
} from './templates.js';

/** Layouts made for small boards: thumb letters, chords, adaptive and repeat keys. */
export const SMALL_LAYOUTS: Layout[] = SMALL_DEFS.map(classicLayout);

/**
 * A layout with the default layers. A Standard or Thumb Alpha one takes the standard thumbs and
 * base-layer symbols too, `placed` saying whose its thumb keys are; a Special one keeps every key
 * it has, with the thumbs and the combo that reach the default layers. A layout whose author
 * defines layers of its own keeps them, its thumbs and its base layer as they are, whatever its
 * category.
 */
function withDefaults(placed: ThumbPlacement) {
  return (layout: Layout): Layout => {
    const g = layout.geometry;
    if (!('preset' in g) || bringsOwnLayers(layout)) return layout;
    const geometry = getGeometryPreset(g.preset);
    return layoutCategory(layout) === 'special'
      ? withDefaultLayers(layout, geometry)
      : withStandardThumbs(layout, geometry, placed);
  };
}

/**
 * A layout written in code, built from its definition: its default layers, then the home row mods,
 * its own if its definition gives them.
 */
function built(placed: ThumbPlacement) {
  return (def: ClassicDef): Layout => {
    const layout = withDefaults(placed)(classicLayout(def));
    return def.homeRowMods === false ? layout : withHomeRowMods(layout, def.homeRowMods);
  };
}

/** Layouts in the order of `BUNDLED_IDS`, the order the Library lists them in. */
function byBundledOrder(a: Layout, b: Layout): number {
  return BUNDLED_IDS.indexOf(a.id ?? '') - BUNDLED_IDS.indexOf(b.id ?? '');
}

/**
 * The layouts written here in code: the set the app started with, and Romak back among them. Each
 * has the default layers and home row mods, but a layout whose author defines layers of its own
 * keeps those instead of the default ones, and its author's home row mods where its keymap holds
 * its layers on the home row, as any layout may. LayerBench placed the thumbs of the classic
 * layouts, their authors having left them to a space bar; the small-board layouts' authors placed
 * their own. They are listed in the order of `BUNDLED_IDS`, as the languages file is.
 */
const BUILT_IN_LAYOUTS: Layout[] = [
  ...CLASSIC_DEFS.map(built('layerbench')),
  ...SMALL_DEFS.map(built('author')),
]
  .sort(byBundledOrder)
  .map(withLanguages);

/**
 * A layout written in code, with the languages it performs well in: measured, not chosen, by
 * `pnpm languages` (`lang/performance.ts`), which writes them to `languages.json`. A layout added
 * as a document carries its own, written the same way.
 */
function withLanguages(layout: Layout): Layout {
  return { ...layout, languages: (LANGUAGES as Record<string, string[]>)[layout.id ?? ''] ?? [] };
}

/**
 * The layouts the app offers, those written here and those added as documents, in the order of
 * `BUNDLED_IDS`: the layout a visit opens first, wherever it is written.
 */
export const BUNDLED_LAYOUTS: Layout[] = [...BUILT_IN_LAYOUTS, ...DOCUMENT_LAYOUTS].sort(
  byBundledOrder,
);

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
