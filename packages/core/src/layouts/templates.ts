import type { Geometry, Hand } from '../geometry/types.js';
import type { Binding, ComboDef, LayerDef, Layout } from '../layout/types.js';

/**
 * The default layers: Numbers, Symbols and Dead keys, for any board.
 *
 * Numbers and Symbols are Magic Romak's, which use only the 24-key core. That core is on every
 * preset but the 18-key one, so every board gets the same grid and the same muscle memory; keys
 * beyond it stay transparent, free for whatever the layout wants there. Dead keys follows Symbols:
 * each accent sits in its look-alike's column (`´` with `'`, `¨` with `"`, `€` with `$`, `«` with
 * `<`), the left hand's top and home rows swapped, and with the base layer's letters it writes
 * Portuguese, English, Spanish, French and Italian.
 *
 * What changes from board to board is decided by which keys it has, not by its name, so a custom
 * geometry gets a sensible result too: where `0` goes, which thumbs reach the layers, and, with no
 * bottom row, a fourth layer for the keys that row would carry.
 *
 * Every symbol is its own `kp`, never the `shifted` half of a pair: producer enumeration moves any
 * output needing a modifier into `excludedByCase` in fold mode, which is the default, so a shifted
 * pair would make the symbol unreachable in an ordinary analysis.
 */

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });
const dead = (diacritic: string): Binding => ({ kind: 'dead_key', diacritic });
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
 * The accents, the letters no dead key makes, and the symbols the corpora hold that Symbols has no
 * room for. `ç` and `ñ`, which an accent and a letter would type too, have keys of their own: each
 * is common enough in its languages to be worth a press less. On the left hand the top and home
 * rows are the other way round from Symbols: the acute and the tilde, the accents Portuguese and
 * Spanish use most, are on the home row, and `^` `€` `¨` above it.
 */
export const DEAD_KEYS_CORE: Readonly<Record<string, Binding>> = {
  LTR: dead('^'),
  LTM: kp('€'),
  LTI: dead('¨'),
  LHP: kp('ª'),
  LHR: dead('~'),
  LHM: kp('£'),
  LHI: dead('´'),
  LBR: kp('«'),
  LBM: kp('»'),
  LBI: dead('`'),
  RTI: kp('°'),
  RTM: kp('ñ'),
  RTR: kp(';'),
  RHI: kp('¿'),
  RHM: kp('ç'),
  RHR: kp('œ'),
  RHP: kp('º'),
  RBI: kp('¡'),
  RBM: kp('æ'),
  RBR: kp('§'),
};

/** With no bottom row, `1 2 3` take the left home row on the fingers they use on the right. */
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

/** What the missing bottom rows of Numbers, Symbols and Dead keys carried, on a fourth layer. */
const SYMBOLS2_NO_BOTTOM: Readonly<Record<string, string>> = {
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
  L1: '¡',
  R1: 'æ',
};

export const DEFAULT_LAYER_IDS = {
  numbers: 'num',
  symbols: 'sym',
  symbols2: 'sym2',
  deadKeys: 'dead',
} as const;

/** The keys pressed together on the base layer for Dead keys: on every board, and on no thumb. */
export const DEAD_KEYS_COMBO_KEYS = ['LHR', 'LHM'] as const;

/**
 * Dead keys, one-shot, from the left ring and middle fingers' home keys pressed together on the
 * base layer. Every layout with the default layers reaches it the same way, so none is ranked
 * better or worse for where its own thumbs happen to be free.
 */
export function deadKeysCombo(baseLayer: string): ComboDef {
  return {
    id: 'dead-keys',
    keys: [...DEAD_KEYS_COMBO_KEYS],
    binding: { kind: 'sl', layer: DEFAULT_LAYER_IDS.deadKeys },
    layers: [baseLayer],
    role: 'typing',
  };
}

export interface DefaultLayers {
  /** Numbers, Symbols, Symbols 2 when the board has no bottom row, and Dead keys, in that order. */
  layers: LayerDef[];
  /** Base-layer bindings for the keys that reach them, space among them. */
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

/**
 * The default layers for a board, and the base-layer keys that reach Numbers and Symbols. Dead keys
 * is reached by `deadKeysCombo`, on the base layer, which the caller adds with that layer's id.
 *
 * On a split board the inner thumbs do it, as on Magic Romak: the left types space and holds
 * Numbers, the right holds Symbols. Holding the right thumb from Numbers reaches Symbols too. A
 * row-stagger board has one space bar for both thumbs: it holds Numbers, and from there the right
 * pinky's outer key arms Symbols.
 */
export function defaultLayers(geometry: Geometry): DefaultLayers {
  const have = new Set(geometry.keys.map((k) => k.id));
  const { numbers, symbols, symbols2, deadKeys } = DEFAULT_LAYER_IDS;
  const spaceBar = geometry.family === 'rowstagger';
  const noBottom = !have.has('LBI') && !have.has('RBI');
  const spaceKey = have.has('L0') ? 'L0' : (geometry.textThumbs[0] ?? geometry.keys[0].id);
  const space = kp(' ');

  const base: Record<string, Binding> = { [spaceKey]: tapOrHold(space, numbers) };
  if (spaceBar && have.has('R0')) base.R0 = tapOrHold(space, numbers);
  else if (have.has('R0')) base.R0 = { kind: 'mo', layer: symbols };

  const num: Record<string, Binding> = keys(noBottom ? NUMBERS_NO_BOTTOM : NUMBERS_CORE);
  const sym: Record<string, Binding> = keys(SYMBOLS_CORE);
  const acc: Record<string, Binding> = { ...DEAD_KEYS_CORE };
  if (spaceBar) {
    // The bar is held for Numbers: pressed again it would be the same key.
    for (const id of ['L0', 'R0']) {
      num[id] = { kind: 'none' };
      sym[id] = { kind: 'none' };
    }
    num.RHO = { kind: 'sl', layer: symbols };
    num.RTP = kp('0');
  } else {
    sym[spaceKey] = space;
    if (have.has('R1')) {
      num.R0 = tapOrHold(space, symbols);
      num.R1 = kp('0');
    } else if (have.has('R0')) num.R0 = tapOrHold(kp('0'), symbols);
    else num.RTP = kp('0');
  }
  if (noBottom) {
    sym.R1 = { kind: 'sl', layer: symbols2 };
    // The grave accent's bottom-row key is gone: it takes ñ's, and ñ and § go to the thumbs. `«`
    // and `»` are on Symbols 2.
    acc.RTM = dead('`');
    acc.L1 = kp('§');
    acc.R1 = kp('ñ');
  }

  const layers: LayerDef[] = [
    { id: numbers, name: 'Numbers', bindings: bind(have, num) },
    { id: symbols, name: 'Symbols', bindings: bind(have, sym) },
  ];
  if (noBottom)
    layers.push({
      id: symbols2,
      name: 'Symbols 2',
      bindings: bind(have, keys(SYMBOLS2_NO_BOTTOM)),
    });
  layers.push({ id: deadKeys, name: 'Dead keys', bindings: bind(have, acc) });
  return { layers, base, spaceKey };
}

/**
 * A layout given the default layers, keeping every key it has: Numbers, Symbols and Dead keys after
 * its own layers, and the keys that reach them, as on a new layout. The key that types space also
 * holds Numbers, or the left inner thumb does where no thumb types space. A thumb of the other hand
 * holds Symbols: the innermost with nothing on it, or else the innermost, still typing what it
 * typed. On Numbers it taps space, the space thumb being held, and `0` goes on another thumb of its
 * hand. Dead keys is the same on every layout: `deadKeysCombo`, on the base layer.
 *
 * A layout that already has a layer of the same id, or a board with one space bar for both thumbs,
 * is left as it is.
 */
export function withDefaultLayers(layout: Layout, geometry: Geometry): Layout {
  const { numbers, symbols } = DEFAULT_LAYER_IDS;
  const taken = new Set(layout.layers.map((l) => l.id));
  if (geometry.family === 'rowstagger') return layout;
  if (Object.values(DEFAULT_LAYER_IDS).some((id) => taken.has(id))) return layout;

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
  // those go, and the roles are given to the thumbs chosen here. Numbers' thumbs are all roles; on
  // Symbols, what the defaults put on another thumb stays where it does not land on one of the two,
  // and the one-shot layers keep theirs, nothing being held there.
  const thumbIds = new Set(thumbs.map((k) => k.id));
  const have = (id: string) => geometry.keys.some((k) => k.id === id);
  const zero = ofHand(otherHand).find((id) => id !== symbolsKey);
  const roles = new Set(['L0', 'R0', numbersKey, symbolsKey]);
  const layers = defaultLayers(geometry).layers.map((l): LayerDef => {
    const bindings = Object.fromEntries(
      Object.entries(l.bindings).filter(
        ([id]) => !thumbIds.has(id) || (l.id !== numbers && (l.id !== symbols || !roles.has(id))),
      ),
    );
    if (l.id === numbers) {
      bindings[symbolsKey] = { kind: 'hold_tap', tap: kp(' '), hold: holdSymbols };
      // With no other thumb there, beside the keypad: the outer top key, or the inner column.
      const spot = zero ?? ['RTP', 'RBC', 'RHC'].find((id) => have(id) && !bindings[id]);
      if (spot) bindings[spot] = kp('0');
    }
    if (l.id === symbols && types(numbersKey, ' ')) bindings[numbersKey] = kp(' ');
    return { ...l, bindings };
  });

  return {
    ...layout,
    layers: [{ ...first, bindings: baseBindings }, ...rest, ...layers],
    combos: [...(layout.combos ?? []), deadKeysCombo(first.id)],
  };
}

/** Every character the default layers type directly, for tests and documentation. */
export function defaultLayerSymbols(): string[] {
  const out = new Set<string>([
    '0',
    ...Object.values(NUMBERS_CORE),
    ...Object.values(SYMBOLS_CORE),
  ]);
  for (const b of Object.values(DEAD_KEYS_CORE)) if (b.kind === 'kp' && b.symbol) out.add(b.symbol);
  return [...out];
}

/** The accents the Dead keys layer carries. */
export function defaultDeadKeys(): string[] {
  return Object.values(DEAD_KEYS_CORE).flatMap((b) => (b.kind === 'dead_key' ? [b.diacritic] : []));
}
