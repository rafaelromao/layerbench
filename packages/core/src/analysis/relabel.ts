import type { CompiledLayout } from '../layout/compile.js';
import { evaluate } from '../rules/engine.js';
import type { RuleSet } from '../rules/types.js';
import type { Report } from './analyze.js';

/**
 * Whether swapping two keys is a relabel rather than a change of behavior: both hold plain output
 * bindings on that layer, neither is the space or shift key, and no typing path names either key.
 * Only then can the existing n-gram tables be reused. A home row mod is plain output with a
 * modifier held, which types nothing; one holding Shift is a shift key, as the analysis may hold
 * it for a capital.
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

  const plain = (pos: number): boolean => {
    const b = layer.bindings[pos];
    if (layer.explicit[pos] !== true || !b) return false;
    if (b.kind !== 'hold_tap') return b.kind === 'kp';
    return (
      b.tap.kind === 'kp' &&
      b.hold.kind === 'mod' &&
      b.hold.mod !== 'LSHIFT' &&
      b.hold.mod !== 'RSHIFT'
    );
  };
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
 * Re-score after a relabel by moving the presses of the two keys to each other's positions and
 * running the rules again over the same press log. Exact for every n-gram metric as long as the layout
 * would be typed the same way after the swap; but the simulator weighs same-finger pairs when it
 * chooses how to type a character and which key taps a layer, so a swap can change those choices.
 * Travel, run and word statistics stay as simulated. The report is marked provisional either way,
 * and the full analysis replaces it.
 */
export function relabelSwap(
  report: Report,
  compiled: CompiledLayout,
  layerIdx: number,
  posA: number,
  posB: number,
  ruleSet: RuleSet,
): Report {
  const presses = report.simulation.presses.moved(layerIdx, posA, posB);
  const simulation = { ...report.simulation, presses };
  const { results, score, globals } = evaluate(simulation, compiled, ruleSet);
  return {
    ...report,
    layout: compiled.layout,
    compiled,
    simulation,
    results,
    score,
    globals,
    ruleSet,
    provisional: true,
  };
}
