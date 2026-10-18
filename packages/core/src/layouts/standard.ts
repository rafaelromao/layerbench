import type { Geometry } from '../geometry/types.js';
import type { Binding, Layout } from '../layout/types.js';
import { DEFAULT_LAYER_ID_LIST, DEFAULT_LAYER_IDS, defaultLayers } from './templates.js';

/**
 * The thumbs and base layer every bundled Standard and Thumb Alpha layout shares, so they compare
 * directly: the same holds on the same main thumbs, the same symbols on the base layer, and Repeat
 * and Accents on a thumb tap.
 *
 * The main thumbs are the two innermost of each hand. Left to right they hold Shift, Numbers,
 * Symbols and Shift, and tap whatever the layout's own thumbs left them:
 * - where LayerBench placed the thumbs, the author having left them to a space bar, L1 taps Repeat,
 *   L0 space, R0 the first thumb letter or nothing, and R1 one-shots Accents; a second thumb letter
 *   takes L1, and Repeat goes on a base-layer key the layout gives it;
 * - where the author placed them, space and letters stay, and the main thumbs left take Accents,
 *   then Repeat, right to left.
 *
 * Every other thumb key goes, unless it types a letter. The base layer keeps its letters, `'` `,`
 * `.` `;` and Repeat; every other key there types nothing, its symbol being on Symbols or Extras.
 * Accents needs no combo: R1 reaches it.
 */

/** Who put the layout's thumb keys where they are. */
export type ThumbPlacement = 'author' | 'layerbench';

/** The main thumbs, left to right. */
export const MAIN_THUMBS = ['L1', 'L0', 'R0', 'R1'] as const;

/** The symbols a base layer keeps besides its letters. */
export const BASE_SYMBOLS: readonly string[] = ["'", ',', '.', ';'];

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });
const REPEAT: Binding = { kind: 'key_repeat' };
const ACCENTS: Binding = { kind: 'sl', layer: DEFAULT_LAYER_IDS.accents };
const SPACE = kp(' ');

/** What each main thumb holds. */
const HOLDS: Record<(typeof MAIN_THUMBS)[number], Binding> = {
  L1: { kind: 'mod', mod: 'LSHIFT' },
  L0: { kind: 'mo', layer: DEFAULT_LAYER_IDS.numbers },
  R0: { kind: 'mo', layer: DEFAULT_LAYER_IDS.symbols },
  R1: { kind: 'mod', mod: 'RSHIFT' },
};

const isLetter = (b: Binding | undefined) =>
  b?.kind === 'kp' && b.symbol !== undefined && /^[a-z]$/.test(b.symbol);
const isSpace = (b: Binding | undefined) => b?.kind === 'kp' && b.symbol === ' ';
const keeps = (b: Binding) =>
  isLetter(b) ||
  b.kind === 'key_repeat' ||
  (b.kind === 'kp' && b.symbol !== undefined && BASE_SYMBOLS.includes(b.symbol));

/** The taps of the main thumbs, from what the layout's thumbs type now. */
function mainTaps(
  layout: Layout,
  thumbs: string[],
  at: (id: string) => Binding | undefined,
  placed: ThumbPlacement,
): Partial<Record<(typeof MAIN_THUMBS)[number], Binding>> {
  const main = new Set<string>(MAIN_THUMBS);
  if (placed === 'layerbench') {
    const letters = thumbs.filter((id) => isLetter(at(id))).map((id) => at(id) as Binding);
    if (letters.length > 2) throw new Error(`${layout.name}: more thumb letters than main thumbs`);
    const repeatElsewhere = Object.entries(layout.layers[0].bindings).some(
      ([id, b]) => !thumbs.includes(id) && b.kind === 'key_repeat',
    );
    if (letters[1] && !repeatElsewhere)
      throw new Error(`${layout.name}: a second thumb letter takes L1; give Repeat a base key`);
    return { L1: letters[1] ?? REPEAT, L0: SPACE, R0: letters[0], R1: ACCENTS };
  }
  for (const id of thumbs)
    if (!main.has(id) && isSpace(at(id)))
      throw new Error(`${layout.name}: space is on ${id}, not a main thumb`);
  const taps: Partial<Record<(typeof MAIN_THUMBS)[number], Binding>> = {};
  const left: (typeof MAIN_THUMBS)[number][] = [];
  for (const id of [...MAIN_THUMBS].reverse()) {
    const b = at(id);
    if (isSpace(b) || isLetter(b)) taps[id] = b;
    else left.push(id);
  }
  [ACCENTS, REPEAT].forEach((b, i) => {
    if (left[i]) taps[left[i]] = b;
  });
  return taps;
}

/**
 * A Standard or Thumb Alpha layout with the default layers, the standard thumbs and the standard
 * base-layer symbols. `placed` says whose its thumb keys are.
 */
export function withStandardThumbs(
  layout: Layout,
  geometry: Geometry,
  placed: ThumbPlacement,
): Layout {
  const have = new Set(geometry.keys.map((k) => k.id));
  if (MAIN_THUMBS.some((id) => !have.has(id)))
    throw new Error(`${layout.name}: the board has no ${MAIN_THUMBS.join(', ')} thumbs`);
  if (layout.layers.some((l) => DEFAULT_LAYER_ID_LIST.includes(l.id)))
    throw new Error(`${layout.name}: already has a default layer`);

  const [first, ...rest] = layout.layers;
  const at = (id: string): Binding | undefined => first.bindings[id];
  // Left to right: the left hand outer to inner, then the right inner to outer.
  const across = (k: Geometry['keys'][number]) => (k.hand === 'L' ? -1 - k.col : k.col);
  const thumbs = geometry.keys
    .filter((k) => k.thumb)
    .sort((a, b) => across(a) - across(b))
    .map((k) => k.id);
  const taps = mainTaps(layout, thumbs, at, placed);

  const bindings: Record<string, Binding> = {};
  for (const [id, b] of Object.entries(first.bindings)) {
    if (!thumbs.includes(id)) bindings[id] = keeps(b) ? b : { kind: 'none' };
    // A thumb past the main four stays only to type its letter.
    else if (!(MAIN_THUMBS as readonly string[]).includes(id) && isLetter(b)) bindings[id] = b;
  }
  for (const id of MAIN_THUMBS) {
    const tap = taps[id];
    bindings[id] = tap ? { kind: 'hold_tap', tap, hold: HOLDS[id] } : HOLDS[id];
  }

  const space = MAIN_THUMBS.find((id) => isSpace(taps[id]));
  if (!space) throw new Error(`${layout.name}: no main thumb types space`);
  // The default layers put space on Symbols' L0, the space thumb being held: where L0 types
  // something else, it types that there too.
  const defaults = defaultLayers(geometry);
  const layers = defaults.layers.map((l) => {
    if (l.id !== DEFAULT_LAYER_IDS.symbols || space === defaults.spaceKey) return l;
    const { [defaults.spaceKey]: _space, ...kept } = l.bindings;
    return { ...l, bindings: kept };
  });

  return {
    ...layout,
    keys: { ...layout.keys, space },
    layers: [{ ...first, bindings }, ...rest, ...layers],
    ...(defaults.conditionalLayers.length > 0 && {
      conditionalLayers: [...(layout.conditionalLayers ?? []), ...defaults.conditionalLayers],
    }),
  };
}
