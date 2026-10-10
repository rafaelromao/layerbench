import { type AnalysisSettings, stableStringify } from '@layerbench/core';
import { useMemo } from 'react';
import { useRuleSet } from './useRuleSet.js';

/**
 * The analysis settings a link names, with its rule set read. The same choices give the same object
 * from one render to the next, as a new one would ask the engine for the analysis again.
 */
export function useAnalysisSettings(linked: AnalysisSettings<string>): AnalysisSettings {
  const rules = useRuleSet(linked.rules, linked.universe);
  const same = stableStringify(linked);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `same` is the content of `linked`
  return useMemo(() => ({ ...linked, rules }), [same, rules]);
}
