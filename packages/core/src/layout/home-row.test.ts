import { describe, expect, it } from 'vitest';
import { bundledLayout } from '../layouts/index.js';
import { compileLayout } from './compile.js';
import { homeRowLetters } from './home-row.js';
import type { Layout } from './types.js';

const letters = (id: string) => homeRowLetters(compileLayout(bundledLayout(id)!));

describe('home-row letters', () => {
  it('reads the base layer’s home row left to right, letters only', () => {
    expect(letters('qwerty')).toBe('asdfghjkl');
    expect(letters('sturdy')).toBe('strdynaei');
  });

  it('reads the base layer whatever its id, on a board of fewer home keys', () => {
    // Magic Romak's base layer is `alpha1`, on a board with no inner column: eight home keys.
    expect(letters('magic-romak')).toBe('dnstraei');
  });

  it('counts an adaptive key by its default, and skips a space', () => {
    // Uno's LHR and LHM are adaptive keys typing h and o by default; its RHM is a space.
    expect(letters('uno')).toBe('fhoeudtsc');
  });

  it('skips a key that types no letter: Repeat, an empty key, a full stop', () => {
    expect(letters('t-34')).toBe('rsthkmnai');
    expect(letters('enthium')).toBe('bciaekhtnsw');
    expect(letters('nordrassil')).toBe('hieamdrspv');
  });

  it('counts a home-row mod and a layer-tap by their taps, any letter lower-cased', () => {
    const qwerty = bundledLayout('qwerty') as Layout;
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
