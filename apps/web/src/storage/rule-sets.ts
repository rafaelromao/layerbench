import { getPreset, type RuleSet, type StorageAdapter, safeParseRuleSet } from '@layerbench/core';

/**
 * Resolve a `?rules=` reference: a preset id, or `saved:<id>` for one the user stored. An
 * unreadable saved set falls back to the Layouts Doc definitions rather than failing the analysis.
 */
export async function resolveRuleSet(ref: string, storage: StorageAdapter): Promise<RuleSet> {
  if (!ref.startsWith('saved:')) return getPreset(ref);
  try {
    const stored = await storage.get('rulesets', ref.slice('saved:'.length));
    if (!stored) return getPreset('layouts_doc');
    const parsed = safeParseRuleSet(stored.doc);
    return parsed.ok ? parsed.ruleSet : getPreset('layouts_doc');
  } catch {
    return getPreset('layouts_doc');
  }
}

/** The universe toggle in the toolbar overrides whatever the rule set declares. */
export function withUniverse(ruleSet: RuleSet, universe: 'no_space' | 'with_space'): RuleSet {
  return { ...ruleSet, globals: { ...ruleSet.globals, universe } };
}
