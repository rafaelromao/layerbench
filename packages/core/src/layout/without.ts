import { inlineBehaviors } from './compile.js';
import type { Binding, Layout } from './types.js';

/** The special features a layout can be ranked without. */
export const FEATURE_KINDS = ['adaptive', 'repeat', 'combos', 'macros'] as const;
export type FeatureKind = (typeof FEATURE_KINDS)[number];

export const FEATURE_LABELS: Record<FeatureKind, string> = {
  adaptive: 'Adaptive keys',
  repeat: 'Repeat key',
  combos: 'Typing combos',
  macros: 'Multi-letter macros',
};

export function isFeatureKind(value: string): value is FeatureKind {
  return (FEATURE_KINDS as readonly string[]).includes(value);
}

const NONE: Binding = { kind: 'none' };

/** The text a macro types, as far as its own keys say: `qu`, `ão`, or one accented letter. */
function macroText(b: Extract<Binding, { kind: 'macro' }>): string {
  if (b.symbols !== undefined) return b.symbols;
  return (b.steps ?? [])
    .map((s) => (s.kind === 'kp' ? (s.symbol ?? '') : s.kind === 'unicode' ? s.symbol : ''))
    .join('');
}

/** Sentence case types a space, and only shifts what follows: it is not an adaptive key. */
function isSentenceCase(b: Extract<Binding, { kind: 'adaptive' }>): boolean {
  return b.default?.kind === 'kp' && b.default.symbol === ' ';
}

/**
 * The layout as it would be typed without some of its special features: the typist never presses
 * them, and types the text another way, or leaves out what has no other way.
 *
 * - `adaptive`: adaptive keys keep their default and lose every branch, so Magic Romak's is a plain
 *   `h` and alt repeat a plain repeat. Sentence case, which shifts but types only a space, stays.
 * - `repeat`: repeat keys, alt repeat's default included, type nothing, and doubled letters are
 *   tapped twice.
 * - `combos`: combos that type are gone; command combos were never typed with anyway.
 * - `macros`: macros that type two letters or more (`qu`, `ão`, `ões`) type nothing. A macro typing
 *   one letter is how the layout reaches that letter — an accent sent through the host, `ç` arming
 *   its extension layer — and stays.
 *
 * An empty list returns the layout itself.
 */
export function withoutFeatures(layout: Layout, off: readonly FeatureKind[]): Layout {
  if (off.length === 0) return layout;
  const drop = new Set(off);

  const walk = (b: Binding): Binding => {
    switch (b.kind) {
      case 'adaptive':
        if (drop.has('adaptive') && !isSentenceCase(b)) return walk(b.default ?? NONE);
        return {
          ...b,
          default: b.default ? walk(b.default) : undefined,
          triggers: b.triggers?.map((t) => ({ ...t, binding: walk(t.binding) })),
        };
      case 'key_repeat':
        return drop.has('repeat') ? NONE : b;
      case 'macro':
        if (drop.has('macros') && [...macroText(b).normalize('NFC')].length >= 2) return NONE;
        return { ...b, steps: b.steps?.map(walk), then: b.then?.map(walk) };
      case 'hold_tap':
        return { ...b, tap: walk(b.tap), hold: walk(b.hold) };
      case 'lt':
        return { ...b, tap: walk(b.tap) };
      case 'mod_morph':
        return { ...b, default: walk(b.default), morphed: walk(b.morphed) };
      case 'layer_morph':
        return { ...b, active: walk(b.active), inactive: walk(b.inactive) };
      case 'tap_dance':
        return { ...b, bindings: b.bindings.map(walk) };
      default:
        return b;
    }
  };

  const inlined = inlineBehaviors(layout);
  return {
    ...inlined,
    layers: inlined.layers.map((l) => ({
      ...l,
      bindings: Object.fromEntries(Object.entries(l.bindings).map(([k, b]) => [k, walk(b)])),
    })),
    combos: inlined.combos
      ?.filter((c) => !(drop.has('combos') && c.role === 'typing'))
      .map((c) => ({ ...c, binding: walk(c.binding) })),
    ...(drop.has('repeat')
      ? { repeatPolicy: { ...inlined.repeatPolicy, doubledLetters: 'tapTwice' as const } }
      : {}),
  };
}
