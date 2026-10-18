import {
  freeId,
  type JsonObject,
  type Layout,
  type StorageAdapter,
  toCanonicalJson,
} from '@layerbench/core';

/**
 * Store a layout as a custom layout of its own, under a free id from its name: a card another layout
 * has the id of is never overwritten. The one way a layout becomes a new custom layout, whether it
 * comes from New layout, an import or Save in Analyze; the id is only for links, and the layout is
 * known by its name. `onAttempt` hears the id and the document before anything is written: a save
 * that falls over may still have been written here, and whoever tries again needs to know where, and
 * to tell that document from one that is someone else's.
 */
export async function saveNewLayout(
  storage: StorageAdapter,
  layout: Layout,
  message: string,
  onAttempt: (id: string, doc: JsonObject) => void = () => {},
): Promise<{ id: string }> {
  const taken = new Set((await storage.list('layouts')).map((e) => e.id));
  const id = freeId(layout.name, taken);
  const doc = toCanonicalJson({ ...layout, id });
  onAttempt(id, doc);
  await storage.put('layouts', id, doc, { message });
  return { id };
}

/** Keys in order and nothing else, so two documents read alike however each was stored. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/** Whether two stored documents say the same, whichever order their keys came in. */
export function sameDocument(a: JsonObject, b: JsonObject): boolean {
  return stable(a) === stable(b);
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

/**
 * A way to save new layouts that remembers its last failed save. With gists as well as the
 * browser, a save can fail after the browser has written the layout; saving the same layout again,
 * from a dialog still open or one opened afresh, then takes over that document rather than make a
 * second beside it. Only a document that is exactly what was written, and exactly what is being
 * saved now, is taken over: anything else there is someone else's, and a free id is taken.
 */
export function retryingSaver(): (
  storage: StorageAdapter,
  layout: Layout,
  message: string,
) => Promise<{ id: string }> {
  let attempted: { id: string; doc: JsonObject } | null = null;
  return async (storage, layout, message) => {
    if (attempted) {
      const { id, doc } = attempted;
      const there = await storage.get('layouts', id).catch(() => null);
      if (
        there &&
        sameDocument(there.doc, doc) &&
        sameDocument(toCanonicalJson({ ...layout, id }), doc)
      ) {
        await storage.put('layouts', id, doc, { message });
        attempted = null;
        return { id };
      }
    }
    const saved = await saveNewLayout(storage, layout, message, (id, doc) => {
      attempted = { id, doc };
    });
    attempted = null;
    return saved;
  };
}
