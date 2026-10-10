import { getPreset, type RuleSet } from '@layerbench/core';
import { useEffect, useState } from 'react';
import { resolveRuleSet } from '../storage/rule-sets.js';
import { useStorage } from '../storage/use-storage.js';

/**
 * Resolve a `?rules=` reference. Whether space counts is not the rule set's to say in the app: the
 * analysis settings apply the view's Space to it.
 */
export function useRuleSet(ref: string): RuleSet {
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

  return resolved;
}
