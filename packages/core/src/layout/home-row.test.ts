import { describe, expect, it } from 'vitest';
import { getGeometryPreset } from '../geometry/presets.js';
import { bundledLayout, withNewLayoutDefaults } from '../layouts/index.js';
import { compileLayout } from './compile.js';
import { homeRowLetters } from './home-row.js';
import type { Binding, Layout } from './types.js';

/**
 * Qwerty, with some keys of its base layer given other bindings. The examples are built here, not
 * read from other bundled layouts: a change to one of those, which the Library accepts from the
 * app, would change what a test of this function says.
 */
function qwertyWith(
  bindings: Record<string, Binding>,
  baseId = 'base',
): ReturnType<typeof compileLayout> {
  const qwerty = bundledLayout('qwerty') as Layout;
  const [base, ...rest] = qwerty.layers;
  return compileLayout({
    ...qwerty,
    layers: [{ ...base, id: baseId, bindings: { ...base.bindings, ...bindings } }, ...rest],
  });
}

describe('home-row letters', () => {
  it('reads the base layer’s home row left to right, letters only', () => {
    expect(homeRowLetters(qwertyWith({}))).toBe('asdfghjkl');
    // The keys swapped, the row reads as the board draws it.
    expect(
      homeRowLetters(
        qwertyWith({ LHP: { kind: 'kp', symbol: 's' }, LHR: { kind: 'kp', symbol: 'a' } }),
      ),
    ).toBe('sadfghjkl');
  });

  it('reads the base layer whatever its id, on a board of fewer home keys', () => {
    // Magic Romak's base layer is `alpha1`, on a board with no inner column.
    expect(homeRowLetters(qwertyWith({}, 'alpha1'))).toBe('asdfghjkl');
  });

  it('counts an adaptive key by its default, and skips a space', () => {
    const adaptive: Binding = { kind: 'adaptive', default: { kind: 'kp', symbol: 'h' } };
    expect(homeRowLetters(qwertyWith({ LHR: adaptive, RHM: { kind: 'kp', symbol: ' ' } }))).toBe(
      'ahdfghjl',
    );
  });

  it('skips a key that types no letter: Repeat, an empty key, a full stop', () => {
    expect(
      homeRowLetters(
        qwertyWith({
          LHR: { kind: 'key_repeat' },
          LHM: { kind: 'none' },
          LHI: { kind: 'kp', symbol: '.' },
        }),
      ),
    ).toBe('aghjkl');
  });

  it('counts a home-row mod and a layer-tap by their taps, any letter lower-cased', () => {
    const qwerty = withNewLayoutDefaults(
      bundledLayout('qwerty') as Layout,
      getGeometryPreset('3x5+2'),
    );
    const [base, other] = qwerty.layers;
    const layout: Layout = {
      ...qwerty,
      layers: [
        {
          ...base,
          bindings: {
            ...base.bindings,
            LHP: {
              kind: 'hold_tap',
              tap: { kind: 'kp', symbol: 'a' },
              hold: { kind: 'mod', mod: 'LSHIFT' },
            },
            LHR: { kind: 'kp', symbol: 'S' },
            LHM: { kind: 'unicode', symbol: 'é' },
            RHI: { kind: 'lt', layer: other.id, tap: { kind: 'kp', symbol: 'j' } },
            RHM: { kind: 'mo', layer: other.id },
          },
        },
        ...qwerty.layers.slice(1),
      ],
    };
    expect(homeRowLetters(compileLayout(layout))).toBe('aséfghjl');
  });
});
