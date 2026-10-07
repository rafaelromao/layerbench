import type { Layout } from '../layout/types.js';
import { CLASSIC_LAYOUTS, classicLayout } from './classic.js';
import { DOCUMENT_LAYOUTS } from './documents.js';
import { magicRomak, romak24, romak34 } from './romak.js';
import { SMALL_DEFS } from './small.js';

export { CLASSIC_DEFS, CLASSIC_LAYOUTS, classicLayout } from './classic.js';
export { DOCUMENT_LAYOUTS, documentLayout } from './documents.js';
export { magicRomak, romak24, romak34 } from './romak.js';
export { SMALL_DEFS } from './small.js';
export { numberLayer, symbolLayer, templateSymbols } from './templates.js';

/** Layouts made for small boards: thumb letters, chords, magic and repeat keys. */
export const SMALL_LAYOUTS: Layout[] = SMALL_DEFS.map(classicLayout);

/** The layouts written here in code: the set the app started with. */
const BUILT_IN_LAYOUTS: Layout[] = [magicRomak, ...CLASSIC_LAYOUTS, ...SMALL_LAYOUTS];

/** The layouts the app offers: those written here, then those added since as documents. */
export const BUNDLED_LAYOUTS: Layout[] = [...BUILT_IN_LAYOUTS, ...DOCUMENT_LAYOUTS];

/**
 * Layouts the app no longer offers but the engine still exercises: Romak 24 is Magic Romak without
 * the adaptive behaviours, and Romak 34 is its 3×5+2 variant. They stay in the golden matrix, so the
 * one-shot-layer, accent-macro and combo paths they cover remain pinned.
 */
export const RETIRED_LAYOUTS: Layout[] = [romak24, romak34];

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
