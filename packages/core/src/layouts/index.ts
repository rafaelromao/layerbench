import type { Layout } from '../layout/types.js';
import { CLASSIC_LAYOUTS } from './classic.js';
import { magicRomak, romak24, romak34 } from './romak.js';

export { CLASSIC_DEFS, CLASSIC_LAYOUTS, classicLayout } from './classic.js';
export { magicRomak, romak24, romak34 } from './romak.js';

export const BUNDLED_LAYOUTS: Layout[] = [magicRomak, romak24, romak34, ...CLASSIC_LAYOUTS];

export function bundledLayout(id: string): Layout | undefined {
  return BUNDLED_LAYOUTS.find((l) => l.id === id);
}
