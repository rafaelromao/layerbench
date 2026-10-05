import type { RuleResult } from './types.js';

/**
 * A key's part of a rule's number, in the number's own unit: on one layer, or on every layer when
 * none is named. Null where the number is not a sum over keys. The parts of every key add up to it.
 */
export function keyPart(result: RuleResult, key: number, layer?: number): number | null {
  if (result.key_scale === null) return null;
  const credit =
    layer === undefined ? (result.per_key[key] ?? 0) : (result.per_layer_key[layer]?.[key] ?? 0);
  return credit * result.key_scale;
}
