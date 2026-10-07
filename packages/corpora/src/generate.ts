/**
 * Builds a corpus from a word-frequency list.
 *
 *   pnpm corpora:generate                 # every language with a fetched list
 *   pnpm corpora:generate en pt_br es fr  # just these
 *
 * The method the Romak work corpora this replaced were made with — sample words in proportion to
 * how often they are used — from real counts rather than 180 words a model listed, and shaped into
 * sentences, capitalised and punctuated. Those were shuffled word bags, so nothing in them ever
 * started a sentence with a capital, and any analysis of shift or sentence-case modelling measured
 * that artifact instead of the layout.
 *
 * Deterministic: the same list produces the same text byte for byte, so a rebuild is a no-op.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { languageProfile } from '@layerbench/core/lang';

const here = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(here, '..', 'raw');
const FREQ_DIR = join(RAW_DIR, 'freq');

const YEAR = '2018';
/** Enough text that a one-megabyte sample never runs short. */
const TARGET_BYTES = 1_150_000;
/** Words to draw from. Beyond this the tail is mostly names and other languages' words. */
const VOCABULARY = 8000;

const LANGS = ['es', 'fr', 'it', 'pt', 'pt_br', 'en'];

/** The raw file a list's text is written to, named the way corpus ids are: `pt-br`, not `pt_br`. */
function outputName(lang: string): string {
  return `${lang.replace('_', '-')}-conversational.txt`;
}

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

/**
 * The lists count words the way a tokenizer split them, so `don't` is counted as `don` and `'t`
 * and `l'homme` as `l'` and `homme`. Written text has them joined; these put them back.
 */

/** Single letters that are words of the language; any other is a fragment of a split word. */
const LETTER_WORDS: Record<string, string[]> = {
  en: ['a', 'i'],
  es: ['a', 'e', 'o', 'u', 'y'],
  fr: ['a', 'à', 'y'],
  it: ['a', 'e', 'è', 'i', 'o'],
  pt: ['a', 'à', 'e', 'é', 'o'],
  pt_br: ['a', 'à', 'e', 'é', 'o'],
};

/** Stems an English negation was split from, only ever written with their `'t`. */
const EN_NEGATIVE_STEMS = [
  'ain',
  'aren',
  'couldn',
  'didn',
  'doesn',
  'don',
  'hadn',
  'hasn',
  'haven',
  'isn',
  'mustn',
  'needn',
  'shouldn',
  'wasn',
  'weren',
  'wouldn',
];

/**
 * Words `'s` never follows: pronouns that have their own possessive, articles, and the words that
 * join or qualify rather than name something. Anything else takes it, as a possessive or as `is`.
 */
const EN_NO_S = new Set([
  'a',
  'am',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'for',
  'from',
  'had',
  'has',
  'have',
  'her',
  'him',
  'his',
  'i',
  'if',
  'in',
  'is',
  'its',
  'me',
  'my',
  'no',
  'not',
  'of',
  'on',
  'or',
  'our',
  'so',
  'than',
  'the',
  'their',
  'them',
  'they',
  'to',
  'us',
  'was',
  'we',
  'were',
  'will',
  'with',
  'you',
  'your',
]);

/** English clitics, and the words each follows in speech; `any` is the possessive `'s`. */
const EN_CLITIC_HOSTS: Record<string, readonly string[] | 'any'> = {
  "'s": 'any',
  "'t": ['can', 'won', ...EN_NEGATIVE_STEMS],
  "'m": ['i'],
  "'re": ['you', 'we', 'they', 'who', 'what', 'there', 'here'],
  "'ll": ['i', 'you', 'he', 'she', 'it', 'we', 'they', 'that', 'there', 'who', 'this'],
  "'ve": ['i', 'you', 'we', 'they', 'could', 'would', 'should', 'might', 'must', 'who'],
  "'d": ['i', 'you', 'he', 'she', 'it', 'we', 'they', 'that', 'who', 'there'],
};

/**
 * Where a clitic drawn after a word that cannot take it is written instead, so each is written as
 * often as it was counted: `'m` is always `I'm`. `'t` goes only on the two hosts that are words of
 * their own, since every other stem is written with its `'t` whenever it is drawn.
 */
const EN_CLITIC_FALLBACK: Record<string, readonly string[]> = {
  "'s": ['it', 'that', 'he', 'she', 'what', 'there', 'here', 'who', 'let', 'where', 'how'],
  "'t": ['can', 'won'],
  "'m": ['i'],
};

/** French elisions, written joined to a next word starting with a vowel or an h. */
const FR_ELISIONS = [
  "c'",
  "d'",
  "j'",
  "jusqu'",
  "l'",
  "lorsqu'",
  "m'",
  "n'",
  "puisqu'",
  "qu'",
  "quelqu'",
  "s'",
  "t'",
];

function isElision(lang: string, word: string): boolean {
  if (lang === 'fr') return FR_ELISIONS.includes(word);
  // Italian elides the same way; `po'`, short for `poco`, stands on its own.
  if (lang === 'it') return word.endsWith("'") && word !== "po'";
  return false;
}

function isClitic(lang: string, word: string): boolean {
  return lang === 'en' && Object.hasOwn(EN_CLITIC_HOSTS, word);
}

/** Can this clitic go on the word before it? Never on a word that already has one. */
function takesClitic(host: string, clitic: string): boolean {
  const word = host.toLowerCase();
  if (word.includes("'")) return false;
  const hosts = EN_CLITIC_HOSTS[clitic];
  return hosts === 'any' ? !EN_NO_S.has(word) : hosts.includes(word);
}

const VOWEL_OR_H = /^[aeiouyhàâäéèêëîïôöùûüœæ]/u;

/**
 * The letters a language is written with: the Latin alphabet and its own accented letters. A word
 * with any other is a foreign name, or an `º` from a number, and would only ever be skipped.
 */
function alphabet(lang: string): Set<string> {
  const profile = languageProfile(lang.replace('_', '-'));
  return new Set([
    ...'abcdefghijklmnopqrstuvwxyz',
    ...(profile?.required ?? []),
    ...(profile?.optional ?? []),
    "'",
    '-',
  ]);
}

/** Words and weights from a `word count` list, keeping only plausible words of the language. */
function readList(lang: string): Entry[] {
  const path = join(FREQ_DIR, `${lang}-${YEAR}.txt`);
  const text = readFileSync(path, 'utf8');
  const letters = alphabet(lang);
  const out: Entry[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || line.trim() === '') continue;
    const [word, count] = line.trim().split(/\s+/);
    const n = Number(count);
    // Letters, apostrophes and hyphens only: the lists carry a little markup and numbering.
    if (!word || !Number.isFinite(n) || !/^[\p{L}'-]+$/u.test(word)) continue;
    if (![...word].every((c) => letters.has(c))) continue;
    if ([...word].length === 1 && !(LETTER_WORDS[lang] ?? []).includes(word)) continue;
    // What is left of an apostrophe is a clitic or an elision we know how to put back, or nothing.
    if (word.startsWith("'") && !isClitic(lang, word)) continue;
    if (word.endsWith("'") && !isElision(lang, word) && word !== "po'") continue;
    out.push({ word, weight: n });
    if (out.length >= VOCABULARY) break;
  }
  if (out.length < 500) throw new Error(`${path}: only ${out.length} usable words`);
  if (lang === 'en') {
    const find = (word: string) => out.find((e) => e.word === word);
    // Every `'m` was counted with the `i` before it; written as `I'm`, that `i` is already there.
    const i = find('i');
    const m = find("'m");
    if (i && m) i.weight = Math.max(0, i.weight - m.weight);
    // `'t` was counted once for every negation, and each stem writes its own; what is left is
    // `can't` and `won't`.
    const t = find("'t");
    const stems = EN_NEGATIVE_STEMS.reduce((sum, s) => sum + (find(s)?.weight ?? 0), 0);
    if (t) t.weight = Math.max(0, t.weight - stems);
  }
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
 * The lists are lowercase throughout, but English writes "I" and its contractions capitalised
 * wherever they fall; left alone, a case-modelled analysis would never see the shift they cost.
 */
function casedAsWritten(word: string, lang: string): string {
  return lang === 'en' && /^i('|$)/.test(word) ? capitalise(word) : word;
}

/** Draws before a clitic or an elision that finds no word to join is given up. */
const JOIN_TRIES = 20;

/** One of `words`, in proportion to how often each is used; null when none is in the list. */
function weightedPick(
  weights: ReadonlyMap<string, number>,
  words: readonly string[] | 'any',
  rand: () => number,
): string | null {
  if (words === 'any') return null;
  const candidates = words.filter((w) => (weights.get(w) ?? 0) > 0);
  const total = candidates.reduce((sum, w) => sum + (weights.get(w) ?? 0), 0);
  if (!(total > 0)) return null;
  let r = rand() * total;
  for (const w of candidates) {
    r -= weights.get(w) ?? 0;
    if (r < 0) return w;
  }
  return candidates[candidates.length - 1];
}

/**
 * The words of one sentence, drawn in proportion to their frequency, with each split word put back
 * together: a clitic goes on the word before it when that word takes it, and is drawn again when
 * not; an elision takes the next word that starts with a vowel or an h.
 */
function drawWords(
  entries: Entry[],
  cum: number[],
  weights: ReadonlyMap<string, number>,
  rand: () => number,
  lang: string,
  n: number,
) {
  const words: string[] = [];
  const draw = () => pick(entries, cum, rand());
  for (let tries = 0; words.length < n && tries < n * JOIN_TRIES; tries++) {
    const w = draw();
    const last = words.length - 1;
    if (isClitic(lang, w)) {
      if (last >= 0 && takesClitic(words[last], w)) words[last] += w;
      else {
        const host = weightedPick(weights, EN_CLITIC_FALLBACK[w] ?? EN_CLITIC_HOSTS[w], rand);
        if (host) words.push(host + w);
      }
      continue;
    }
    if (isElision(lang, w)) {
      for (let k = 0; k < JOIN_TRIES; k++) {
        const next = draw();
        if (VOWEL_OR_H.test(next) && !isElision(lang, next) && !isClitic(lang, next)) {
          words.push(w + next);
          break;
        }
      }
      continue;
    }
    words.push(lang === 'en' && EN_NEGATIVE_STEMS.includes(w) ? `${w}'t` : w);
  }
  return words.map((w) => casedAsWritten(w, lang));
}

/**
 * Sentences of four to fourteen words, with the occasional comma, and the sentence-ending mark
 * chosen in roughly the proportion running text uses.
 */
function generate(entries: Entry[], seed: number, lang: string): string {
  const cum = cumulative(entries);
  const weights = new Map(entries.map((e) => [e.word, e.weight]));
  const rand = rng(seed);
  const parts: string[] = [];
  let bytes = 0;
  while (bytes < TARGET_BYTES) {
    const length = 4 + Math.floor(rand() * 11);
    const words = drawWords(entries, cum, weights, rand, lang, length);
    if (words.length === 0) continue;
    words[0] = capitalise(words[0]);
    // A comma every so often, never on the first two words or the last.
    for (let i = 2; i < words.length - 1; i++) if (rand() < 0.06) words[i] += ',';
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
    const text = generate(entries, seed, lang);
    const name = outputName(lang);
    writeFileSync(join(RAW_DIR, name), text);
    console.log(
      `${lang}: ${entries.length} words -> raw/${name} (${Math.round(Buffer.byteLength(text) / 1000)} kB)`,
    );
  }
  if (missing.length > 0) {
    console.log(
      `\nNo frequency list for: ${missing.join(', ')}. Run \`pnpm corpora:fetch\` first.`,
    );
  }
}

main();
