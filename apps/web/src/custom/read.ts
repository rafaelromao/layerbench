import {
  type Collection,
  type JsonObject,
  type Layout,
  type RuleSet,
  type StorageAdapter,
  safeParseLayout,
  safeParseRuleSet,
} from '@layerbench/core';
import { readProposal } from '../proposals/proposals.js';

/** What a custom document of each collection is read as. A text is handed to the engine as it is. */
export type CustomDoc<C extends Collection> = C extends 'layouts'
  ? Layout
  : C extends 'rulesets'
    ? RuleSet
    : JsonObject;

/** A custom document read: there and readable, not saved here, or there but not readable. */
export type CustomRead<T> =
  | { status: 'read'; doc: T }
  | { status: 'missing' }
  | { status: 'unreadable'; why: string };

export type CustomFailure = Exclude<CustomRead<unknown>, { status: 'read' }>;

function parse(
  collection: Collection,
  doc: JsonObject,
): { ok: true; doc: unknown } | { ok: false; error: string } {
  switch (collection) {
    case 'layouts': {
      const parsed = safeParseLayout(doc);
      return parsed.ok ? { ok: true, doc: parsed.layout } : parsed;
    }
    case 'rulesets': {
      const parsed = safeParseRuleSet(doc);
      return parsed.ok ? { ok: true, doc: parsed.ruleSet } : parsed;
    }
    case 'corpora':
      return { ok: true, doc };
    case 'proposals':
      return readProposal(doc) ? { ok: true, doc } : { ok: false, error: 'not a proposed change' };
  }
}

/**
 * Read the custom document `id` of a collection. It never fails: storage that cannot be read, or a
 * document that is not one of its collection, is unreadable, and one storage does not hold is
 * missing. Nothing stands in for either.
 */
export async function readCustom<C extends Collection>(
  storage: StorageAdapter,
  collection: C,
  id: string,
): Promise<CustomRead<CustomDoc<C>>> {
  let stored: Awaited<ReturnType<StorageAdapter['get']>>;
  try {
    stored = await storage.get(collection, id);
  } catch (e) {
    return { status: 'unreadable', why: e instanceof Error ? e.message : String(e) };
  }
  if (!stored) return { status: 'missing' };
  const parsed = parse(collection, stored.doc);
  return parsed.ok
    ? { status: 'read', doc: parsed.doc as CustomDoc<C> }
    : { status: 'unreadable', why: parsed.error };
}

const NOUN: Record<Collection, string> = {
  layouts: 'layout',
  rulesets: 'rule set',
  corpora: 'text',
  proposals: 'proposed change',
};

/** What to tell someone a custom document did not open: the same words for every collection. */
export function customError(collection: Collection, id: string, failure: CustomFailure): string {
  const what = `${NOUN[collection]} ${id}`;
  return failure.status === 'missing'
    ? `${what} is not saved here`
    : `${what} cannot be read: ${failure.why}`;
}
