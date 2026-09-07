import type { CompiledLayout } from '../layout/compile.js';
import { evaluate } from '../rules/engine.js';
import type { RuleSet } from '../rules/types.js';
import type { Report } from './analyze.js';

/**
 * Whether swapping two keys is a relabel rather than a change of behavior: both hold plain output
 * bindings on that layer, neither is the space or shift key, and no typing path names either key.
 * Only then can the existing n-gram tables be reused.
 */
export function relabelEligible(
  c: CompiledLayout,
  layerIdx: number,
  posA: number,
  posB: number,
): boolean {
  if (posA === posB) return false;
  const layer = c.layers[layerIdx];
  if (!layer) return false;

  const plain = (pos: number): boolean =>
    layer.explicit[pos] === true && layer.bindings[pos]?.kind === 'kp';
  if (!plain(posA) || !plain(posB)) return false;

  const shiftPos = c.shiftKey?.key;
  for (const pos of [posA, posB]) {
    if (pos === c.spaceKey || (shiftPos !== undefined && pos === shiftPos)) return false;
  }

  const ids = [c.keys[posA]?.id, c.keys[posB]?.id].filter(Boolean) as string[];
  for (const entries of Object.values(c.layout.typingPaths ?? {})) {
    for (const e of entries) {
      if (ids.some((id) => e.producer.includes(`/${id}`))) return false;
    }
  }
  return true;
}

/**
 * Re-score after a relabel by moving the affected logical keys to their new positions and running
 * the rules again over the existing tables. Exact for every n-gram metric; travel, run and word
 * statistics stay as simulated, so the report is marked provisional.
 */
export function relabelSwap(
  report: Report,
  compiled: CompiledLayout,
  layerIdx: number,
  posA: number,
  posB: number,
  ruleSet: RuleSet,
): Report {
  const registry = report.simulation.registry.clone();
  for (const lk of registry.all()) {
    if (lk.layer !== layerIdx) continue;
    if (lk.pos === posA) registry.setPosition(lk.id, posB);
    else if (lk.pos === posB) registry.setPosition(lk.id, posA);
  }
  const simulation = { ...report.simulation, registry };
  const { results, score, globals } = evaluate(simulation, compiled, ruleSet);
  return {
    ...report,
    layout: compiled.layout,
    compiled,
    simulation,
    results,
    score,
    globals,
    provisional: true,
  };
}
