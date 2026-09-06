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
 * Normalize raw text into a symbol stream (one grapheme per entry; words separated by single spaces).
 * Newlines and other whitespace collapse to a single space.
 */
export function normalizeText(text: string, opts: NormalizeOptions): string[] {
  const keep = new Set(opts.keep ?? DEFAULT_KEEP);
  const dropDigits = opts.dropDigits ?? true;
  const fold = opts.caseMode === 'fold';
  const out: string[] = [];
  let lastSpace = true;
  const nfc = text.normalize('NFC');
  for (const raw of nfc) {
    let ch = raw;
    if (QUOTE_MAP[ch] !== undefined) ch = QUOTE_MAP[ch];
    if (ch === '') continue;
    if (/\s/u.test(ch)) {
      if (!lastSpace) {
        out.push(' ');
        lastSpace = true;
      }
      continue;
    }
    if (LETTER_RE.test(ch)) {
      out.push(fold ? ch.toLocaleLowerCase() : ch);
      lastSpace = false;
      continue;
    }
    if (/\p{N}/u.test(ch)) {
      if (dropDigits) continue;
      out.push(ch);
      lastSpace = false;
      continue;
    }
    if (keep.has(ch)) {
      out.push(ch);
      lastSpace = false;
      continue;
    }
    // Dropped symbol: acts as a soft separator only if it sat between letters without spaces (e.g. "word\"word").
  }
  if (out.length && out[out.length - 1] === ' ') out.pop();
  return out;
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
export function corpusFacts(stream: string[], crossWord: 'reset' | 'bridge' = 'reset'): CorpusFacts {
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
  return { symbols, words: wordCount, unigram: uni, bigram: bi, trigram: tri, skip1: sk, wordFreq: words };
}
