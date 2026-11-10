/** What Analyze's board adds to a key's name once the analysis lands: its share, and the heat's. */
const SHARE = /, (?:under 0\.01|[\d.]+)% of presses(?:, .*)?$/;

/** A key's accessible name as the board names it before the analysis lands. */
export const withoutShare = (name: string): string => name.replace(SHARE, '');

/**
 * A matcher for a key's accessible name that ignores its share of the presses: `Key LHM: d` is the
 * key with `, 12.34% of presses` after it, or without, as the name is before and after the analysis.
 * Given several names, it takes any of them.
 */
export const keyNamed =
  (...names: string[]) =>
  (accessible: string): boolean =>
    names.includes(withoutShare(accessible));
