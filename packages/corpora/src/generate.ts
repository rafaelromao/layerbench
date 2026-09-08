/**
 * Builds a corpus from a word-frequency list.
 *
 *   pnpm corpora:generate           # every language with a fetched list
 *   pnpm corpora:generate es fr     # just these
 *
 * This is the method the existing `en-work` and `pt-br-work` corpora were made with — sample words
 * in proportion to how often they are used — with one improvement: the output is shaped into
 * sentences, capitalised and punctuated. Those two files are shuffled word bags, so nothing in them
 * ever starts a sentence with a capital, and any analysis of shift or sentence-case modelling
 * measures that artifact instead of the layout.
 *
 * Deterministic: the same list produces the same text byte for byte, so a rebuild is a no-op.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(here, '..', 'raw');
const FREQ_DIR = join(RAW_DIR, 'freq');

const YEAR = '2018';
/** Enough text that a one-megabyte sample never runs short. */
const TARGET_BYTES = 1_150_000;
/** Words to draw from. Beyond this the tail is mostly names and other languages' words. */
const VOCABULARY = 8000;

const LANGS = ['es', 'fr', 'it', 'pt', 'en'];

/** A small deterministic generator: mulberry32. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Entry {
  word: string;
  weight: number;
}

/** Words and weights from a `word count` list, keeping only plausible words of the language. */
function readList(lang: string): Entry[] {
  const path = join(FREQ_DIR, `${lang}-${YEAR}.txt`);
  const text = readFileSync(path, 'utf8');
  const out: Entry[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || line.trim() === '') continue;
    const [word, count] = line.trim().split(/\s+/);
    const n = Number(count);
    // Letters, apostrophes and hyphens only: the lists carry a little markup and numbering.
    if (!word || !Number.isFinite(n) || !/^[\p{L}'-]+$/u.test(word)) continue;
    out.push({ word, weight: n });
    if (out.length >= VOCABULARY) break;
  }
  if (out.length < 500) throw new Error(`${path}: only ${out.length} usable words`);
  return out;
}

/** Cumulative weights, so a word can be drawn in proportion to its frequency. */
function cumulative(entries: Entry[]): number[] {
  const out: number[] = [];
  let total = 0;
  for (const e of entries) {
    total += e.weight;
    out.push(total);
  }
  return out;
}

function pick(entries: Entry[], cum: number[], r: number): string {
  const target = r * cum[cum.length - 1];
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return entries[lo].word;
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Sentences of four to fourteen words, with the occasional comma, and the sentence-ending mark
 * chosen in roughly the proportion running text uses.
 */
function generate(entries: Entry[], seed: number): string {
  const cum = cumulative(entries);
  const rand = rng(seed);
  const parts: string[] = [];
  let bytes = 0;
  while (bytes < TARGET_BYTES) {
    const length = 4 + Math.floor(rand() * 11);
    const words: string[] = [];
    for (let i = 0; i < length; i++) {
      let w = pick(entries, cum, rand());
      if (i === 0) w = capitalise(w);
      // A comma every so often, never on the last word.
      if (i > 1 && i < length - 1 && rand() < 0.06) w += ',';
      words.push(w);
    }
    const r = rand();
    const sentence = `${words.join(' ')}${r < 0.8 ? '.' : r < 0.92 ? '?' : '!'}`;
    parts.push(sentence);
    bytes += Buffer.byteLength(sentence, 'utf8') + 1;
  }
  return `${parts.join(' ')}\n`;
}

function main(): void {
  const requested = process.argv.slice(2);
  const langs = requested.length > 0 ? requested : LANGS;
  mkdirSync(RAW_DIR, { recursive: true });
  const missing: string[] = [];
  for (const lang of langs) {
    if (!LANGS.includes(lang)) throw new Error(`unknown language: ${lang}`);
    let entries: Entry[];
    try {
      entries = readList(lang);
    } catch {
      missing.push(lang);
      continue;
    }
    // Seeded from the language, so each corpus is stable and they are not copies of each other.
    const seed = [...lang].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
    const text = generate(entries, seed);
    const path = join(RAW_DIR, `${lang}-conversational.txt`);
    writeFileSync(path, text);
    console.log(
      `${lang}: ${entries.length} words -> raw/${lang}-conversational.txt (${Math.round(Buffer.byteLength(text) / 1000)} kB)`,
    );
  }
  if (missing.length > 0) {
    console.log(
      `\nNo frequency list for: ${missing.join(', ')}. Run \`pnpm corpora:fetch\` first.`,
    );
  }
}

main();
