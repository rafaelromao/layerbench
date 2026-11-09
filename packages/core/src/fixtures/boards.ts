import { getGeometryPreset } from '../geometry/presets.js';
import type { Binding, Layout, Mod } from '../layout/types.js';
import {
  accentsCombo,
  defaultLayers,
  vowelsOnLeft,
  withDefaultLayers,
} from '../layouts/templates.js';

/**
 * A usual set of home row mods, for the tests that type with them: Gui, Ctrl, Alt and Shift from
 * the left pinky in, mirrored on the right, both hands holding the left modifiers. Test-only, as the
 * rest of this folder: no layout written in code holds them but where its author's keymap does.
 */
export const HOME_ROW_MODS: Readonly<Record<string, Mod>> = {
  LHP: 'LGUI',
  LHR: 'LCTRL',
  LHM: 'LALT',
  LHI: 'LSHIFT',
  RHI: 'LSHIFT',
  RHM: 'LALT',
  RHR: 'LCTRL',
  RHP: 'LGUI',
};

/**
 * Eighteen keys, a letter on each finger key and space on the outer left thumb, with the default
 * layers: Numbers held on the inner left thumb and Symbols on the inner right one, and Extras, on a
 * board with no bottom row, while both are held. Test-only, as the rest of this folder.
 */
export function eighteenKeys(): Layout {
  const ids = ['LTR', 'LTM', 'LTI', 'RTI', 'RTM', 'RTR', 'LHP', 'LHR', 'LHM', 'LHI'];
  const letters = Object.fromEntries(
    [...ids, 'RHI', 'RHM', 'RHR', 'RHP'].map((id, i) => [
      id,
      { kind: 'kp', symbol: 'lgdhuoisrtneac'[i] } as Binding,
    ]),
  );
  return withDefaultLayers(
    {
      format: 'layerbench/layout@1',
      name: 'Eighteen keys',
      hostLocale: 'symbols',
      geometry: { preset: '1222+2' },
      keys: { space: 'L1' },
      layers: [{ id: 'base', bindings: { ...letters, L1: { kind: 'kp', symbol: ' ' } } }],
    },
    getGeometryPreset('1222+2'),
  );
}

/**
 * A layout given the default layers the way **New layout** gives them: the space key where the
 * defaults put it, Numbers and Symbols held on the thumbs, Accents on a combo. For the tests that
 * type digits, symbols and accents on a layout a user made from one of the bundled ones. Test-only,
 * as the rest of this folder.
 */
export function withNewLayoutDefaults(layout: Layout): Layout {
  const g = layout.geometry;
  if (!('preset' in g)) throw new Error(`${layout.name} is not on a preset board`);
  const geometry = getGeometryPreset(g.preset);
  const [first, ...rest] = layout.layers;
  const defaults = defaultLayers(geometry, { mirrorAccents: vowelsOnLeft(first.bindings) });
  const letters = Object.entries(first.bindings).filter(
    ([, b]) => !(b.kind === 'kp' && b.symbol === ' '),
  );
  return {
    ...layout,
    keys: { ...layout.keys, space: defaults.spaceKey },
    layers: [
      { ...first, bindings: { ...Object.fromEntries(letters), ...defaults.base } },
      ...rest,
      ...defaults.layers,
    ],
    combos: [...(layout.combos ?? []), accentsCombo(first.id, geometry)],
    ...(defaults.conditionalLayers.length > 0 && { conditionalLayers: defaults.conditionalLayers }),
  };
}
