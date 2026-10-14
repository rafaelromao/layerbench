import { getPreset, type RuleSet, type StorageAdapter, safeParseRuleSet } from '@layerbench/core';
import { savedId } from '../saved/ref.js';

/**
 * Resolve a `?rules=` reference: a preset id, or `saved:<id>` for one the user stored. An
 * unreadable saved set falls back to the Layouts Doc definitions rather than failing the analysis.
 */
export async function resolveRuleSet(ref: string, storage: StorageAdapter): Promise<RuleSet> {
  const id = savedId(ref);
  if (id === null) return getPreset(ref);
  try {
    const stored = await storage.get('rulesets', id);
    if (!stored) return getPreset('layouts_doc');
    const parsed = safeParseRuleSet(stored.doc);
    return parsed.ok ? parsed.ruleSet : getPreset('layouts_doc');
  } catch {
    return getPreset('layouts_doc');
  }
}
