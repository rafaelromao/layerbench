import { buildGeometry } from './compile.js';
import type { Binding, Layout, Mod } from './types.js';

/** Whether a modifier is a Shift, and nothing else held with it. */
const isShift = (b: { mod: Mod; also?: Mod[] }) =>
  (b.mod === 'LSHIFT' || b.mod === 'RSHIFT') && !b.also?.length;

/** What a tap of a binding does: through a tap-hold, a layer tap and the plain part of a morph. */
function tapPart(b: Binding | undefined): Binding | undefined {
  if (b === undefined) return undefined;
  switch (b.kind) {
    case 'hold_tap':
    case 'lt':
      return tapPart(b.tap);
    case 'mod_morph':
      return tapPart(b.default);
    default:
      return b;
  }
}

const typesSpace = (b: Binding | undefined) => {
  const tap = tapPart(b);
  return tap?.kind === 'sentence_space' || (tap?.kind === 'kp' && tap.symbol === ' ');
};

/**
 * How a key's binding shifts, if it does: a Shift tapped for the next key (`sk`), or held. A key
 * that holds Shift in a tap-hold counts only on a thumb, since on the home row it is one of its
 * modifiers, and a Shift held with another modifier is not the shift key.
 */
function shiftKindOf(b: Binding | undefined, thumb: boolean): 'sk' | 'hold' | null {
  const tap = tapPart(b);
  if (tap?.kind === 'sk' && isShift(tap)) return 'sk';
  if (tap?.kind === 'mod' && isShift(tap)) return 'hold';
  if (thumb && b?.kind === 'hold_tap' && b.hold.kind === 'mod' && isShift(b.hold)) return 'hold';
  return null;
}

/**
 * The layout with its space and shift keys following its keys. They are not set by hand: the space
 * key is a key that types a space on the base layer, preferably a thumb, and the shift key one that
 * taps or holds Shift there.
 *
 * A key declared stays while it still does that, so a layout keeps the keys it was made with, and
 * the numbers they give; once its binding is changed away, the keys that do take its place. Where
 * none does, it stays as it is, as the analysis falls back to another key to press. The layout
 * itself when nothing changes.
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
    shift = found.find((f) => f.kind === 'sk') ?? found[0] ?? shift;
  }

  if (space === layout.keys.space && shift === was) return layout;
  return { ...layout, keys: { space, ...(shift ? { shift } : {}) } };
}
