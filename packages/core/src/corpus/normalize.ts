export type CaseMode = 'fold' | 'model';

/**
 * Which classes of non-letter text survive normalisation.
 *
 * `letters` is the historical behaviour and stays the default: digits are dropped and only the
 * shared punctuation set survives. A layout with no number layer cannot type a digit, and an
 * unproducible symbol is a hard word boundary, so counting numbers has to be an explicit choice.
 */
export type TextClass = 'letters' | 'letters+digits' | 'letters+digits+symbols';

export interface NormalizeOptions {
  caseMode: CaseMode;
  /** Default `letters`. */
  textClass?: TextClass;
  /** Non-letter symbols to keep. Overrides `textClass` entirely. */
  keep?: string[];
  /** Symbols kept in the stream but treated as soft boundaries when unproducible (default `? !`). */
  soft?: string[];
  /** Extra symbols to keep, such as a language's own punctuation. */
  keepAlso?: string[];
}

export const DEFAULT_KEEP = [',', '.', "'", ';', '/', '-', '?', '!'];
export const DEFAULT_SOFT = ['?', '!'];

/** Added by `letters+digits+symbols`: the punctuation a symbol layer normally carries. */
export const SYMBOL_KEEP = [
  ':',
  '_',
  '"',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  '<',
  '>',
  '+',
  '=',
  '*',
  '&',
  '|',
  '\\',
  '#',
  '$',
  '%',
  '@',
  '^',
  '~',
  '`',
];

/** The kept set and whether digits survive, for one text class. */
export function keepSetFor(tc: TextClass): { keep: string[]; digits: boolean } {
  if (tc === 'letters') return { keep: DEFAULT_KEEP, digits: false };
  if (tc === 'letters+digits') return { keep: DEFAULT_KEEP, digits: true };
  return { keep: [...DEFAULT_KEEP, ...SYMBOL_KEEP], digits: true };
}

const QUOTE_MAP: Record<string, string> = {
  '\u2019': "'",
  '\u2018': "'",
  '\u201b': "'",
  '\u2032': "'",
  '\u201c': '',
  '\u201d': '',
  '\u00ab': '',
  '\u00bb': '',
  '\u2013': '-',
  '\u2014': '-',
  '\u2026': '.',
};

/** With a symbol layer in play the straight double quote is typeable, so curly ones fold onto it. */
const QUOTE_MAP_SYMBOLS: Record<string, string> = {
  ...QUOTE_MAP,
  '\u201c': '"',
  '\u201d': '"',
};

const LETTER_RE = /\p{L}/u;

/**
 * Whitespace that collapses to a single space. Deliberately narrower than `/\s/u`: it mirrors the
 * reference implementation, where anything outside this set is dropped like any other symbol.
 */
function isSpace(cp: number): boolean {
  return (
    cp === 0x20 ||
    cp === 0x09 ||
    cp === 0x0a ||
    cp === 0x0d ||
    cp === 0x00a0 ||
    cp === 0x2009 ||
    cp === 0x202f ||
    cp === 0x3000 ||
    (cp >= 0x2000 && cp <= 0x200a)
  );
}

function isDigit(cp: number): boolean {
  return cp >= 0x30 && cp <= 0x39;
}

/**
 * Normalize raw text into a symbol stream: a string whose words are separated by single spaces.
 * Case folding applies to the whole text before the walk, so it matches full Unicode lowercasing.
 */
export function normalizeText(text: string, opts: NormalizeOptions): string {
  const textClass = opts.textClass ?? 'letters';
  const profile = keepSetFor(textClass);
  const keep = new Set([...(opts.keep ?? profile.keep), ...(opts.keepAlso ?? [])]);
  const dropDigits = !profile.digits;
  const quotes = textClass === 'letters+digits+symbols' ? QUOTE_MAP_SYMBOLS : QUOTE_MAP;
  const fold = opts.caseMode === 'fold';
  let nfc = text.normalize('NFC');
  if (fold) nfc = nfc.toLowerCase();

  const out: string[] = [];
  let lastSpace = true;
  for (const raw of nfc) {
    let ch = raw;
    const mapped = quotes[ch];
    if (mapped !== undefined) {
      if (mapped === '') continue;
      ch = mapped;
    }
    const cp = ch.codePointAt(0) as number;
    if (isSpace(cp)) {
      if (!lastSpace) {
        out.push(' ');
        lastSpace = true;
      }
      continue;
    }
    if (LETTER_RE.test(ch)) {
      out.push(ch);
      lastSpace = false;
      continue;
    }
    if (isDigit(cp)) {
      if (dropDigits) continue;
      out.push(ch);
      lastSpace = false;
      continue;
    }
    if (keep.has(ch)) {
      out.push(ch);
      lastSpace = false;
    }
    // Anything else is dropped without affecting the space state.
  }
  if (out.length && out[out.length - 1] === ' ') out.pop();
  return out.join('');
}

/** Word list of a normalized stream. */
export function words(stream: string): string[] {
  return stream.split(' ').filter((w) => w.length > 0);
}

export interface CorpusFacts {
  symbols: number;
  words: number;
  unigram: Map<string, number>;
  bigram: Map<string, number>;
  trigram: Map<string, number>;
  skip1: Map<string, number>;
  wordFreq: Map<string, number>;
}

/** Symbol-level n-gram statistics of a normalized stream (word boundaries reset the n-gram window). */
export function corpusFacts(stream: string, crossWord: 'reset' | 'bridge' = 'reset'): CorpusFacts {
  const uni = new Map<string, number>();
  const bi = new Map<string, number>();
  const tri = new Map<string, number>();
  const sk = new Map<string, number>();
  const words = new Map<string, number>();
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  let a = '';
  let b = '';
  let word = '';
  let wordCount = 0;
  let symbols = 0;
  for (const s of stream) {
    if (s === ' ') {
      if (word.length) {
        inc(words, word);
        wordCount++;
        word = '';
      }
      if (crossWord === 'reset') {
        a = '';
        b = '';
      }
      continue;
    }
    symbols++;
    word += s;
    inc(uni, s);
    if (b) inc(bi, b + s);
    if (a && b) {
      inc(tri, a + b + s);
      inc(sk, a + s);
    }
    a = b;
    b = s;
  }
  if (word.length) {
    inc(words, word);
    wordCount++;
  }
  return {
    symbols,
    words: wordCount,
    unigram: uni,
    bigram: bi,
    trigram: tri,
    skip1: sk,
    wordFreq: words,
  };
}
