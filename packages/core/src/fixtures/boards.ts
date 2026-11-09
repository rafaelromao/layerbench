import { getGeometryPreset } from '../geometry/presets.js';
import type { Binding, Layout, Mod } from '../layout/types.js';
import { withDefaultLayers } from '../layouts/templates.js';

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
