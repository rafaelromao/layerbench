import type { Layout } from '../layout/types.js';
import { CLASSIC_LAYOUTS } from './classic.js';
import { magicRomak, romak24, romak34 } from './romak.js';

export { CLASSIC_DEFS, CLASSIC_LAYOUTS, classicLayout } from './classic.js';
export { magicRomak, romak24, romak34 } from './romak.js';
export { numberLayer, symbolLayer, templateSymbols } from './templates.js';

/** The layouts the app offers. */
export const BUNDLED_LAYOUTS: Layout[] = [magicRomak, ...CLASSIC_LAYOUTS];

/**
 * Layouts the app no longer offers but the engine still exercises: Romak 24 is Magic Romak without
 * the adaptive behaviours, and Romak 34 is its 3×5+2 variant. They stay in the golden matrix, so the
 * one-shot-layer, accent-macro and combo paths they cover remain pinned.
 */
export const RETIRED_LAYOUTS: Layout[] = [romak24, romak34];

export function bundledLayout(id: string): Layout | undefined {
  return BUNDLED_LAYOUTS.find((l) => l.id === id);
}

/** Any layout with a checked-in document, offered or retired. Used by the golden dump. */
export function documentedLayouts(): Layout[] {
  return [...BUNDLED_LAYOUTS, ...RETIRED_LAYOUTS];
}

export function documentedLayout(id: string): Layout | undefined {
  return documentedLayouts().find((l) => l.id === id);
}
