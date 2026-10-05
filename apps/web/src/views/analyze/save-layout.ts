import { freeId, idForName, type Layout, toCanonicalJson } from '@layoutmaster/core';
import type { useStorage } from '../../storage/use-storage.js';

type Storage = ReturnType<typeof useStorage>;

/** Where a save put the layout, and whether a renamed layout's old copy is still there. */
export interface Saved {
  id: string;
  /** The old copy of a renamed layout could not be removed, and stays in the Library. */
  leftBehind: boolean;
}

/**
 * Store a layout. Its id follows its name: one already stored keeps its id while that still matches
 * its name, and moves to its new name's once renamed; anything else takes a free id from its name.
 * Neither overwrites a saved layout whose name happens to slug the same. A renamed layout's old copy
 * goes only once the new one is safely stored.
 */
export async function saveLayout(
  storage: Storage,
  layout: Layout,
  storedId: string | null,
): Promise<Saved> {
  const taken = new Set((await storage.list('layouts')).map((e) => e.id));
  const id =
    storedId !== null ? idForName(layout.name, storedId, taken) : freeId(layout.name, taken);
  await storage.put('layouts', id, toCanonicalJson({ ...layout, id }), {
    message: `Save layout ${layout.name}`,
  });
  let leftBehind = false;
  if (storedId !== null && id !== storedId) {
    try {
      await storage.delete('layouts', storedId, { message: `Rename layout to ${layout.name}` });
    } catch {
      leftBehind = true;
    }
  }
  return { id, leftBehind };
}
