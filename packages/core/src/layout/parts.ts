import { type Binding, type Mod, modsMet } from './types.js';

/** The bindings that choose one of their parts rather than act themselves. */
export type Chooser = 'hold_tap' | 'lt' | 'mod_morph' | 'layer_morph' | 'tap_dance' | 'adaptive';

/** How a key is pressed, and what is on while it is: what its choosers go by. */
export interface Choosing {
  /** A tap-hold's tap or hold; a layer-tap held is a key that holds its layer. Default: tap. */
  press?: 'tap' | 'hold';
  /** The modifiers held, for mod morphs. None when absent. */
  mods?: ReadonlySet<Mod>;
  /** Whether a layer is on, for layer morphs. None when absent. */
  layerOn?: (layer: string) => boolean;
  /** Choosers to stop at rather than go past: the ones the caller has to see. */
  stopAt?: ReadonlySet<Chooser>;
}

const PLAIN: Choosing = {};
const TAP_HOLDS: ReadonlySet<Chooser> = new Set(['hold_tap', 'lt']);
/** As deep as the machine runs a binding. */
const MAX_DEPTH = 24;

/**
 * The part a key amounts to, past the bindings that choose one: a tap-hold's tap or hold, the part
 * a morph picks, a tap dance's first tap, an adaptive key's default. Without `how` it is the key's
 * Plain part, the one it amounts to when nothing chooses another: tapped, nothing held, no layer on.
 * A chooser with nothing to choose, an adaptive key without a default or an empty tap dance, is
 * its own part. It never throws.
 */
export function partOf(b: Binding, how: Choosing = PLAIN): Binding {
  let part = b;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    if (how.stopAt?.has(part.kind as Chooser)) return part;
    const next = chosen(part, how);
    if (next === null) return part;
    part = next;
  }
  return part;
}

/**
 * What holding the key does where that is not what tapping it does: the hold of the tap-hold its
 * Plain part goes through, or the layer a layer-tap holds. Null for a key that does the same held.
 */
export function heldPart(b: Binding): Binding | null {
  const p = partOf(b, { stopAt: TAP_HOLDS });
  if (p.kind === 'hold_tap') return p.hold;
  if (p.kind === 'lt') return { kind: 'mo', layer: p.layer };
  return null;
}

function chosen(b: Binding, how: Choosing): Binding | null {
  switch (b.kind) {
    case 'hold_tap':
      return how.press === 'hold' ? b.hold : b.tap;
    case 'lt':
      return how.press === 'hold' ? { kind: 'mo', layer: b.layer } : b.tap;
    case 'mod_morph':
      return how.mods && modsMet(b.mods, how.mods) ? b.morphed : b.default;
    case 'layer_morph': {
      const on = how.layerOn;
      const active =
        on !== undefined &&
        (b.match === 'all' ? b.layers.every((l) => on(l)) : b.layers.some((l) => on(l)));
      return active ? b.active : b.inactive;
    }
    case 'tap_dance':
      return b.bindings[0] ?? null;
    case 'adaptive':
      return b.default ?? null;
    default:
      return null;
  }
}
