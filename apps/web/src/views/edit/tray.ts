import { type CompiledLayout, producibleSymbols } from '@layerbench/core';

/** A character in the missing-keys tray, and how often the text has it when it is of the text. */
export interface TrayChar {
  char: string;
  count?: number;
}

/**
 * The missing-keys tray: what the layout cannot type, to be put on a key. The characters of the
 * text first, most frequent first as the report has them, then the letters a language needs, then
 * the characters an edit from the tray left with no key. Whatever the layout types now is left out,
 * so the tray follows each edit before the text is typed again.
 */
export function missingKeys({
  unproducible,
  required,
  strays,
  producible,
}: {
  unproducible: readonly (readonly [string, number])[];
  required: readonly string[];
  strays: readonly string[];
  producible: ReadonlySet<string>;
}): TrayChar[] {
  const out: TrayChar[] = [];
  const seen = new Set<string>();
  const add = (char: string, count?: number) => {
    if (seen.has(char) || producible.has(char)) return;
    seen.add(char);
    out.push(count === undefined ? { char } : { char, count });
  };
  for (const [char, count] of unproducible) add(char, count);
  for (const char of required) add(char);
  for (const char of strays) add(char);
  return out;
}

/**
 * The characters `before` typed that `after` no longer does: what a key gave up when another
 * character took its place. A capital goes with its small letter, which stands for both.
 */
export function displaced(before: CompiledLayout, after: CompiledLayout): string[] {
  const now = producibleSymbols(after);
  const lost = [...producibleSymbols(before)].filter((c) => !now.has(c));
  return lost.filter((c) => c === c.toLowerCase() || !lost.includes(c.toLowerCase()));
}
