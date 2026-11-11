import { describe, expect, it } from 'vitest';
import { eighteenKeys } from '../fixtures/boards.js';
import { compileLayout } from './compile.js';
import { homeRowLetters } from './home-row.js';
import type { Binding, Layout } from './types.js';

/**
 * The test board of `fixtures/boards.ts`, eighteen keys with no inner column, its home row `isrtneac`,
 * with some keys of its base layer given other bindings, and the base layer given another id. The
 * examples are built here, not read from a bundled layout: a change to one of those, which the
 * Library accepts from the app, would change what a test of this function says.
 */
function eighteenWith(
  bindings: Record<string, Binding>,
  baseId = 'base',
): { layout: Layout; compiled: ReturnType<typeof compileLayout> } {
  const fixture = eighteenKeys();
  const [base, ...rest] = fixture.layers;
  const layout: Layout = {
    ...fixture,
    layers: [{ ...base, id: baseId, bindings: { ...base.bindings, ...bindings } }, ...rest],
    // What names the layer `base` goes with its name: the Accents combo and the conditional layer.
    ...(baseId === 'base' ? {} : { combos: [], conditionalLayers: [] }),
  };
  return { layout, compiled: compileLayout(layout) };
}

const letters = (bindings: Record<string, Binding> = {}, baseId = 'base') =>
  homeRowLetters(eighteenWith(bindings, baseId).compiled);

describe('home-row letters', () => {
  it('reads the base layer’s home row left to right, letters only', () => {
    expect(letters()).toBe('isrtneac');
    // The keys swapped, the row reads as the board draws it.
    expect(letters({ LHP: { kind: 'kp', symbol: 's' }, LHR: { kind: 'kp', symbol: 'i' } })).toBe(
      'sirtneac',
    );
  });

  it('reads the base layer whatever its id, on a board of fewer home keys', () => {
    // Magic Romak's base layer is `alpha1`, on a board with no inner column: eight home keys.
    expect(letters({}, 'alpha1')).toBe('isrtneac');
  });

  it('counts an adaptive key by its default, and skips a space', () => {
    const adaptive: Binding = { kind: 'adaptive', default: { kind: 'kp', symbol: 'h' } };
    expect(letters({ LHR: adaptive, RHM: { kind: 'kp', symbol: ' ' } })).toBe('ihrtnac');
  });

  it('skips a key that types no letter: Repeat, an empty key, a full stop', () => {
    expect(
      letters({
        LHR: { kind: 'key_repeat' },
        LHM: { kind: 'none' },
        LHI: { kind: 'kp', symbol: '.' },
      }),
    ).toBe('ineac');
  });

  it('counts a home-row mod and a layer-tap by their taps, any letter lower-cased', () => {
    const { layout } = eighteenWith({});
    const other = layout.layers[1];
    const { compiled } = eighteenWith({
      LHP: {
        kind: 'hold_tap',
        tap: { kind: 'kp', symbol: 'a' },
        hold: { kind: 'mod', mod: 'LSHIFT' },
      },
      LHR: { kind: 'kp', symbol: 'S' },
      LHM: { kind: 'unicode', symbol: 'é' },
      RHI: { kind: 'lt', layer: other.id, tap: { kind: 'kp', symbol: 'j' } },
      RHM: { kind: 'mo', layer: other.id },
    });
    expect(homeRowLetters(compiled)).toBe('asétjac');
  });
});
