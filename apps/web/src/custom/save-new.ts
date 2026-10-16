import { freeId, type Layout, type StorageAdapter, toCanonicalJson } from '@layerbench/core';

/**
 * Store a layout as a custom layout of its own, under a free id from its name: a card another layout
 * has the id of is never overwritten. The one way a layout becomes a new custom layout, whether it
 * comes from New layout, an import or Save in Analyze; the id is only for links, and the layout is
 * known by its name. `onId` hears the id before anything is written: a save that falls over may
 * still have been written here, and whoever tries again needs to know where.
 */
export async function saveNewLayout(
  storage: StorageAdapter,
  layout: Layout,
  message: string,
  onId: (id: string) => void = () => {},
): Promise<{ id: string }> {
  const taken = new Set((await storage.list('layouts')).map((e) => e.id));
  const id = freeId(layout.name, taken);
  onId(id);
  await storage.put('layouts', id, toCanonicalJson({ ...layout, id }), { message });
  return { id };
}

/**
 * The name a copy of `name` is offered under: "<name> copy", numbered ("<name> copy 2", …) while a
 * layout, bundled or custom, already goes by it. Names are compared as a person reads them, so
 * capitals and the spaces around a name do not make two of them.
 */
export function freeCopyName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((n) => n.trim().toLowerCase()));
  const base = `${name.trim()} copy`;
  let copy = base;
  for (let n = 2; used.has(copy.toLowerCase()); n++) copy = `${base} ${n}`;
  return copy;
}
