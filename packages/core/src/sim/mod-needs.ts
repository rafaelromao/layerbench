import type { Binding, Mod, ModChoice } from '../layout/types.js';

type ModMorph = Extract<Binding, { kind: 'mod_morph' }>;

/**
 * What a part of a key needs of the modifiers for its mod morphs to choose it: one modifier of each
 * choice held, and none of `forbid`. A morph sees the modifiers held but those the morphs it runs
 * inside set aside: on its changed part it needs one of the ones it sees, on its plain part none.
 */
export interface ModNeeds {
  choices: readonly ModChoice[];
  forbid: readonly Mod[];
}

export const NO_NEEDS: ModNeeds = { choices: [], forbid: [] };

/** The modifiers a morph sets aside while it runs its changed part. */
function asideOf(b: ModMorph): Mod[] {
  return b.mods.filter((m) => !b.keepMods?.includes(m));
}

/**
 * The needs of a morph's part, from the needs of what the morph runs there: read from the inside
 * out, as a binding's outputs are.
 */
export function throughMorph(inner: ModNeeds, b: ModMorph, changed: boolean): ModNeeds {
  if (!changed) return { choices: inner.choices, forbid: [...inner.forbid, ...b.mods] };
  // What the morph sets aside, what it runs neither sees held nor minds.
  const aside = asideOf(b);
  return {
    choices: [...inner.choices.map((c) => c.filter((m) => !aside.includes(m))), b.mods],
    forbid: inner.forbid.filter((m) => !aside.includes(m)),
  };
}

/** The needs on the way into a key, with the modifiers set aside so far: read from the outside in. */
export interface MorphPath extends ModNeeds {
  aside: readonly Mod[];
}

export const NO_PATH: MorphPath = { choices: [], forbid: [], aside: [] };

/** The path into one of a morph's parts. */
export function intoMorph(path: MorphPath, b: ModMorph, changed: boolean): MorphPath {
  const seen = b.mods.filter((m) => !path.aside.includes(m));
  if (!changed) return { ...path, forbid: [...path.forbid, ...seen] };
  return {
    choices: [...path.choices, seen],
    forbid: path.forbid,
    aside: [...path.aside, ...asideOf(b)],
  };
}

/**
 * The choices to hold for the needs, each without the modifiers that must not be held. Null when a
 * choice is left with none: no modifiers held choose that part.
 */
export function heldChoices(needs: ModNeeds): ModChoice[] | null {
  const held: ModChoice[] = [];
  for (const choice of needs.choices) {
    const left = choice.filter((m) => !needs.forbid.includes(m));
    if (left.length === 0) return null;
    held.push(left);
  }
  return held;
}
