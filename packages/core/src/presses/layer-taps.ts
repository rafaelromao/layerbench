import type { CompiledLayout } from '../layout/compile.js';
import type { PressLog } from './press-log.js';

/** Layer taps made on one key, on the layer it was pressed on. */
export interface LayerTaps {
  layer: number;
  /** A physical key. */
  key: number;
  taps: number;
}

/**
 * Where the text tapped layers: the presses the `layer_taps` statistic counts (a one-shot, toggle or
 * to-layer key, or a layer key tapped; a combo is a combo), on the key and layer each was pressed
 * on, read with space so none is left out. In the order the presses were first made.
 */
export function layerTapsByKey(log: PressLog, compiled: CompiledLayout): LayerTaps[] {
  const out: LayerTaps[] = [];
  const unigrams = log.ngrams('with_space', 'unigram');
  for (let i = 0; i < unigrams.size; i++) {
    const press = log.presses[unigrams.ids[i]];
    if (press.kind !== 'layer_tap') continue;
    // A key's own position is its one member; split, should a press of several keys ever count.
    const members = compiled.positions[press.pos].members;
    const taps = unigrams.counts[i] / members.length;
    for (const key of members) out.push({ layer: press.layer, key, taps });
  }
  return out;
}
