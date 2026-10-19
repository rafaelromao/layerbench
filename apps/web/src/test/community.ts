import { bundledLayout, type Layout, toCanonicalJson } from '@layerbench/core';
import type { CommunitySource } from '../community/community.js';

/**
 * A community layout as one is submitted: a layout as LayerBench saves it, named by its id, with an
 * author and a link to where it comes from. Qwerty underneath.
 */
export function communityDoc(id: string, name: string, extra: Partial<Layout> = {}): Layout {
  return {
    ...(bundledLayout('qwerty') as Layout),
    id,
    name,
    author: 'Someone else',
    description: `${name}, made elsewhere.`,
    link: `https://example.com/${id}`,
    ...extra,
  };
}

/** The `layerbench-data` branch holding these layouts, listed in its index, as a source. */
export function branchWith(...layouts: Layout[]): CommunitySource & { reads: string[] } {
  const reads: string[] = [];
  const files = new Map<string, unknown>([
    ['index.json', { layouts: layouts.map((l) => l.id) }],
    ...layouts.map((l) => [`${l.id}.json`, toCanonicalJson(l)] as const),
  ]);
  const source = async (file: string) => {
    reads.push(file);
    if (!files.has(file)) throw new Error(`${file}: 404 Not Found`);
    return structuredClone(files.get(file));
  };
  return Object.assign(source, { reads });
}
