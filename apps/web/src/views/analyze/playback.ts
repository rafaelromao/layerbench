import type { CompiledLayout } from '@layerbench/core';
import type { ExplainStepDTO } from '../../engine/protocol.js';

/**
 * One moment of a word being typed, as the board shows it: the layer the press lands on, the keys
 * pressed — several for a combo — and the keys still held from before, such as a layer's thumb.
 */
export interface PlayFrame {
  /** Index of the step this frame shows, in the explanation's list. */
  step: number;
  layer: number;
  keys: number[];
  held: number[];
  /** The combo pressed, when the press is one. */
  combo: string | null;
}

/**
 * The explanation's steps as frames to play one after another. A release is not a frame of its
 * own: it only ends what the hold began, so the key stops being shown as held.
 */
export function playFrames(steps: ExplainStepDTO[], compiled: CompiledLayout): PlayFrame[] {
  const members = new Map(compiled.positions.map((p) => [p.id, p.members]));
  const comboAt = new Map(compiled.combos.map((c) => [compiled.positions[c.pos]?.id, c.id]));
  // A step names its layer; the first layer of that name is the one it means.
  const layerNamed = new Map<string, number>();
  for (const l of compiled.layers) if (!layerNamed.has(l.name)) layerNamed.set(l.name, l.idx);

  const held: number[] = [];
  const frames: PlayFrame[] = [];
  steps.forEach((s, step) => {
    const keys = members.get(s.key) ?? [];
    if (s.kind === 'hold_release') {
      for (const k of keys) {
        const at = held.indexOf(k);
        if (at >= 0) held.splice(at, 1);
      }
      return;
    }
    frames.push({
      step,
      layer: layerNamed.get(s.layer) ?? 0,
      keys,
      held: [...held],
      combo: comboAt.get(s.key) ?? null,
    });
    if (s.kind === 'hold_press') held.push(...keys);
  });
  return frames;
}
