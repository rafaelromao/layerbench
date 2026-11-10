import { buildGeometry } from './compile.js';
import { heldPart, partOf } from './parts.js';
import { SHIFT_WAYS } from './rules.js';
import type { Binding, Layout, Mod, ShiftWay } from './types.js';

/** Whether a modifier is a Shift, and nothing else held with it. */
const isShift = (b: { mod: Mod; also?: Mod[] }) =>
  (b.mod === 'LSHIFT' || b.mod === 'RSHIFT') && !b.also?.length;

/** Whether tapping a binding types a space: a space, or a sentence space, past whatever chooses. */
const typesSpace = (b: Binding | undefined) => {
  const part = b && partOf(b);
  return part?.kind === 'sentence_space' || (part?.kind === 'kp' && part.symbol === ' ');
};

/**
 * How a key's binding shifts, if it does: a Shift tapped for the next key (`sk`), or held. A key
 * that holds Shift in a tap-hold counts only on a thumb, since on the home row it is one of its
 * modifiers, and a Shift held with another modifier is not the shift key.
 */
function shiftKindOf(b: Binding | undefined, thumb: boolean): 'sk' | 'hold' | null {
  if (b === undefined) return null;
  const tap = partOf(b);
  if (tap.kind === 'sk' && isShift(tap)) return 'sk';
  if (tap.kind === 'mod' && isShift(tap)) return 'hold';
  const held = thumb ? heldPart(b) : null;
  if (held?.kind === 'mod' && isShift(held)) return 'hold';
  return null;
}

/**
 * The ways some key or combo of the layout gives Shift, on any layer: a sticky Shift tapped, or one
 * held, a thumb's or a home row mod's. What a rule for how a capital is typed can choose between.
 */
export function shiftWaysOffered(layout: Pick<Layout, 'layers' | 'combos'>): ShiftWay[] {
  const offered = new Set<ShiftWay>();
  for (const layer of layout.layers) {
    for (const b of Object.values(layer.bindings)) {
      const tap = partOf(b);
      if (tap.kind === 'sk' && isShift(tap)) offered.add('sk');
      if (tap.kind === 'mod' && isShift(tap)) offered.add('hold');
      const held = heldPart(b);
      if (held?.kind === 'mod' && isShift(held)) offered.add('hold');
    }
  }
  // The analysis taps a combo that gives a sticky Shift, a held chord being let go in the same action.
  for (const combo of layout.combos ?? []) {
    const tap = partOf(combo.binding);
    if (tap.kind === 'sk' && isShift(tap)) offered.add('sk');
  }
  return SHIFT_WAYS.filter((w) => offered.has(w));
}

/**
 * How many presses give Shift, on any layer, as `shiftWaysOffered` finds them: a key's tap, its
 * hold, a combo. With two or more, which one a capital is typed with is a choice of the word.
 */
export function shiftKeysOffered(layout: Pick<Layout, 'layers' | 'combos'>): number {
  let n = 0;
  for (const layer of layout.layers) {
    for (const b of Object.values(layer.bindings)) {
      const tap = partOf(b);
      if ((tap.kind === 'sk' || tap.kind === 'mod') && isShift(tap)) n++;
      const held = heldPart(b);
      if (held?.kind === 'mod' && isShift(held)) n++;
    }
  }
  for (const combo of layout.combos ?? []) {
    const tap = partOf(combo.binding);
    if (tap.kind === 'sk' && isShift(tap)) n++;
  }
  return n;
}

/**
 * The layout with its space and shift keys following its keys. They are not set by hand: the space
 * key is a key that types a space on the base layer, preferably a thumb, and the shift key one that
 * taps or holds Shift there.
 *
 * A key declared stays while it still does that, so a layout keeps the keys it was made with, and
 * the numbers they give; once its binding is changed away, the key that does takes its place. With
 * none to take it, the shift key is gone, and the space key, which a layout has to have, stays as
 * it is, as the analysis presses something. The layout itself when nothing changes.
 */
export function withDerivedKeys(layout: Layout): Layout {
  const keys = buildGeometry(layout).keys;
  const base = layout.layers[0];
  const at = (id: string) => base?.bindings[id] ?? base?.bindings['*'];

  let space = layout.keys.space;
  if (!typesSpace(at(space))) {
    const found = keys.filter((k) => typesSpace(at(k.id)));
    space = (found.find((k) => k.thumb) ?? found[0])?.id ?? space;
  }

  const was = layout.keys.shift;
  let shift = was;
  const declared = was && keys.find((k) => k.id === was.key);
  if (!declared || shiftKindOf(at(declared.id), declared.thumb) === null) {
    const found = keys.flatMap((k) => {
      const kind = shiftKindOf(at(k.id), k.thumb);
      return kind ? [{ key: k.id, kind }] : [];
    });
    // A Shift tapped for the next key before one held, as the importer reads a keymap.
    shift = found.find((f) => f.kind === 'sk') ?? found[0];
  }

  if (space === layout.keys.space && shift === was) return layout;
  return { ...layout, keys: { space, ...(shift ? { shift } : {}) } };
}
