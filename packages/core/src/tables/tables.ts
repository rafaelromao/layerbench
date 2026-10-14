import type { Finger } from '../geometry/types.js';
import type { PressLog } from '../presses/press-log.js';

export interface WordTrace {
  word: string;
  count: number;
  /** Number of physical presses for one occurrence. */
  presses: number;
  /** Press ids of one occurrence (first seen). */
  keys: number[];
}

export interface RunStats {
  /** Histogram of same-hand run lengths (index = length). */
  handRuns: number[];
  /** Same-hand strings (≥ 4 keys) → count. */
  handStrings: Map<string, number>;
  /** Histogram of same-finger run lengths. */
  fingerRuns: number[];
  /** Layer run lengths (consecutive presses resolved on the same non-base layer). */
  layerRuns: number[];
}

export interface FingerTravel {
  /** Cumulative Euclidean travel (U) from the finger's previous key, never reset. */
  continuous: Record<Finger, number>;
  /** Same, but fingers return to their home key at every word start (cyanophage-like). */
  resetAtWord: Record<Finger, number>;
  usage: Record<Finger, number>;
  /**
   * The same travel by the key it went to: indexed by press id, then by the key's place among the
   * keys a press makes (one for a single key, each of a chord's). Kept by press, so a swap
   * re-scored over the same press log carries each key's travel with it.
   */
  byKey: { continuous: number[][]; resetAtWord: number[][] };
}

export interface SimulationStats {
  symbols: number;
  words: number;
  keystrokes: number;
  space_presses: number;
  layer_taps: number;
  one_shot_activations: number;
  wasted_one_shots: number;
  hold_presses: number;
  chords: number;
  macro_presses: number;
  adaptive_presses: number;
  adaptive_trigger_hits: number;
  repeat_presses: number;
  per_layer: number[];
  unproducible: Map<string, number>;
}

export interface SimulationTables {
  /** Everything the text pressed. */
  presses: PressLog;
  runs: RunStats;
  words: Map<string, WordTrace>;
  travel: FingerTravel;
  stats: SimulationStats;
}
