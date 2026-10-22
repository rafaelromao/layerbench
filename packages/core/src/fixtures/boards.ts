import { getGeometryPreset } from '../geometry/presets.js';
import type { Binding, Layout } from '../layout/types.js';
import { withDefaultLayers } from '../layouts/templates.js';

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
