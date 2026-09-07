import { getPreset, type RuleSet } from '@layoutmaster/core';
import { useEffect, useMemo, useState } from 'react';
import { resolveRuleSet, withUniverse } from '../storage/rule-sets.js';
import { useStorage } from '../storage/use-storage.js';

/** Resolve a `?rules=` reference, with the toolbar's universe toggle applied on top. */
export function useRuleSet(ref: string, universe: 'no_space' | 'with_space'): RuleSet {
  const storage = useStorage();
  const [resolved, setResolved] = useState<RuleSet>(() => getPreset(ref));

  useEffect(() => {
    let cancelled = false;
    resolveRuleSet(ref, storage).then((rs) => {
      if (!cancelled) setResolved(rs);
    });
    return () => {
      cancelled = true;
    };
  }, [ref, storage]);

  return useMemo(() => withUniverse(resolved, universe), [resolved, universe]);
}
