/**
 * What a pattern cannot know about a name: a capitalised word that a text never writes in lower
 * case, and that comes in only a few of its lines, is a name, a person's or a place's or a product
 * no one else mentions. `Macron` is, `Model` is not (`model` is written everywhere), and nor is
 * `Claude`, which comes in hundreds of lines. A name can also be made of ordinary words, `Bill
 * Gates`, so two capitalised words that come together in only a few lines are left out as well.
 * A line with either is left out, so what stays is the words a text uses and the names it uses
 * again and again.
 */

const TITLE_CASE = /\b[A-Z][a-z]{2,}\b/g;
const LOWER_CASE = /\b[a-z]{3,}\b/g;
/** Every pair of capitalised words side by side, overlapping ones too: `A B C` has `A B` and `B C`. */
const TITLE_PAIR = /(?=\b([A-Z][a-z]{2,} [A-Z][a-z]{2,})\b)/g;
/** Not words but addresses and code: what a link or a backtick holds is not read as a name. */
const NOT_PROSE = /https?:\/\/\S+|`[^`]*`/g;
/** Four words in a row, as prose in a string comes: a line of code has symbols between its words. */
const PROSE_RUN = /(?:^|[\s"'`(])(?:[A-Za-z][a-z']*[,.;:]?\s+){3}[A-Za-z][a-z']*/;

/** Whether a line has a run of prose in it. */
export function hasProse(line: string): boolean {
  return PROSE_RUN.test(line);
}

const words = (line: string, pattern: RegExp): string[] =>
  line.replace(NOT_PROSE, ' ').match(pattern) ?? [];

const pairs = (line: string): string[] =>
  [...line.replace(NOT_PROSE, ' ').matchAll(TITLE_PAIR)].map((m) => m[1]);

/**
 * A judge of the lines of one text: given those lines and the lower case words of a dictionary, it
 * says of a line whether it has a name in it. A name is rare when fewer than `minLines` of the
 * lines have it.
 */
export function nameFilter(
  lines: Iterable<string>,
  dictionary: Iterable<string>,
  minLines = 5,
): (line: string) => boolean {
  const lower = new Set(dictionary);
  const inLines = new Map<string, number>();
  const pairLines = new Map<string, number>();
  for (const line of lines) {
    for (const word of words(line, LOWER_CASE)) lower.add(word);
    for (const word of new Set(words(line, TITLE_CASE))) {
      inLines.set(word, (inLines.get(word) ?? 0) + 1);
    }
    for (const pair of new Set(pairs(line))) pairLines.set(pair, (pairLines.get(pair) ?? 0) + 1);
  }
  const rare = new Set<string>();
  for (const [word, count] of inLines) {
    if (count < minLines && !lower.has(word.toLowerCase())) rare.add(word);
  }
  const rarePairs = new Set<string>();
  for (const [pair, count] of pairLines) if (count < minLines) rarePairs.add(pair);
  return (line) =>
    words(line, TITLE_CASE).some((word) => rare.has(word)) ||
    pairs(line).some((pair) => rarePairs.has(pair));
}
