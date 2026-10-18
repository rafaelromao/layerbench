import { getGeometryPreset } from '../geometry/presets.js';
import type { Layout } from '../layout/types.js';
import { CLASSIC_LAYOUTS, classicLayout } from './classic.js';
import { DOCUMENT_LAYOUTS } from './documents.js';
import { magicRomak, romak24, romak34 } from './romak.js';
import { SMALL_DEFS } from './small.js';
import { withDefaultLayers } from './templates.js';

export { CLASSIC_DEFS, CLASSIC_LAYOUTS, classicLayout } from './classic.js';
export { DOCUMENT_LAYOUTS, documentLayout } from './documents.js';
export { magicRomak, romak24, romak34 } from './romak.js';
export { SMALL_DEFS } from './small.js';
export {
  ACCENTS,
  ACCENTS_COMBO_KEYS,
  accentsCombo,
  DEFAULT_LAYER_ID_LIST,
  DEFAULT_LAYER_IDS,
  type DefaultLayers,
  defaultAccentMacros,
  defaultDeadKeys,
  defaultLayerSymbols,
  defaultLayers,
  EXTRAS_CONDITION,
  EXTRAS_CORE,
  NUMBERS_CORE,
  NUMBERS_OUTER,
  SYMBOLS_CORE,
  SYMBOLS_OUTER,
  withDefaultLayers,
} from './templates.js';

/** Layouts made for small boards: thumb letters, chords, adaptive and repeat keys. */
export const SMALL_LAYOUTS: Layout[] = SMALL_DEFS.map(classicLayout);

/** A layout with the default layers, and the thumbs and the combo that reach them. */
function withDefaults(layout: Layout): Layout {
  const g = layout.geometry;
  return 'preset' in g ? withDefaultLayers(layout, getGeometryPreset(g.preset)) : layout;
}

/**
 * The layouts written here in code: the set the app started with, and Romak back among them. Each
 * has the default layers. Magic Romak and Romak keep their own thumbs on Numbers and Symbols, and
 * Magic Romak reaches Accents from Alpha 2, where it reached Dead keys.
 */
const BUILT_IN_LAYOUTS: Layout[] = [
  magicRomak,
  romak34,
  ...CLASSIC_LAYOUTS.map(withDefaults),
  ...SMALL_LAYOUTS.map(withDefaults),
];

/** The layouts the app offers: those written here, then those added since as documents. */
export const BUNDLED_LAYOUTS: Layout[] = [...BUILT_IN_LAYOUTS, ...DOCUMENT_LAYOUTS];

/**
 * Layouts the app no longer offers but the engine still exercises: Romak 24 is Magic Romak without
 * the adaptive behaviours. Its document stays checked in, so the one-shot-layer and accent-macro
 * paths it models literally remain pinned.
 */
export const RETIRED_LAYOUTS: Layout[] = [romak24];

export function bundledLayout(id: string): Layout | undefined {
  return BUNDLED_LAYOUTS.find((l) => l.id === id);
}

/** Any layout with a checked-in document, offered or retired, written here or added as one. */
export function documentedLayouts(): Layout[] {
  return [...BUNDLED_LAYOUTS, ...RETIRED_LAYOUTS];
}

/**
 * The layouts written here in code, offered or retired, whose documents the golden dump writes. One
 * added as a document is its own checked-in document already.
 */
export function goldenLayouts(): Layout[] {
  return [...BUILT_IN_LAYOUTS, ...RETIRED_LAYOUTS];
}

export function documentedLayout(id: string): Layout | undefined {
  return documentedLayouts().find((l) => l.id === id);
}
