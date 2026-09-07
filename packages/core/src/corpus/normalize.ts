export type CaseMode = 'fold' | 'model';

export interface NormalizeOptions {
  caseMode: CaseMode;
  /** Non-letter symbols to keep (default `, . ' ; / -` plus `? !`). */
  keep?: string[];
  /** Symbols kept in the stream but treated as soft boundaries when unproducible (default `? !`). */
  soft?: string[];
  /** Drop digits (default true; numbers are out of scope in v1). */
  dropDigits?: boolean;
}

export const DEFAULT_KEEP = [',', '.', "'", ';', '/', '-', '?', '!'];
export const DEFAULT_SOFT = ['?', '!'];

const QUOTE_MAP: Record<string, string> = {
  '’': "'",
  '‘': "'",
  '‛': "'",
  '′': "'",
  '“': '',
  '”': '',
  '«': '',
  '»': '',
  '–': '-',
  '—': '-',
  '…': '.',
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
  const keep = new Set(opts.keep ?? DEFAULT_KEEP);
  const dropDigits = opts.dropDigits ?? true;
  const fold = opts.caseMode === 'fold';
  let nfc = text.normalize('NFC');
  if (fold) nfc = nfc.toLowerCase();

  const out: string[] = [];
  let lastSpace = true;
  for (const raw of nfc) {
    let ch = raw;
    const mapped = QUOTE_MAP[ch];
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
