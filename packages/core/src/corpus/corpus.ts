import type { CaseMode, CorpusFacts } from './normalize.js';
import { corpusFacts, normalizeText, words as splitWords } from './normalize.js';

/** What `manifest.json` holds next to every shipped corpus sample. */
export interface CorpusManifest {
  id: string;
  name: string;
  language: string;
  license?: string;
  source?: string;
  description?: string;
  symbols: number;
  words: number;
  built_at?: string;
}

export interface Corpus extends CorpusManifest {
  /** Normalized, cased text. */
  sample: string;
  custom: boolean;
}

/** Loading corpora is host-specific: the browser fetches, Node reads files. */
export interface CorpusLoader {
  list(): Promise<CorpusManifest[]>;
  load(id: string): Promise<Corpus>;
}

/** The document a corpus is stored as. */
export function corpusToDoc(c: Corpus): Record<string, unknown> {
  return {
    name: c.name,
    language: c.language,
    license: c.license,
    source: c.source,
    description: c.description,
    sample: c.sample,
    symbols: c.symbols,
    words: c.words,
  };
}

export function corpusFromDoc(id: string, doc: Record<string, unknown>): Corpus {
  const sample = (doc.sample as string) ?? '';
  return {
    id,
    name: (doc.name as string) ?? id,
    language: (doc.language as string) ?? 'custom',
    license: doc.license as string | undefined,
    source: doc.source as string | undefined,
    description: doc.description as string | undefined,
    sample,
    symbols: (doc.symbols as number) ?? 0,
    words: (doc.words as number) ?? 0,
    custom: true,
  };
}

/**
 * 64-bit FNV-1a over the sample, rendered base36. Custom corpus ids only need to be stable within
 * a session and distinct between samples; they never cross to another implementation.
 */
function sampleHash(text: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < text.length; i++) {
    h = ((h ^ BigInt(text.charCodeAt(i))) * prime) & mask;
  }
  return h.toString(36).padStart(12, '0').slice(0, 12);
}

/** Build a corpus from pasted or uploaded text. Not persisted until the user saves it. */
export function customCorpus(
  text: string,
  opts: { name?: string; language?: string } = {},
): Corpus {
  const sample = normalizeText(text, { caseMode: 'model' });
  const wordCount = splitWords(sample).length;
  return {
    id: `custom-${sampleHash(sample)}`,
    name: opts.name ?? 'Custom corpus',
    language: opts.language ?? 'custom',
    license: 'user-provided',
    sample,
    symbols: [...sample].length - wordCount + 1,
    words: wordCount,
    custom: true,
  };
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
}

function takeChars(list: string[], budget: number): string[] {
  const out: string[] = [];
  let n = 0;
  for (const s of list) {
    if (n >= budget) break;
    out.push(s);
    n += [...s].length + 1;
  }
  return out;
}

/** Round-robin the parts together, dropping repeats as the reference does. */
function interleave(lists: string[][]): string[] {
  const parts = lists.filter((l) => l.length > 0);
  if (parts.length === 0) return [];
  const max = Math.max(...parts.map((l) => l.length));
  const out: string[] = [];
  for (let i = 0; i < max; i++) {
    for (const list of parts) {
      if (i < list.length) out.push(list[i % max]);
    }
  }
  return [...new Set(out)];
}

/**
 * Blend corpora by weight, interleaving whole sentences so the mix keeps roughly the requested
 * share of each source.
 */
export function mixCorpora(weighted: [Corpus, number][], maxChars = 1_500_000): Corpus {
  const totalW = weighted.reduce((acc, [, w]) => acc + w, 0);
  const parts = weighted
    .filter(([, w]) => w > 0)
    .map(([c, w]) => takeChars(sentences(c.sample), Math.trunc((maxChars * w) / totalW)));
  const sample = interleave(parts).join(' ');
  const languages = [...new Set(weighted.map(([c]) => c.language))];
  return {
    id: `mix-${weighted.map(([c, w]) => `${c.id}:${w}`).join('+')}`,
    name: 'Mix',
    language: languages.join('+'),
    license: 'see components',
    sample,
    symbols: [...sample].length,
    words: splitWords(sample).length,
    custom: false,
  };
}

const streamCache = new Map<string, string>();

/** The normalized symbol stream for a corpus, memoized per case mode. */
export function corpusStream(corpus: Corpus, caseMode: CaseMode): string {
  const key = `${corpus.id}|${caseMode}`;
  const hit = streamCache.get(key);
  if (hit !== undefined) return hit;
  const s = normalizeText(corpus.sample, { caseMode });
  if (!corpus.custom) streamCache.set(key, s);
  return s;
}

/** Letter, bigram, trigram and word frequencies over a sample of the folded stream. */
export function corpusSampleFacts(corpus: Corpus, maxSymbols = 300_000): CorpusFacts {
  const stream = corpusStream(corpus, 'fold');
  return corpusFacts(stream.slice(0, maxSymbols));
}
