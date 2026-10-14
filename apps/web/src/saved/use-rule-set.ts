import { getPreset, type RuleSet, type StorageAdapter, stableStringify } from '@layerbench/core';
import { useEffect, useMemo, useState } from 'react';
import { useSettled, useStorage } from '../storage/use-storage.js';
import { readSaved, type SavedFailure, type SavedRead, savedError } from './read.js';
import { savedId } from './ref.js';

/**
 * The rule set a reference names, as far as it is known: still being read, read, or not opened and
 * why. Always the one asked for, never the one asked for before.
 */
export type RuleSetState = {
  ref: string;
  /** The set's own name once read; its id until then, or when it will not open. */
  name: string;
} & (
  | { status: 'reading' }
  | { status: 'read'; ruleSet: RuleSet }
  | { status: 'failed'; failure: SavedFailure; error: string }
);

/**
 * Read the rule set a `rules=` reference names: a preset at once, a saved set from storage. Nothing
 * stands in while a saved set is read, or for one that will not open. Until sign-in is known,
 * storage is the browser's copy alone, so a set it lacks is still being read: it may be on GitHub.
 * A set read stays while storage changes under it, and is read again from the new storage; one
 * left for another reference is forgotten, so coming back to it reads it again.
 */
export function useRuleSet(ref: string): RuleSetState {
  const storage = useStorage();
  const settled = useSettled();
  const id = savedId(ref);
  const [read, setRead] = useState<{
    ref: string;
    storage: StorageAdapter;
    read: SavedRead<RuleSet>;
  } | null>(null);

  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    void readSaved(storage, 'rulesets', id).then((r) => {
      if (cancelled) return;
      // The same set read again, from storage signed in since, is the same set: what is analyzed
      // on it is not asked for again.
      setRead((prev) =>
        prev?.ref === ref &&
        prev.read.status === 'read' &&
        r.status === 'read' &&
        stableStringify(prev.read.doc) === stableStringify(r.doc)
          ? { ...prev, storage }
          : { ref, storage, read: r },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [ref, id, storage]);

  // A set looked at before, and asked for again, may have been saved since: it is read afresh.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new reference is the trigger
  useEffect(() => () => setRead(null), [ref]);

  const preset = useMemo<RuleSetState | null>(() => {
    if (id !== null) return null;
    const ruleSet = getPreset(ref);
    return { ref, name: ruleSet.name ?? ref, status: 'read', ruleSet };
  }, [ref, id]);

  return useMemo<RuleSetState>(() => {
    if (preset) return preset;
    const known = id !== null && read?.ref === ref ? read : null;
    const name = id ?? ref;
    if (!known) return { ref, name, status: 'reading' };
    const r = known.read;
    if (r.status === 'read')
      return { ref, name: r.doc.name ?? name, status: 'read', ruleSet: r.doc };
    // Only the storage now in use, once settled, can say a set will not open.
    if (known.storage !== storage || !settled) return { ref, name, status: 'reading' };
    return { ref, name, status: 'failed', failure: r, error: savedError('rulesets', name, r) };
  }, [preset, id, ref, read, storage, settled]);
}
