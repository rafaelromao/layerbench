import type { HostLocale, Mod } from '../layout/types.js';

/**
 * Host-side translation: what the operating system shows for a keycode + modifier set.
 * `symbols` mode bypasses this layer (bindings carry their output directly).
 */

export interface HostResult {
  /** Text produced (may be empty for dead keys or modifiers). */
  symbol: string;
  /** Diacritic set as pending dead key (US-International / ABNT2). */
  deadKey?: string;
}

const US_BASE: Record<string, [string, string]> = {
  A: ['a', 'A'],
  B: ['b', 'B'],
  C: ['c', 'C'],
  D: ['d', 'D'],
  E: ['e', 'E'],
  F: ['f', 'F'],
  G: ['g', 'G'],
  H: ['h', 'H'],
  I: ['i', 'I'],
  J: ['j', 'J'],
  K: ['k', 'K'],
  L: ['l', 'L'],
  M: ['m', 'M'],
  N: ['n', 'N'],
  O: ['o', 'O'],
  P: ['p', 'P'],
  Q: ['q', 'Q'],
  R: ['r', 'R'],
  S: ['s', 'S'],
  T: ['t', 'T'],
  U: ['u', 'U'],
  V: ['v', 'V'],
  W: ['w', 'W'],
  X: ['x', 'X'],
  Y: ['y', 'Y'],
  Z: ['z', 'Z'],
  N1: ['1', '!'],
  N2: ['2', '@'],
  N3: ['3', '#'],
  N4: ['4', '$'],
  N5: ['5', '%'],
  N6: ['6', '^'],
  N7: ['7', '&'],
  N8: ['8', '*'],
  N9: ['9', '('],
  N0: ['0', ')'],
  MINUS: ['-', '_'],
  EQUAL: ['=', '+'],
  LBKT: ['[', '{'],
  RBKT: [']', '}'],
  BSLH: ['\\', '|'],
  SEMI: [';', ':'],
  SQT: ["'", '"'],
  GRAVE: ['`', '~'],
  COMMA: [',', '<'],
  DOT: ['.', '>'],
  FSLH: ['/', '?'],
  SPACE: [' ', ' '],
  SPC: [' ', ' '],
};

const US_ALIASES: Record<string, string> = {
  APOS: 'SQT',
  APOSTROPHE: 'SQT',
  QUOTE: 'SQT',
  SEMICOLON: 'SEMI',
  COLON: 'SEMI',
  PERIOD: 'DOT',
  SLASH: 'FSLH',
  BACKSLASH: 'BSLH',
  LEFT_BRACKET: 'LBKT',
  RIGHT_BRACKET: 'RBKT',
  UNDER: 'MINUS',
  UNDERSCORE: 'MINUS',
  EXCL: 'N1',
  AT: 'N2',
  HASH: 'N3',
  DLLR: 'N4',
  PRCNT: 'N5',
  CARET: 'N6',
  AMPS: 'N7',
  STAR: 'N8',
  LPAR: 'N9',
  RPAR: 'N0',
  TILDE: 'GRAVE',
  QMARK: 'FSLH',
  DQT: 'SQT',
  PLUS: 'EQUAL',
  LBRC: 'LBKT',
  RBRC: 'RBKT',
  PIPE: 'BSLH',
  LT: 'COMMA',
  GT: 'DOT',
};
const IMPLICIT_SHIFT = new Set([
  'EXCL',
  'AT',
  'HASH',
  'DLLR',
  'PRCNT',
  'CARET',
  'AMPS',
  'STAR',
  'LPAR',
  'RPAR',
  'TILDE',
  'QMARK',
  'DQT',
  'PLUS',
  'LBRC',
  'RBRC',
  'PIPE',
  'LT',
  'GT',
  'COLON',
  'UNDER',
  'UNDERSCORE',
]);

/** US-International dead keys (unshifted / shifted usage → diacritic). */
const US_INTL_DEAD: Record<string, [string | null, string | null]> = {
  SQT: ['´', '¨'],
  GRAVE: ['`', '~'],
  N6: [null, '^'],
};

/** ABNT2 dead keys. */
const ABNT2_DEAD: Record<string, [string | null, string | null]> = {
  LBKT: ['´', '`'],
  SQT: ['~', '^'],
  N6: [null, '¨'],
};

const ABNT2_OVERRIDES: Record<string, [string, string]> = {
  SEMI: ['ç', 'Ç'],
  FSLH: [';', ':'],
  INT1: ['/', '?'],
  RBKT: ['[', '{'],
  BSLH: [']', '}'],
  GRAVE: ["'", '"'],
};

const COMPOSE: Record<string, Record<string, string>> = {
  '´': {
    a: 'á',
    e: 'é',
    i: 'í',
    o: 'ó',
    u: 'ú',
    c: 'ç',
    y: 'ý',
    A: 'Á',
    E: 'É',
    I: 'Í',
    O: 'Ó',
    U: 'Ú',
    C: 'Ç',
    Y: 'Ý',
  },
  '`': { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', A: 'À', E: 'È', I: 'Ì', O: 'Ò', U: 'Ù' },
  '~': { a: 'ã', o: 'õ', n: 'ñ', A: 'Ã', O: 'Õ', N: 'Ñ' },
  '^': { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û', A: 'Â', E: 'Ê', I: 'Î', O: 'Ô', U: 'Û' },
  '¨': { a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü', A: 'Ä', E: 'Ë', I: 'Ï', O: 'Ö', U: 'Ü' },
};

const DEAD_STANDALONE: Record<string, string> = {
  '´': "'",
  '`': '`',
  '~': '~',
  '^': '^',
  '¨': '"',
};

export interface ParsedKeycode {
  usage: string;
  mods: Mod[];
}

/** Parse ZMK-style keycodes such as `A`, `LS(A)`, `RA(COMMA)`, `LS(LC(X))`. */
export function parseKeycode(keycode: string): ParsedKeycode {
  const mods: Mod[] = [];
  let s = keycode.trim();
  const wrappers: Record<string, Mod> = {
    LS: 'LSHIFT',
    RS: 'RSHIFT',
    LC: 'LCTRL',
    RC: 'RCTRL',
    LA: 'LALT',
    RA: 'RALT',
    LG: 'LGUI',
    RG: 'RGUI',
  };
  for (;;) {
    const m = /^([LR][SCAG])\((.*)\)$/.exec(s);
    if (!m) break;
    mods.push(wrappers[m[1]]);
    s = m[2];
  }
  return { usage: s.toUpperCase(), mods };
}

export function hasShift(mods: Iterable<Mod>): boolean {
  for (const m of mods) if (m === 'LSHIFT' || m === 'RSHIFT') return true;
  return false;
}

/**
 * Translate a keycode under a modifier set for a host locale.
 * Returns null when the usage is unknown.
 */
export function translateKeycode(
  locale: HostLocale,
  keycode: string,
  extraMods: Iterable<Mod> = [],
): HostResult | null {
  const parsed = parseKeycode(keycode);
  const mods = new Set<Mod>([...parsed.mods, ...extraMods]);
  let usage = parsed.usage;
  if (IMPLICIT_SHIFT.has(usage)) mods.add('LSHIFT');
  usage = US_ALIASES[usage] ?? usage;
  const shifted = hasShift(mods);
  const ralt = mods.has('RALT');

  if (locale === 'abnt2') {
    if (ralt && usage === 'Q') return { symbol: shifted ? '?' : '/' };
    if (ralt && usage === 'W') return { symbol: '?' };
    const dead = ABNT2_DEAD[usage];
    if (dead) {
      const d = dead[shifted ? 1 : 0];
      if (d) return { symbol: '', deadKey: d };
    }
    const over = ABNT2_OVERRIDES[usage];
    if (over) return { symbol: over[shifted ? 1 : 0] };
  }
  if (locale === 'us-intl') {
    if (ralt && usage === 'COMMA') return { symbol: shifted ? 'Ç' : 'ç' };
    const dead = US_INTL_DEAD[usage];
    if (dead) {
      const d = dead[shifted ? 1 : 0];
      if (d) return { symbol: '', deadKey: d };
    }
  }
  const base = US_BASE[usage];
  if (!base) return null;
  return { symbol: base[shifted ? 1 : 0] };
}

/** Compose a pending dead key with the next symbol; returns the text to emit. */
export function composeDeadKey(deadKey: string, next: string): string {
  const table = COMPOSE[deadKey];
  if (table && table[next] !== undefined) return table[next];
  if (next === ' ') return DEAD_STANDALONE[deadKey] ?? deadKey;
  return (DEAD_STANDALONE[deadKey] ?? deadKey) + next;
}

/** Uppercase a symbol string for shift application in `symbols` mode. */
export function shiftSymbol(symbol: string, explicitShifted?: string): string {
  if (explicitShifted !== undefined) return explicitShifted;
  const upper = symbol.toUpperCase();
  return upper;
}
