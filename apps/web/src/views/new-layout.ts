import type { Layout } from '@layerbench/core';
import {
  deadKeysCombo,
  defaultLayers,
  getGeometryPreset,
  importTextLayout,
} from '@layerbench/core';

/** Qwerty, as the starting point for a layout you intend to change rather than design. */
const QWERTY_ROWS = 'q w e r t y u i o p\na s d f g h j k l ;\nz x c v b n m , . /';

export interface NewLayoutSpec {
  name: string;
  geometry: string;
  /** `empty` leaves every key unbound; `qwerty` fills the base layer so there is something to move. */
  start: 'empty' | 'qwerty';
  /** Add the default Numbers, Symbols and Dead keys layers, and the keys that reach them. */
  defaultLayers: boolean;
}

/**
 * A brand-new layout, valid enough to compile and open in the editor.
 *
 * An empty base layer is a legitimate starting point — the editor draws the board and every key is
 * yours to fill — but it needs a space key, or nothing can be typed at all and the analysis has
 * nothing to say.
 */
export function newLayout(spec: NewLayoutSpec): Layout {
  const geometry = getGeometryPreset(spec.geometry);
  const base =
    spec.start === 'qwerty'
      ? importTextLayout(`${QWERTY_ROWS}\nspace`, spec.geometry, spec.name).layout
      : emptyLayout(spec.name, spec.geometry, geometry.textThumbs[0] ?? geometry.keys[0].id);

  if (!spec.defaultLayers) return base;
  // The defaults choose the space key, on the thumb that also holds Numbers; any other space goes.
  const defaults = defaultLayers(geometry);
  const [first, ...rest] = base.layers;
  const letters = Object.entries(first.bindings).filter(
    ([, b]) => !(b.kind === 'kp' && b.symbol === ' '),
  );
  return {
    ...base,
    keys: { ...base.keys, space: defaults.spaceKey },
    layers: [
      { ...first, bindings: { ...Object.fromEntries(letters), ...defaults.base } },
      ...rest,
      ...defaults.layers,
    ],
    combos: [...(base.combos ?? []), deadKeysCombo(first.id)],
  };
}

function emptyLayout(name: string, preset: string, spaceKey: string): Layout {
  return {
    format: 'layerbench/layout@1',
    name,
    hostLocale: 'symbols',
    geometry: { preset },
    keys: { space: spaceKey },
    layers: [{ id: 'base', name: 'Base', bindings: { [spaceKey]: { kind: 'kp', symbol: ' ' } } }],
  };
}
