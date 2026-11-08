import type { Binding, ComboDef } from '../layout/types.js';

/**
 * What the import of an author's keymap-drawer file read: the layers it was asked for, each key as
 * the importer makes it, and the combos. It is written by `pnpm keymap` from the file kept in
 * `packages/core/fixtures`, and kept as written, so a change in what the file says, or in how it is
 * read, shows in a review. A layout built on it adds only what keymap-drawer has no field for.
 */
export interface KeymapSource {
  /** Where the file is: its repository, its path there, and the commit it was copied at. */
  source: { repository: string; path: string; commit: string };
  layers: { id: string; name: string; bindings: Record<string, Binding> }[];
  combos: ComboDef[];
}

/** A layer of the source, as a copy a layout may change. */
export function sourceLayer(
  source: KeymapSource,
  id: string,
): { id: string; name: string; bindings: Record<string, Binding> } {
  const layer = source.layers.find((l) => l.id === id);
  if (!layer) throw new Error(`The keymap source has no layer ${id}`);
  return structuredClone(layer);
}
