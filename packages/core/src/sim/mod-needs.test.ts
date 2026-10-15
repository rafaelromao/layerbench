import { describe, expect, it } from 'vitest';
import type { Binding, Mod } from '../layout/types.js';
import { heldChoices, intoMorph, NO_NEEDS, NO_PATH, throughMorph } from './mod-needs.js';

type ModMorph = Extract<Binding, { kind: 'mod_morph' }>;
const none: Binding = { kind: 'none' };
const morph = (mods: Mod[], keepMods?: Mod[]): ModMorph => ({
  kind: 'mod_morph',
  mods,
  ...(keepMods ? { keepMods } : {}),
  default: none,
  morphed: none,
});

describe('what a part of a key needs of the modifiers', () => {
  const outer = morph(['LSHIFT', 'LALT']);
  const inner = morph(['LSHIFT', 'LCTRL']);

  it("needs one of a morph's modifiers on its changed part, and none on its plain part", () => {
    expect(heldChoices(throughMorph(NO_NEEDS, outer, true))).toEqual([['LSHIFT', 'LALT']]);
    expect(heldChoices(throughMorph(NO_NEEDS, outer, false))).toEqual([]);
    const shifted = { choices: [['LSHIFT'] as Mod[]], forbid: [] };
    expect(heldChoices(throughMorph(shifted, morph(['LSHIFT', 'RSHIFT']), false))).toBeNull();
  });

  it('leaves out what an outer morph sets aside, unless it keeps it', () => {
    expect(heldChoices(throughMorph(throughMorph(NO_NEEDS, inner, true), outer, true))).toEqual([
      ['LCTRL'],
      ['LSHIFT', 'LALT'],
    ]);
    const keeping = morph(['LSHIFT', 'LALT'], ['LSHIFT']);
    expect(heldChoices(throughMorph(throughMorph(NO_NEEDS, inner, false), keeping, true))).toEqual([
      ['LALT'],
    ]);
  });

  it('reads the same from the outside in as from the inside out', () => {
    const morphs = [outer, inner, morph(['LALT'], ['LALT']), morph(['RSHIFT', 'LSHIFT'])];
    for (const a of morphs) {
      for (const b of morphs) {
        for (const changedA of [true, false]) {
          for (const changedB of [true, false]) {
            const inOut = throughMorph(throughMorph(NO_NEEDS, b, changedB), a, changedA);
            const outIn = intoMorph(intoMorph(NO_PATH, a, changedA), b, changedB);
            const sorted = (c: ReturnType<typeof heldChoices>) =>
              c?.map((x) => [...x].sort()).sort((x, y) => x.join().localeCompare(y.join()));
            expect(sorted(heldChoices(outIn))).toEqual(sorted(heldChoices(inOut)));
          }
        }
      }
    }
  });
});
