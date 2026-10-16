import { type AnalysisSettings, stableStringify } from '@layerbench/core';
import { useMemo } from 'react';
import { useRuleSet } from '../custom/use-rule-set.js';

/**
 * The analysis settings a link names, as far as they are known: their rule set still being read,
 * read, or not opened and why. Nothing is analyzed on settings that are not read: no other rules
 * stand in for a custom set.
 */
export type AnalysisSettingsState = {
  /** The settings as the link names them, the rules by their reference. */
  linked: AnalysisSettings<string>;
  /** What the rule set is called: its own name once read, its id until then. */
  rulesName: string;
} & (
  | { status: 'reading'; settings: null; error: null }
  | { status: 'read'; settings: AnalysisSettings; error: null }
  | { status: 'failed'; settings: null; error: string }
);

/**
 * The analysis settings a link names, with its rule set read. The same choices give the same object
 * from one render to the next, as a new one would ask the engine for the analysis again.
 */
export function useAnalysisSettings(linked: AnalysisSettings<string>): AnalysisSettingsState {
  const rules = useRuleSet(linked.rules);
  const same = stableStringify(linked);
  const ruleSet = rules.status === 'read' ? rules.ruleSet : null;
  const error = rules.status === 'failed' ? rules.error : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `same` is the content of `linked`
  return useMemo(() => {
    const known = { linked, rulesName: rules.name };
    if (ruleSet)
      return { ...known, status: 'read', settings: { ...linked, rules: ruleSet }, error: null };
    if (error !== null) return { ...known, status: 'failed', settings: null, error };
    return { ...known, status: 'reading', settings: null, error: null };
  }, [same, ruleSet, error, rules.name]);
}
