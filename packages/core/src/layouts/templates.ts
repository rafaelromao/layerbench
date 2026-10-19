import type { Geometry, GeometryKey, Hand } from '../geometry/types.js';
import type { Binding, ComboDef, ConditionalLayerDef, LayerDef, Layout } from '../layout/types.js';
import { cyanophageKeyEffort } from '../rules/effort.js';

/**
 * The default layers: Accents, Numbers and Symbols, and Extras where the board needs it, for any
 * board. `AGENTS.md` lists the rules they follow.
 *
 * Numbers and Symbols are Magic Romak's on the 24-key core, which is on every preset but the 18-key
 * one, so every board gets the same grid and the same muscle memory, but for a pair that goes to
 * Extras whole. The keys past the core — the pinky's top and bottom, the inner column — carry what
 * the old Dead keys layer held besides the accents: currency and ordinals on Numbers, and on Symbols
 * each mark beside its look-alike (`;` by `:`, `¿` by `?`, `¡` by `!`), and `«` above `»`. The pairs
 * (`SYMBOL_PAIRS`) stay on one layer, side by side: a board without a key for one half moves the
 * pair to Extras, which comes on while Numbers and Symbols are both held, and fills its prime keys
 * first (`primeKeys`). Accents is one-shot, on the 30 main keys: the dead keys, the letters no dead
 * key makes, and the accented letters the texts use most, each a key of its own, in rows and columns
 * that are easy to remember. A board without one of those keys finds it on Extras too.
 *
 * What changes from board to board is decided by which keys it has, not by its name, so a custom
 * geometry gets a sensible result too: where `0` goes, which thumbs reach the layers, which symbols
 * and accents go to Extras, and, with no bottom row, a layout of its own for what that row would
 * carry. What changes from layout to layout is one thing: a layout that types its vowels with the
 * left hand gets Accents mirrored, so its accented vowels are under the hand its consonants are not.
 *
 * Every symbol is its own `kp`, never the `shifted` half of a pair: producer enumeration moves any
 * output needing a modifier into `excludedByCase` in fold mode, which is the default, so a shifted
 * pair would make the symbol unreachable in an ordinary analysis.
 */

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });
const dead = (diacritic: string): Binding => ({ kind: 'dead_key', diacritic });
const macro = (symbols: string): Binding => ({ kind: 'macro', symbols });
const tapOrHold = (tap: Binding, layer: string): Binding => ({
  kind: 'hold_tap',
  tap,
  hold: { kind: 'mo', layer },
});

/** Right hand as a keypad, left hand as brackets and the arithmetic that pairs with them. */
export const NUMBERS_CORE: Readonly<Record<string, string>> = {
  LTR: '\\',
  LTM: '{',
  LTI: '}',
  LHP: ',',
  LHR: '&',
  LHM: '(',
  LHI: ')',
  LBR: '|',
  LBM: '[',
  LBI: ']',
  RTI: '7',
  RTM: '8',
  RTR: '9',
  RHI: '4',
  RHM: '5',
  RHR: '6',
  RHP: '.',
  RBI: '1',
  RBM: '2',
  RBR: '3',
};

/** The punctuation that does not fit on the alphas. */
export const SYMBOLS_CORE: Readonly<Record<string, string>> = {
  LTR: '~',
  LTM: '#',
  LTI: "'",
  LHP: '@',
  LHR: '^',
  LHM: '$',
  LHI: '"',
  LBR: '<',
  LBM: '>',
  LBI: '`',
  RTI: '%',
  RTM: '=',
  RTR: ':',
  RHI: '?',
  RHM: '-',
  RHR: '+',
  RHP: '_',
  RBI: '!',
  RBM: '/',
  RBR: '*',
};

/**
 * What Numbers has past the core: currency and ordinals, for the left hand while the right types the
 * digits beside them.
 */
export const NUMBERS_OUTER: Readonly<Record<string, string>> = {
  LTP: '€',
  LTC: '£',
  LHC: '§',
  LBP: 'ª',
  LBC: 'º',
  RTP: '°',
};

/**
 * What Symbols has past the core, each mark beside its look-alike, `«` and `»` side by side in the
 * left inner column, and above `¿` and `¡` Turkish `ı`, the one letter the texts have that no
 * accent makes and no other layer has.
 */
export const SYMBOLS_OUTER: Readonly<Record<string, string>> = {
  LTC: '«',
  LHC: '»',
  RTP: ';',
  RTC: 'ı',
  RHC: '¿',
  RBC: '¡',
};

/**
 * The symbols that share a layer, side by side: the brackets and the look-alikes. A pair one half
 * of which has no key on the board goes to Extras whole, the other half leaving its key. Most used
 * in the texts first, as Extras takes them.
 */
export const SYMBOL_PAIRS: readonly (readonly [string, string])[] = [
  ['(', ')'],
  [':', ';'],
  ['«', '»'],
  ['¿', '?'],
  ['¡', '!'],
  ['<', '>'],
  ['[', ']'],
  ['{', '}'],
];

/**
 * The pairs Magic Romak's keymap keeps apart on the 24-key core, and so do the default layers: `\`
 * on Numbers and `/` on Symbols, `+` between `-` and `_`, `+` below and beside `=`.
 */
export const CORE_SPLIT_PAIRS: readonly (readonly [string, string])[] = [
  ['/', '\\'],
  ['-', '_'],
  ['+', '='],
];

/**
 * What Extras takes when the board has no key for it, in this order: the pairs, then the symbols on
 * their own, most used in the texts first. The first take the prime keys (`primeKeys`).
 */
export const EXTRAS_ORDER: readonly (readonly string[])[] = [
  ...SYMBOL_PAIRS,
  ...[...'/€°º£ª*`ı§|\\='].map((s) => [s]),
];

/**
 * Accents, on the 30 main keys, in groups that are easy to remember.
 *
 * The right hand types the accented vowels: a row per accent, grave on top, acute on home and
 * circumflex below, and a column per vowel, `u a e o i` from the inner column out. Where `û` would
 * be, the circumflex's dead key is, which types it. The left hand has German's letters on its home
 * row, the tilde's letters with `ç` below, and the ligatures with `qu` and `ß` on top, each row's
 * dead key at its end: `´` beside the acute row and `~` beside the tilde's, the grave's and `¨`
 * on the pinky.
 *
 * Its letters are the accented letters the texts use most, each typed whole, a press less than its
 * accent and its letter, German's `ä` `ö` `ü` among them; the letters of their own; and `qu`, for the
 * languages that write it before most of their vowels. The dead keys write the rest, `û`, `ë`, `ï`
 * and `ÿ` among them. A board without one of these keys finds it on Extras.
 *
 * The thumb that reaches Accents sits between the two hands, so neither is the busier for it; what
 * decides which hand is better for the vowels is the base layer, and `defaultLayers` mirrors this
 * for a layout that types its vowels with the left hand.
 */
export const ACCENTS: Readonly<Record<string, Binding>> = {
  LTP: dead('`'),
  LTR: kp('ß'),
  LTM: macro('qu'),
  LTI: kp('œ'),
  LTC: kp('æ'),
  LHP: macro('ö'),
  LHR: macro('ä'),
  LHM: macro('ü'),
  LHI: kp('ñ'),
  LHC: dead('´'),
  LBP: dead('¨'),
  LBR: macro('õ'),
  LBM: kp('ç'),
  LBI: macro('ã'),
  LBC: dead('~'),
  RTC: macro('ù'),
  RTI: macro('à'),
  RTM: macro('è'),
  RTR: macro('ò'),
  RTP: macro('ì'),
  RHC: macro('ú'),
  RHI: macro('á'),
  RHM: macro('é'),
  RHR: macro('ó'),
  RHP: macro('í'),
  RBC: dead('^'),
  RBI: macro('â'),
  RBM: macro('ê'),
  RBR: macro('ô'),
  RBP: macro('î'),
};

/**
 * With no bottom row, `1 2 3` take the left home row on the fingers they use on the right, and the
 * brackets they displace go to Extras.
 */
const NUMBERS_NO_BOTTOM: Readonly<Record<string, string>> = {
  LTR: '&',
  LTM: '(',
  LTI: ')',
  LHP: ',',
  LHR: '3',
  LHM: '2',
  LHI: '1',
  RTI: '7',
  RTM: '8',
  RTR: '9',
  RHI: '4',
  RHM: '5',
  RHR: '6',
  RHP: '.',
};

/**
 * With no bottom row, Symbols is the core's top and home rows, `;` beside `:` where `=` was. `?`
 * goes to Extras with `¿`, which has no key here, and what Extras takes first has its key.
 */
const SYMBOLS_NO_BOTTOM: Readonly<Record<string, string>> = {
  LTR: '~',
  LTM: '#',
  LTI: "'",
  LHP: '@',
  LHR: '^',
  LHM: '$',
  LHI: '"',
  RTI: '%',
  RTM: ';',
  RTR: ':',
  RHI: '?',
  RHM: '-',
  RHR: '+',
  RHP: '_',
};

/**
 * With no bottom row, Accents has the dead keys and the letters of their own, and the symbols past
 * Extras on its other keys and thumbs. Every accented letter is its accent and its letter, so the
 * dead keys are the most used, and each goes where it costs least.
 */
const ACCENTS_NO_BOTTOM: Readonly<Record<string, Binding>> = {
  LTM: kp('œ'),
  LHP: kp('ß'),
  LHR: dead('^'),
  LHM: dead('~'),
  LHI: dead('`'),
  RHI: dead('´'),
  RHM: dead('¨'),
  RHR: kp('ç'),
  RHP: kp('ñ'),
  L0: kp('æ'),
};

/** With no bottom row, `ı` goes on the thumb beside the one holding Symbols. */
const SPARE_THUMB_LETTER = 'ı';

export const DEFAULT_LAYER_IDS = {
  accents: 'accents',
  numbers: 'num',
  symbols: 'sym',
  extras: 'extras',
} as const;

/**
 * Every default layer's id. The default layers are the same on every layout, so nothing on them
 * says what kind of layout it is: categories leave them out.
 */
export const DEFAULT_LAYER_ID_LIST: readonly string[] = Object.values(DEFAULT_LAYER_IDS);

/**
 * The keys pressed together on the base layer for Accents: the two outer main thumbs, or the two
 * inner ones on a board with one thumb a hand. Thumbs press none of Accents' 30 main keys, so the
 * chord is never a same-finger pair with the accent after it there. A board with one space bar for
 * both thumbs has no two to chord: it takes the left ring and middle fingers' home keys, the one
 * board where `ä` and `ü`, on those keys, follow the chord with the same finger.
 */
export function accentsComboKeys(geometry: Geometry): string[] {
  if (geometry.family === 'rowstagger') return ['LHR', 'LHM'];
  const have = new Set(geometry.keys.map((k) => k.id));
  return have.has('L1') && have.has('R1') ? ['L1', 'R1'] : ['L0', 'R0'];
}

/**
 * Accents, one-shot, from `accentsComboKeys` pressed together on the base layer. The Special
 * layouts, whose thumbs all type something of their own, and new layouts reach it this way, the
 * same keys on every layout of a board, so none is ranked better or worse for where its own thumbs
 * happen to be free; the Standard and Thumb Alpha ones tap their right outer thumb instead.
 */
export function accentsCombo(baseLayer: string, geometry: Geometry): ComboDef {
  return {
    id: 'accents',
    keys: accentsComboKeys(geometry),
    binding: { kind: 'sl', layer: DEFAULT_LAYER_IDS.accents },
    layers: [baseLayer],
    role: 'typing',
  };
}

/** Extras comes on while Numbers and Symbols are both held. */
export const EXTRAS_CONDITION: ConditionalLayerDef = {
  if: [DEFAULT_LAYER_IDS.numbers, DEFAULT_LAYER_IDS.symbols],
  then: DEFAULT_LAYER_IDS.extras,
};

export interface DefaultLayers {
  /** Numbers, Symbols, Extras when the board needs it, and Accents, in that order. */
  layers: LayerDef[];
  /** `EXTRAS_CONDITION` when there is an Extras layer. */
  conditionalLayers: ConditionalLayerDef[];
  /** Base-layer bindings for the keys that reach Numbers and Symbols, space among them. */
  base: Record<string, Binding>;
  /** The key that types space. */
  spaceKey: string;
}

function bind(have: Set<string>, entries: Record<string, Binding>): Record<string, Binding> {
  const out: Record<string, Binding> = { '*': { kind: 'trans' } };
  for (const [id, binding] of Object.entries(entries)) if (have.has(id)) out[id] = binding;
  return out;
}

function keys(table: Readonly<Record<string, string>>): Record<string, Binding> {
  return Object.fromEntries(Object.entries(table).map(([id, s]) => [id, kp(s)]));
}

/** The same key on the other hand. */
export function mirrorKeyId(id: string): string {
  return id[0] === 'L' ? `R${id.slice(1)}` : id[0] === 'R' ? `L${id.slice(1)}` : id;
}

function mirrored<T>(table: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(Object.entries(table).map(([id, b]) => [mirrorKeyId(id), b]));
}

const VOWELS = new Set([...'aeiou']);

/**
 * Whether a base layer types more of the five vowels with the left hand than with the right: such a
 * layout gets Accents mirrored. What follows an accented vowel is most often a consonant, and a
 * layout's consonants are mostly under the hand its vowels are not.
 */
export function vowelsOnLeft(bindings: Readonly<Record<string, Binding>>): boolean {
  let left = 0;
  let right = 0;
  for (const [id, b] of Object.entries(bindings)) {
    const tap = b.kind === 'hold_tap' ? b.tap : b;
    if (tap.kind !== 'kp' || !tap.symbol || !VOWELS.has(tap.symbol)) continue;
    if (id[0] === 'L') left++;
    else if (id[0] === 'R') right++;
  }
  return left > right;
}

const ROWS = 'THB';
const COLUMNS = 'OPRMIC';

/**
 * The keys of Accents a board does not have, for Extras: each on the free key nearest its place on
 * Accents, the same hand first and then the same row, and past the fingers on a thumb that holds no
 * layer for it.
 */
function accentsPastTheBoard(
  geometry: Geometry,
  accents: Readonly<Record<string, Binding>>,
  extras: Record<string, Binding>,
  held: readonly string[],
): Record<string, Binding> {
  const have = new Set(geometry.keys.map((k) => k.id));
  const fingers = geometry.keys.filter((k) => !k.thumb).map((k) => k.id);
  const thumbs = geometry.keys
    .filter((k) => k.thumb && !held.includes(k.id))
    .sort((a, b) => a.col - b.col)
    .map((k) => k.id);
  const distance = (from: string, to: string) =>
    (from[0] === to[0] ? 0 : 100) +
    3 * Math.abs(ROWS.indexOf(from[1]) - ROWS.indexOf(to[1])) +
    Math.abs(COLUMNS.indexOf(from[2]) - COLUMNS.indexOf(to[2]));
  const out = { ...extras };
  for (const [id, binding] of Object.entries(accents)) {
    if (have.has(id)) continue;
    const free = (k: string) => !out[k];
    const spot =
      fingers.filter(free).sort((a, b) => distance(id, a) - distance(id, b))[0] ??
      thumbs.find(free);
    if (spot) out[spot] = binding;
  }
  return out;
}

/** A thumb of `holding`'s hand other than it, for `ı`, which Symbols has no key for on 18 keys. */
function spareThumb(geometry: Geometry, holding: string): string | undefined {
  const hand = geometry.keys.find((k) => k.id === holding)?.hand;
  return geometry.keys
    .filter((k) => k.thumb && k.hand === hand && k.id !== holding)
    .sort((a, b) => a.col - b.col)[0]?.id;
}

/**
 * The default layers for a board, and the base-layer keys that reach Numbers and Symbols. Accents
 * is reached by `accentsCombo`, on the base layer, which the caller adds with that layer's id, or by
 * a thumb of the caller's; `mirrorAccents` mirrors it, for a layout that types its vowels with the
 * left hand. The Accents keys the board lacks go on Extras, mirrored with it.
 *
 * On a split board the inner thumbs do it, as on Magic Romak: the left types space and holds
 * Numbers, the right holds Symbols. Holding the right thumb from Numbers reaches Symbols too, or
 * Extras where the board has one. A row-stagger board has one space bar for both thumbs: it holds
 * Numbers, and from there the right pinky's outer key arms Symbols.
 */
export function defaultLayers(
  geometry: Geometry,
  options: { mirrorAccents?: boolean } = {},
): DefaultLayers {
  const have = new Set(geometry.keys.map((k) => k.id));
  const { accents, numbers, symbols, extras } = DEFAULT_LAYER_IDS;
  const spaceBar = geometry.family === 'rowstagger';
  const noBottom = !have.has('LBI') && !have.has('RBI');
  const spaceKey = have.has('L0') ? 'L0' : (geometry.textThumbs[0] ?? geometry.keys[0].id);
  const space = kp(' ');

  const base: Record<string, Binding> = { [spaceKey]: tapOrHold(space, numbers) };
  if (spaceBar && have.has('R0')) base.R0 = tapOrHold(space, numbers);
  else if (have.has('R0')) base.R0 = { kind: 'mo', layer: symbols };

  // With no bottom row, `ı` goes on the thumb beside the one holding Symbols.
  const beside = noBottom && have.has('R0') ? spareThumb(geometry, 'R0') : undefined;
  const held = [spaceKey, 'R0'];
  const spread = spreadSymbols(
    geometry,
    noBottom ? NUMBERS_NO_BOTTOM : { ...NUMBERS_CORE, ...NUMBERS_OUTER },
    noBottom ? SYMBOLS_NO_BOTTOM : { ...SYMBOLS_CORE, ...SYMBOLS_OUTER },
    beside ? [SPARE_THUMB_LETTER] : [],
    held,
  );
  const num = keys(spread.numbers);
  const sym = keys(spread.symbols);
  const accentKeys = withLeftOver(geometry, noBottom ? ACCENTS_NO_BOTTOM : ACCENTS, spread.left);
  const acc = options.mirrorAccents ? mirrored(accentKeys) : accentKeys;
  const ext = accentsPastTheBoard(geometry, acc, keys(spread.extras), held);
  if (spaceBar) {
    // The bar is held for Numbers: pressed again it would be the same key.
    for (const id of ['L0', 'R0']) {
      num[id] = { kind: 'none' };
      sym[id] = { kind: 'none' };
    }
    num.RHO = { kind: 'sl', layer: symbols };
    num.RTO = kp('0');
  } else {
    sym[spaceKey] = space;
    if (have.has('R1')) {
      num.R0 = tapOrHold(space, symbols);
      num.R1 = kp('0');
    } else if (have.has('R0')) num.R0 = tapOrHold(kp('0'), symbols);
    else num.RBC = kp('0');
  }
  if (beside) sym[beside] = kp(SPARE_THUMB_LETTER);

  const layers: LayerDef[] = [
    { id: numbers, name: 'Numbers', bindings: bind(have, num) },
    { id: symbols, name: 'Symbols', bindings: bind(have, sym) },
  ];
  const hasExtras = Object.keys(ext).length > 0;
  if (hasExtras) layers.push({ id: extras, name: 'Extras', bindings: bind(have, ext) });
  layers.push({ id: accents, name: 'Accents', bindings: bind(have, acc) });
  return {
    layers,
    conditionalLayers: hasExtras ? [EXTRAS_CONDITION] : [],
    base,
    spaceKey,
  };
}

/** Home first among keys of equal Effort, then the top row, then the bottom one. */
const ROW_RANK = [1, 0, 2];

/**
 * The board's finger keys, prime first: the least Effort, the home row first among keys that cost
 * the same, then the right hand, where Symbols has its look-alikes, and the inner columns first.
 */
export function primeKeys(geometry: Geometry): string[] {
  return geometry.keys
    .filter((k) => !k.thumb)
    .sort(
      (a, b) =>
        cyanophageKeyEffort(a) - cyanophageKeyEffort(b) ||
        ROW_RANK[a.row] - ROW_RANK[b.row] ||
        (a.hand === b.hand ? 0 : a.hand === 'R' ? -1 : 1) ||
        b.col - a.col,
    )
    .map((k) => k.id);
}

interface Spread {
  numbers: Record<string, string>;
  symbols: Record<string, string>;
  extras: Record<string, string>;
  /** What has no key on any of them: pairs, and symbols on their own. */
  left: string[][];
}

/** The two free neighbours in a row that cost least, left to right. */
function cheapestNeighbours(
  geometry: Geometry,
  free: readonly string[],
): [string, string] | undefined {
  const byId = new Map(geometry.keys.map((k) => [k.id, k]));
  let best: [string, string] | undefined;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const [i, x] of free.entries()) {
    const kx = byId.get(x) as GeometryKey;
    for (const y of free.slice(i + 1)) {
      const ky = byId.get(y) as GeometryKey;
      if (kx.thumb || ky.thumb) continue;
      if (kx.hand !== ky.hand || kx.row !== ky.row || Math.abs(kx.col - ky.col) !== 1) continue;
      const cost = cyanophageKeyEffort(kx) + cyanophageKeyEffort(ky);
      if (cost < bestCost) [best, bestCost] = [kx.x < ky.x ? [x, y] : [y, x], cost];
    }
  }
  return best;
}

/**
 * Numbers' and Symbols' tables on the keys the board has, and Extras for the rest. A pair one half
 * of which has no key goes whole: the other half leaves its key, and a key so left on Symbols takes
 * the most used symbol that has none. Extras then takes what is still without a key, in
 * `EXTRAS_ORDER`: each pair on the two neighbours in a row that cost least, each symbol on its own
 * on the prime key still free, and on a thumb not `held` once the fingers' keys are full.
 */
function spreadSymbols(
  geometry: Geometry,
  numbersTable: Readonly<Record<string, string>>,
  symbolsTable: Readonly<Record<string, string>>,
  elsewhere: readonly string[],
  held: readonly string[],
): Spread {
  const byId = new Map(geometry.keys.map((k) => [k.id, k]));
  const onBoard = (table: Readonly<Record<string, string>>) =>
    Object.fromEntries(Object.entries(table).filter(([id]) => byId.has(id)));
  const numbers = onBoard(numbersTable);
  const symbols = onBoard(symbolsTable);
  const typed = new Set([...Object.values(numbers), ...Object.values(symbols), ...elsewhere]);
  const homeless = new Set(
    [NUMBERS_CORE, NUMBERS_OUTER, SYMBOLS_CORE, SYMBOLS_OUTER]
      .flatMap((t) => Object.values(t))
      .filter((s) => !typed.has(s)),
  );
  const holes: string[] = [];
  for (const pair of SYMBOL_PAIRS) {
    if (!pair.some((s) => homeless.has(s))) continue;
    for (const s of pair) homeless.add(s);
    for (const table of [numbers, symbols])
      for (const [id, s] of Object.entries(table)) {
        if (!pair.includes(s)) continue;
        delete table[id];
        if (table === symbols) holes.push(id);
      }
  }

  const order = [
    ...EXTRAS_ORDER,
    ...[...homeless].filter((s) => !EXTRAS_ORDER.some((g) => g.includes(s))).map((s) => [s]),
  ];
  const pairs = order.filter((g) => g.length === 2 && homeless.has(g[0]));
  const singles = order.filter((g) => g.length === 1 && homeless.has(g[0])).map(([s]) => s);
  const prime = primeKeys(geometry);
  for (const id of prime.filter((k) => holes.includes(k))) {
    const s = singles.shift();
    if (s) symbols[id] = s;
  }

  const extras: Record<string, string> = {};
  const left: string[][] = [];
  const free = () => prime.filter((id) => !extras[id]);
  for (const [a, b] of pairs) {
    const spot = cheapestNeighbours(geometry, free());
    if (spot) [extras[spot[0]], extras[spot[1]]] = [a, b];
    else left.push([a, b]);
  }
  const thumbs = geometry.keys
    .filter((k) => k.thumb && !held.includes(k.id))
    .sort((a, b) => a.col - b.col)
    .map((k) => k.id);
  for (const s of singles) {
    const spot = free()[0] ?? thumbs.find((id) => !extras[id]);
    if (spot) extras[spot] = s;
    else left.push([s]);
  }
  return { numbers, symbols, extras, left };
}

/**
 * Accents with what has no key on the other layers on its free keys, the prime ones first, each
 * pair on two neighbours in a row while there are any.
 */
function withLeftOver(
  geometry: Geometry,
  accents: Readonly<Record<string, Binding>>,
  left: readonly (readonly string[])[],
): Record<string, Binding> {
  const out = { ...accents };
  const thumbs = geometry.keys
    .filter((k) => k.thumb)
    .sort((a, b) => a.col - b.col)
    .map((k) => k.id);
  const free = () => [...primeKeys(geometry), ...thumbs].filter((id) => !out[id]);
  for (const group of left) {
    const spots = (group.length === 2 && cheapestNeighbours(geometry, free())) || free();
    group.forEach((s, i) => {
      if (spots[i]) out[spots[i]] = kp(s);
    });
  }
  return out;
}

/**
 * A layout given the default layers, keeping every key it has: Numbers, Symbols, Extras and Accents
 * after its own layers, and the keys that reach them, as on a new layout. The key that types space
 * also holds Numbers, or the left inner thumb does where no thumb types space. A thumb of the other
 * hand holds Symbols: the innermost with nothing on it, or else the innermost, still typing what it
 * typed. On Numbers it taps space, the space thumb being held, and `0` goes on another thumb of its
 * hand. Accents is reached the same way on every layout, by `accentsCombo` on the base layer, and is
 * the same layer on every layout but mirrored on one that types its vowels with the left hand
 * (`vowelsOnLeft`).
 *
 * A layout that already has a layer of one of those ids, or a board with one space bar for both
 * thumbs, is left as it is.
 */
export function withDefaultLayers(layout: Layout, geometry: Geometry): Layout {
  const { numbers, symbols } = DEFAULT_LAYER_IDS;
  const taken = new Set(layout.layers.map((l) => l.id));
  if (geometry.family === 'rowstagger') return layout;
  if (DEFAULT_LAYER_ID_LIST.some((id) => taken.has(id))) return layout;

  const [first, ...rest] = layout.layers;
  const at = (id: string): Binding | undefined => first.bindings[id] ?? first.bindings['*'];
  const free = (id: string) => {
    const b = at(id);
    return !b || b.kind === 'none' || b.kind === 'trans';
  };
  // A tap-hold cannot be the tap of another.
  const holdable = (id: string) => {
    const b = at(id);
    return !b || (b.kind !== 'hold_tap' && b.kind !== 'lt');
  };
  const types = (id: string, symbol: string) => {
    const b = at(id);
    return b?.kind === 'kp' && b.symbol === symbol;
  };
  const thumbs = geometry.keys.filter((k) => k.thumb).sort((a, b) => a.col - b.col);
  const handOf = (id: string) => thumbs.find((k) => k.id === id)?.hand;
  const ofHand = (hand: Hand) => thumbs.filter((k) => k.hand === hand).map((k) => k.id);

  const declared = layout.keys.space;
  const spaceThumb =
    handOf(declared) && types(declared, ' ')
      ? declared
      : thumbs.find((k) => types(k.id, ' ') && holdable(k.id))?.id;
  const numbersKey = spaceThumb ?? ofHand('L').find(holdable);
  const hand = numbersKey ? handOf(numbersKey) : undefined;
  if (!numbersKey || !hand || !holdable(numbersKey)) return layout;
  const otherHand: Hand = hand === 'L' ? 'R' : 'L';
  const candidates = ofHand(otherHand).filter(holdable);
  const symbolsKey = candidates.find(free) ?? candidates[0];
  if (!symbolsKey) return layout;

  const holdSymbols: Binding = { kind: 'mo', layer: symbols };
  const baseBindings: Record<string, Binding> = {
    ...first.bindings,
    [numbersKey]: {
      kind: 'hold_tap',
      tap: at(numbersKey) ?? { kind: 'none' },
      hold: { kind: 'mo', layer: numbers },
    },
    [symbolsKey]: free(symbolsKey)
      ? holdSymbols
      : { kind: 'hold_tap', tap: at(symbolsKey) as Binding, hold: holdSymbols },
  };

  // The defaults' thumbs on Numbers and Symbols assume space on L0 and the Symbols thumb on R0:
  // those go, and the roles are given to the thumbs chosen here. Numbers' thumbs are all roles, and
  // so is Symbols' spare one on a board with no bottom row, `ı` beside Symbols' thumb; on Symbols,
  // what the defaults put on another thumb stays where it does not land on one of the two, and the
  // one-shot Accents keeps its own, nothing being held there.
  const thumbIds = new Set(thumbs.map((k) => k.id));
  const have = (id: string) => geometry.keys.some((k) => k.id === id);
  const zero = ofHand(otherHand).find((id) => id !== symbolsKey);
  const roles = new Set(['L0', 'R0', numbersKey, symbolsKey]);
  const defaults = defaultLayers(geometry, { mirrorAccents: vowelsOnLeft(first.bindings) });
  const defaultSymbols = defaults.layers.find((l) => l.id === symbols)?.bindings ?? {};
  const spareLetter = defaultSymbols[spareThumb(geometry, 'R0') ?? ''];
  const layers = defaults.layers.map((l): LayerDef => {
    const bindings = Object.fromEntries(
      Object.entries(l.bindings).filter(
        ([id]) =>
          !thumbIds.has(id) ||
          (l.id !== numbers &&
            (l.id !== symbols || (!roles.has(id) && l.bindings[id] !== spareLetter))),
      ),
    );
    if (l.id === numbers) {
      bindings[symbolsKey] = { kind: 'hold_tap', tap: kp(' '), hold: holdSymbols };
      // With no other thumb there, beside the keypad, in the inner column.
      const spot = zero ?? ['RBC', 'RHC'].find((id) => have(id) && !bindings[id]);
      if (spot) bindings[spot] = kp('0');
    }
    if (l.id === DEFAULT_LAYER_IDS.extras) {
      // Extras is on while both are held: what the defaults put on either goes to a thumb free.
      const held = [numbersKey, symbolsKey];
      for (const id of held) {
        const b = bindings[id];
        if (!b) continue;
        delete bindings[id];
        const spot = thumbs.find((k) => !held.includes(k.id) && !bindings[k.id]);
        if (spot) bindings[spot.id] = b;
      }
    }
    if (l.id === symbols) {
      if (types(numbersKey, ' ')) bindings[numbersKey] = kp(' ');
      const beside = spareThumb(geometry, symbolsKey);
      if (spareLetter && beside) bindings[beside] = spareLetter;
    }
    return { ...l, bindings };
  });

  return {
    ...layout,
    layers: [{ ...first, bindings: baseBindings }, ...rest, ...layers],
    combos: [...(layout.combos ?? []), accentsCombo(first.id, geometry)],
    ...(defaults.conditionalLayers.length > 0 && {
      conditionalLayers: [...(layout.conditionalLayers ?? []), ...defaults.conditionalLayers],
    }),
  };
}

/** Every character the default layers type with a key of its own, for tests and documentation. */
export function defaultLayerSymbols(): string[] {
  const out = new Set<string>([
    '0',
    ...Object.values(NUMBERS_CORE),
    ...Object.values(NUMBERS_OUTER),
    ...Object.values(SYMBOLS_CORE),
    ...Object.values(SYMBOLS_OUTER),
  ]);
  for (const b of Object.values(ACCENTS)) if (b.kind === 'kp' && b.symbol) out.add(b.symbol);
  return [...out];
}

/** The accents Accents carries as dead keys. */
export function defaultDeadKeys(): string[] {
  return Object.values(ACCENTS).flatMap((b) => (b.kind === 'dead_key' ? [b.diacritic] : []));
}

/** The accented letters, and `qu`, Accents types whole. */
export function defaultAccentMacros(): string[] {
  return Object.values(ACCENTS).flatMap((b) =>
    b.kind === 'macro' && b.symbols ? [b.symbols] : [],
  );
}
