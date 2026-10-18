import type { Geometry, Hand } from '../geometry/types.js';
import type { Binding, ComboDef, ConditionalLayerDef, LayerDef, Layout } from '../layout/types.js';

/**
 * The default layers: Accents, Numbers and Symbols, and Extras where the board needs it, for any
 * board.
 *
 * Numbers and Symbols are Magic Romak's on the 24-key core, which is on every preset but the 18-key
 * one, so every board gets the same grid and the same muscle memory. The keys past the core — the
 * pinky's top and bottom, the inner column — carry what the old Dead keys layer held besides the
 * accents: currency and ordinals on Numbers, and on Symbols each mark beside its look-alike (`;` by
 * `:`, `¿` by `?`, `«` and `»` around `<` and `>`). A board without one of those keys finds its
 * symbol on Extras, which comes on while Numbers and Symbols are both held, on the key Dead keys
 * gave it. Accents is one-shot: the dead keys, the letters no dead key makes, and the accented
 * letters the texts use most, each a key of its own: the most used where they cost least, and what
 * every board needs on the core.
 *
 * What changes from board to board is decided by which keys it has, not by its name, so a custom
 * geometry gets a sensible result too: where `0` goes, which thumbs reach the layers, which symbols
 * go to Extras, and, with no bottom row, a layout of its own for what that row would carry.
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

/** What Symbols has past the core, each mark beside its look-alike. */
export const SYMBOLS_OUTER: Readonly<Record<string, string>> = {
  LBP: '«',
  LBC: '»',
  RTP: ';',
  RHC: '¿',
  RBC: '¡',
};

/**
 * Where Extras puts a symbol of Numbers' or Symbols' outer keys when the board has no such key: on
 * the 24-key core, where the Dead keys layer had it.
 */
export const EXTRAS_CORE: Readonly<Record<string, string>> = {
  LTM: '€',
  LHP: 'ª',
  LHM: '£',
  LBR: '«',
  LBM: '»',
  RTI: '°',
  RTR: ';',
  RHI: '¿',
  RHP: 'º',
  RBI: '¡',
  RBR: '§',
};

/**
 * Accents. Each key goes where it costs least, the keys used most first: the presses on each, typing
 * the texts the app comes with (all of them, summed) on the default analysis settings, set against
 * the Effort rule's cost of each position. Of the keys that cost the same, the home row comes first,
 * then the stronger finger, then the top row; then the right hand, the left having just pressed the
 * combo.
 *
 * Two things come before that order. The keys every board needs, the dead keys and the letters no
 * dead key makes (`ç` `œ` `æ` `ß`, and `ñ`, worth a press less), are on the 24-key core, so a board
 * without the pinkies' top and bottom keys or the inner column still writes every language; what is
 * past the core is letters a dead key also makes, the ten used least. And `qu`, which is no accent,
 * trades places with `ê`, leaving the home row to accented letters.
 *
 * Its letters are the accented letters the texts use most, each typed whole, a press less than its
 * accent and its letter, German's `ä` `ö` `ü` among them; the letters of their own; and `qu`, for the
 * languages that write it before most of their vowels. The dead keys write the rest, `û`, `ë`, `ï`
 * and `ÿ` among them: a dead key is used as often as the letters it makes.
 */
export const ACCENTS: Readonly<Record<string, Binding>> = {
  LTP: macro('ö'),
  LTR: dead('~'),
  LTM: kp('ñ'),
  LTI: dead('¨'),
  LTC: macro('ò'),
  LHP: macro('ü'),
  LHR: macro('à'),
  LHM: macro('á'),
  LHI: macro('ê'),
  LHC: macro('ô'),
  LBP: macro('õ'),
  LBR: kp('æ'),
  LBM: kp('œ'),
  LBI: kp('ç'),
  LBC: macro('î'),
  RTC: macro('ì'),
  RTI: kp('ß'),
  RTM: macro('qu'),
  RTR: dead('´'),
  RTP: macro('ä'),
  RHC: macro('ù'),
  RHI: macro('é'),
  RHM: macro('ó'),
  RHR: macro('ã'),
  RHP: macro('í'),
  RBC: macro('â'),
  RBI: macro('è'),
  RBM: dead('^'),
  RBR: dead('`'),
  RBP: macro('ú'),
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

/** With no bottom row, Extras is what the bottom rows of Numbers and Symbols carried. */
const EXTRAS_NO_BOTTOM: Readonly<Record<string, string>> = {
  LTR: '\\',
  LTM: '{',
  LTI: '}',
  LHP: '`',
  LHR: '|',
  LHM: '[',
  LHI: ']',
  RTI: '!',
  RTM: '/',
  RTR: '*',
  RHI: '<',
  RHM: '>',
  RHR: '«',
  RHP: '»',
};

/**
 * With no bottom row, Accents has room for nothing but what no other layer has: the dead keys, the
 * letters of their own, and the symbols past Extras, the thumbs among them. Every accented letter is
 * its accent and its letter, so the dead keys are the most used, and each key goes where it costs
 * least, as on `ACCENTS`; the symbols the texts never type come last.
 */
const ACCENTS_NO_BOTTOM: Readonly<Record<string, Binding>> = {
  LTR: kp('§'),
  LTM: kp('œ'),
  LTI: kp('°'),
  LHP: kp('ß'),
  LHR: dead('^'),
  LHM: dead('~'),
  LHI: dead('`'),
  RTI: kp('£'),
  RTM: kp('¿'),
  RTR: kp('º'),
  RHI: dead('´'),
  RHM: dead('¨'),
  RHR: kp('ç'),
  RHP: kp('ñ'),
  L0: kp('æ'),
  L1: kp('ª'),
  R0: kp('¡'),
  R1: kp('€'),
};

/** With no bottom row, Symbols' last mark goes on the thumb beside the one holding Numbers. */
const SPARE_THUMB_SYMBOL = ';';

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

/** The keys pressed together on the base layer for Accents: on every board, and on no thumb. */
export const ACCENTS_COMBO_KEYS = ['LHR', 'LHM'] as const;

/**
 * Accents, one-shot, from the left ring and middle fingers' home keys pressed together on the base
 * layer. Every layout with the default layers reaches it the same way, so none is ranked better or
 * worse for where its own thumbs happen to be free.
 */
export function accentsCombo(baseLayer: string): ComboDef {
  return {
    id: 'accents',
    keys: [...ACCENTS_COMBO_KEYS],
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

/** A thumb of `holding`'s hand other than it, for the mark Symbols has no key for on 18 keys. */
function spareThumb(geometry: Geometry, holding: string): string | undefined {
  const hand = geometry.keys.find((k) => k.id === holding)?.hand;
  return geometry.keys
    .filter((k) => k.thumb && k.hand === hand && k.id !== holding)
    .sort((a, b) => a.col - b.col)[0]?.id;
}

/**
 * The default layers for a board, and the base-layer keys that reach Numbers and Symbols. Accents
 * is reached by `accentsCombo`, on the base layer, which the caller adds with that layer's id.
 *
 * On a split board the inner thumbs do it, as on Magic Romak: the left types space and holds
 * Numbers, the right holds Symbols. Holding the right thumb from Numbers reaches Symbols too, or
 * Extras where the board has one. A row-stagger board has one space bar for both thumbs: it holds
 * Numbers, and from there the right pinky's outer key arms Symbols.
 */
export function defaultLayers(geometry: Geometry): DefaultLayers {
  const have = new Set(geometry.keys.map((k) => k.id));
  const { accents, numbers, symbols, extras } = DEFAULT_LAYER_IDS;
  const spaceBar = geometry.family === 'rowstagger';
  const noBottom = !have.has('LBI') && !have.has('RBI');
  const spaceKey = have.has('L0') ? 'L0' : (geometry.textThumbs[0] ?? geometry.keys[0].id);
  const space = kp(' ');

  const base: Record<string, Binding> = { [spaceKey]: tapOrHold(space, numbers) };
  if (spaceBar && have.has('R0')) base.R0 = tapOrHold(space, numbers);
  else if (have.has('R0')) base.R0 = { kind: 'mo', layer: symbols };

  const num = keys(noBottom ? NUMBERS_NO_BOTTOM : { ...NUMBERS_CORE, ...NUMBERS_OUTER });
  const sym = keys(noBottom ? SYMBOLS_CORE : { ...SYMBOLS_CORE, ...SYMBOLS_OUTER });
  const ext = keys(noBottom ? EXTRAS_NO_BOTTOM : extrasFor(have));
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
  if (noBottom) {
    const spare = spareThumb(geometry, spaceKey);
    if (spare) sym[spare] = kp(SPARE_THUMB_SYMBOL);
  }

  const layers: LayerDef[] = [
    { id: numbers, name: 'Numbers', bindings: bind(have, num) },
    { id: symbols, name: 'Symbols', bindings: bind(have, sym) },
  ];
  const hasExtras = Object.keys(ext).length > 0;
  if (hasExtras) layers.push({ id: extras, name: 'Extras', bindings: bind(have, ext) });
  layers.push({
    id: accents,
    name: 'Accents',
    bindings: bind(have, noBottom ? ACCENTS_NO_BOTTOM : ACCENTS),
  });
  return {
    layers,
    conditionalLayers: hasExtras ? [EXTRAS_CONDITION] : [],
    base,
    spaceKey,
  };
}

/** Extras for a board with a bottom row: each outer symbol whose key it lacks. */
function extrasFor(have: Set<string>): Record<string, string> {
  const displaced = new Set(
    [...Object.entries(NUMBERS_OUTER), ...Object.entries(SYMBOLS_OUTER)]
      .filter(([id]) => !have.has(id))
      .map(([, s]) => s),
  );
  return Object.fromEntries(Object.entries(EXTRAS_CORE).filter(([, s]) => displaced.has(s)));
}

/**
 * A layout given the default layers, keeping every key it has: Numbers, Symbols, Extras and Accents
 * after its own layers, and the keys that reach them, as on a new layout. The key that types space
 * also holds Numbers, or the left inner thumb does where no thumb types space. A thumb of the other
 * hand holds Symbols: the innermost with nothing on it, or else the innermost, still typing what it
 * typed. On Numbers it taps space, the space thumb being held, and `0` goes on another thumb of its
 * hand. Accents is the same on every layout: `accentsCombo`, on the base layer.
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
  // so is Symbols' spare one on a board with no bottom row; on Symbols, what the defaults put on
  // another thumb stays where it does not land on one of the two, and the one-shot Accents keeps
  // its own, nothing being held there.
  const thumbIds = new Set(thumbs.map((k) => k.id));
  const have = (id: string) => geometry.keys.some((k) => k.id === id);
  const zero = ofHand(otherHand).find((id) => id !== symbolsKey);
  const roles = new Set(['L0', 'R0', numbersKey, symbolsKey]);
  const defaults = defaultLayers(geometry);
  const spareSymbol = defaults.layers.find((l) => l.id === symbols)?.bindings[
    spareThumb(geometry, defaults.spaceKey) ?? ''
  ];
  const layers = defaults.layers.map((l): LayerDef => {
    const bindings = Object.fromEntries(
      Object.entries(l.bindings).filter(
        ([id]) =>
          !thumbIds.has(id) ||
          (l.id !== numbers &&
            (l.id !== symbols || (!roles.has(id) && l.bindings[id] !== spareSymbol))),
      ),
    );
    if (l.id === numbers) {
      bindings[symbolsKey] = { kind: 'hold_tap', tap: kp(' '), hold: holdSymbols };
      // With no other thumb there, beside the keypad, in the inner column.
      const spot = zero ?? ['RBC', 'RHC'].find((id) => have(id) && !bindings[id]);
      if (spot) bindings[spot] = kp('0');
    }
    if (l.id === symbols) {
      if (types(numbersKey, ' ')) bindings[numbersKey] = kp(' ');
      const spare = spareThumb(geometry, numbersKey);
      if (spareSymbol && spare) bindings[spare] = spareSymbol;
    }
    return { ...l, bindings };
  });

  return {
    ...layout,
    layers: [{ ...first, bindings: baseBindings }, ...rest, ...layers],
    combos: [...(layout.combos ?? []), accentsCombo(first.id)],
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
