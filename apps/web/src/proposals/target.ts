import { BUNDLED_LAYOUTS, type Layout, sameName } from '@layerbench/core';
import type { LayoutSource } from '../layout-session/open.js';

/**
 * The layout of the Library that goes by `name`, as a change can be proposed to it: a bundled
 * layout first, then a community one; null when none does. Names are read as the Library reads
 * them, so capitals and spacing do not make two. A custom layout that goes by the name of one the
 * Library has is what remains of a change proposed to it and closed, or a layout made to replace
 * it: Submit offers to propose it as a change then, as a new layout by that name would be refused.
 */
export function libraryLayoutNamed(
  name: string,
  community: readonly Layout[],
  bundled: readonly Layout[] = BUNDLED_LAYOUTS,
): LayoutSource | null {
  const named = (l: Layout) => l.id !== undefined && sameName(l.name, name);
  const inBundled = bundled.find(named);
  if (inBundled?.id) return { kind: 'bundled', id: inBundled.id };
  const inCommunity = community.find(named);
  return inCommunity?.id ? { kind: 'community', id: inCommunity.id } : null;
}
