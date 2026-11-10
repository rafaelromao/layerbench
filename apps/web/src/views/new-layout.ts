import type { Layout } from '@layerbench/core';
import {
  DEFAULT_LANGUAGES,
  getGeometryPreset,
  importTextLayout,
  withNewLayoutDefaults,
} from '@layerbench/core';

/** Qwerty, as the starting point for a layout you intend to change rather than design. */
const QWERTY_ROWS = 'q w e r t y u i o p\na s d f g h j k l ;\nz x c v b n m , . /';

export interface NewLayoutSpec {
  name: string;
  geometry: string;
  /** `empty` leaves every key unbound; `qwerty` fills the base layer so there is something to move. */
  start: 'empty' | 'qwerty';
  /** Add the default Accents, Numbers, Symbols and Extras layers, and the keys that reach them. */
  defaultLayers: boolean;
}

/**
 * A brand-new layout, valid enough to compile and open in the editor.
 *
 * An empty base layer is a legitimate starting point — the editor draws the board and every key is
 * yours to fill — but it needs a space key, or nothing can be typed at all and the analysis has
 * nothing to say. It starts as a layout for English, as an import does.
 */
export function newLayout(spec: NewLayoutSpec): Layout {
  const geometry = getGeometryPreset(spec.geometry);
  const base =
    spec.start === 'qwerty'
      ? importTextLayout(`${QWERTY_ROWS}\nspace`, spec.geometry, spec.name).layout
      : emptyLayout(spec.name, spec.geometry, geometry.textThumbs[0] ?? geometry.keys[0].id);

  return spec.defaultLayers ? withNewLayoutDefaults(base, geometry) : base;
}

function emptyLayout(name: string, preset: string, spaceKey: string): Layout {
  return {
    format: 'layerbench/layout@1',
    name,
    hostLocale: 'symbols',
    geometry: { preset },
    keys: { space: spaceKey },
    layers: [{ id: 'base', name: 'Base', bindings: { [spaceKey]: { kind: 'kp', symbol: ' ' } } }],
    // A new layout is for English until its maker says otherwise.
    languages: [...DEFAULT_LANGUAGES],
  };
}
