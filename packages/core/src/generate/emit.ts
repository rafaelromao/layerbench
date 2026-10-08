import { exportLayerText } from '../layout/text.js';
import type { Binding, Layout } from '../layout/types.js';
import { type Design, PRESET } from './model.js';
import type { Sample } from './tables.js';

/** A design as a LayerBench layout, the way the app saves one. */

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });

export interface EmitOptions {
  name: string;
  description?: string;
  id?: string;
  /** Adaptive keys to put on the base layer, by key id, in place of the plain key there. */
  magic?: Record<string, Binding>;
}

export function toLayout(design: Design, sample: Sample, opts: EmitOptions): Layout {
  const { config } = design;
  const base: Record<string, Binding> = {};
  const alpha2: Record<string, Binding> = { '*': { kind: 'trans' } };
  design.occupant.forEach((symbol, slotIdx) => {
    if (symbol < 0) return;
    const slot = design.slots[slotIdx];
    (slot.layer === 1 ? alpha2 : base)[slot.key.id] = kp(sample.symbols[symbol]);
  });
  base[config.space] = kp(' ');
  if (config.osl) base[config.osl] = { kind: 'sl', layer: 'alpha2' };
  if (config.rep) base[config.rep] = { kind: 'key_repeat' };
  if (config.shift) base[config.shift] = { kind: 'sk', mod: 'LSHIFT' };
  for (const [id, binding] of Object.entries(opts.magic ?? {})) base[id] = binding;

  const layout: Layout = {
    format: 'layerbench/layout@1',
    ...(opts.id ? { id: opts.id } : {}),
    name: opts.name,
    author: 'LayerBench generator',
    ...(opts.description ? { description: opts.description } : {}),
    languages: ['en'],
    hostLocale: 'symbols',
    geometry: { preset: PRESET },
    keys: config.shift
      ? { space: config.space, shift: { key: config.shift, kind: 'sk' } }
      : { space: config.space },
    layers: [{ id: 'base', name: 'Base', bindings: base }],
  };
  if (config.layers === 2) layout.layers.push({ id: 'alpha2', name: 'Alpha 2', bindings: alpha2 });
  if (config.rep) layout.repeatPolicy = { doubledLetters: 'repeatKey' };
  return layout;
}

/** The layout's layers drawn as rows of keys, the way the Import dialog accepts them. */
export function layoutText(layout: Layout, design: Design): string {
  return layout.layers
    .map(
      (layer) =>
        `${layer.name ?? layer.id}:\n${exportLayerText(design.board.geometry, layer.bindings)}`,
    )
    .join('\n');
}
