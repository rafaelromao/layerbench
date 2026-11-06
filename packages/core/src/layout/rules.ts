import type { DoubledWay, Layout, RuleWay, ShiftWay, TypingRules } from './types.js';

/** Every way of each rule, in the order a layout that says nothing tries them. */
export const SHIFT_WAYS: readonly ShiftWay[] = ['sk', 'hold'];
export const DOUBLED_WAYS: readonly DoubledWay[] = ['repeatKey', 'tapTwice'];

export type RuleName = keyof TypingRules;

/**
 * A declared list made whole: each way once, at its first mention, with what it says, and a way it
 * does not mention after the rest, on. Undefined for a rule not declared, an empty list included.
 */
export function wholeRule<W extends string>(
  declared: readonly RuleWay<W>[] | undefined,
  all: readonly W[],
): RuleWay<W>[] | undefined {
  if (!declared?.length) return undefined;
  const out: RuleWay<W>[] = [];
  for (const e of declared) {
    if (!out.some((o) => o.way === e.way)) out.push({ way: e.way, enabled: e.enabled ?? true });
  }
  for (const way of all) if (!out.some((o) => o.way === way)) out.push({ way, enabled: true });
  return out;
}

/**
 * The rules as a layout that has not declared them reads: shift the way `keys.shift.kind` says first
 * and the other after it, doubled letters the repeat key and tapping twice, or, for a layout whose
 * `repeatPolicy` is tap twice, tapping twice alone. Both on, and tried as the layout always was.
 */
export function defaultRules(layout: Pick<Layout, 'keys' | 'repeatPolicy'>): Required<TypingRules> {
  const hold = layout.keys.shift?.kind === 'hold';
  return {
    shift: (hold ? ['hold', 'sk'] : ['sk', 'hold']).map((way) => ({
      way,
      enabled: true,
    })) as RuleWay<ShiftWay>[],
    doubledLetters:
      layout.repeatPolicy?.doubledLetters === 'tapTwice'
        ? [
            { way: 'tapTwice', enabled: true },
            { way: 'repeatKey', enabled: false },
          ]
        : [
            { way: 'repeatKey', enabled: true },
            { way: 'tapTwice', enabled: true },
          ],
  };
}

/** The rules of a layout, declared or read from what it always had: what the editor shows. */
export function rulesOf(
  layout: Pick<Layout, 'keys' | 'repeatPolicy' | 'typingRules'>,
): Required<TypingRules> {
  const read = defaultRules(layout);
  return {
    shift: wholeRule(layout.typingRules?.shift, SHIFT_WAYS) ?? read.shift,
    doubledLetters:
      wholeRule(layout.typingRules?.doubledLetters, DOUBLED_WAYS) ?? read.doubledLetters,
  };
}

/**
 * The ways of a rule the layout declared, those on in the order they are tried; null for a rule it
 * left to what it always had, which is typed as before, and an empty list for one with every way off.
 */
export function declaredWays<W extends string>(
  declared: readonly RuleWay<W>[] | undefined,
  all: readonly W[],
): W[] | null {
  return (
    wholeRule(declared, all)
      ?.filter((e) => e.enabled !== false)
      .map((e) => e.way) ?? null
  );
}
