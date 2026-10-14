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
 * storage is the browser's copy alone, which may lack a set or hold an older copy of it than
 * GitHub's, so the set is still being read until settled storage has answered.
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
    /** Whether the storage it was read from was settled: only then is it the set for good. */
    settled: boolean;
    read: SavedRead<RuleSet>;
  } | null>(null);

  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    void readSaved(storage, 'rulesets', id).then((r) => {
      if (cancelled) return;
      setRead((prev) => {
        if (prev?.ref !== ref) return { ref, storage, settled, read: r };
        // What settled storage said stands until settled storage says otherwise: a sign-in
        // under way reads the browser's copy alone, which may be behind GitHub's.
        if (prev.settled && !settled) return prev;
        // The same set read again is the same set: what is analyzed on it is not asked again.
        const same =
          prev.read.status === 'read' &&
          r.status === 'read' &&
          stableStringify(prev.read.doc) === stableStringify(r.doc);
        return same ? { ...prev, storage, settled } : { ref, storage, settled, read: r };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [ref, id, storage, settled]);

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
    // Until settled storage has been read, the browser's copy may be behind GitHub's, or lack a
    // set only GitHub has: nothing is analyzed on it, nor said to be missing.
    if (!known?.settled) return { ref, name, status: 'reading' };
    const r = known.read;
    if (r.status === 'read')
      return { ref, name: r.doc.name ?? name, status: 'read', ruleSet: r.doc };
    // Only the storage now in use, once settled, can say a set will not open.
    if (known.storage !== storage || !settled) return { ref, name, status: 'reading' };
    return { ref, name, status: 'failed', failure: r, error: savedError('rulesets', name, r) };
  }, [preset, id, ref, read, storage, settled]);
}
