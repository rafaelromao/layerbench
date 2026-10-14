import { getPreset, type RuleSet, type StorageAdapter } from '@layerbench/core';
import { readSaved } from '../saved/read.js';
import { savedId } from '../saved/ref.js';

/**
 * Resolve a `?rules=` reference: a preset id, or `saved:<id>` for one the user stored. An
 * unreadable saved set falls back to the Layouts Doc definitions rather than failing the analysis.
 */
export async function resolveRuleSet(ref: string, storage: StorageAdapter): Promise<RuleSet> {
  const id = savedId(ref);
  if (id === null) return getPreset(ref);
  const read = await readSaved(storage, 'rulesets', id);
  return read.status === 'read' ? read.doc : getPreset('layouts_doc');
}
