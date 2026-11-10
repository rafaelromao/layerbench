import type { Layout } from '../layout/types.js';
import { BUNDLED_IDS } from './bundled-ids.js';
import { CLASSIC_DEFS, type ClassicDef, classicLayout } from './classic.js';
import { DOCUMENT_LAYOUTS } from './documents.js';
import { SMALL_DEFS } from './small.js';
import { withHomeRowMods } from './templates.js';

export { BUNDLED_IDS, DEFAULT_LAYOUT_ID } from './bundled-ids.js';
export { CLASSIC_DEFS, CLASSIC_LAYOUTS, classicLayout } from './classic.js';
export { DOCUMENT_LAYOUTS, documentLayout, documentMissing } from './documents.js';
export { keptInLibrary } from './library-edit/request.js';
export { SMALL_DEFS } from './small.js';
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
  withHomeRowMods,
  withNewLayoutDefaults,
} from './templates.js';

/** Layouts made for small boards: thumb letters, chords, adaptive and repeat keys. */
export const SMALL_LAYOUTS: Layout[] = SMALL_DEFS.map(classicLayout);

/**
 * A layout written in code, built from its definition: the layout its author designed, with the
 * home row mods its author's keymap holds, where its definition gives them, and the languages its
 * author states.
 */
function built(def: ClassicDef): Layout {
  const layout = classicLayout(def);
  return {
    ...(def.homeRowMods ? withHomeRowMods(layout, def.homeRowMods) : layout),
    languages: [...(def.languages ?? [])],
  };
}

/** Layouts in the order of `BUNDLED_IDS`, the order the Library lists them in. */
function byBundledOrder(a: Layout, b: Layout): number {
  return BUNDLED_IDS.indexOf(a.id ?? '') - BUNDLED_IDS.indexOf(b.id ?? '');
}

/**
 * The layouts written here in code, each as its author designed it: one whose author leaves the
 * thumbs to a space bar has its space on a thumb of its definition's choosing, and the
 * small-board layouts' authors placed their own. They are listed in the order of `BUNDLED_IDS`.
 */
const BUILT_IN_LAYOUTS: Layout[] = [...CLASSIC_DEFS, ...SMALL_DEFS].map(built).sort(byBundledOrder);

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
