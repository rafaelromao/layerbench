/**
 * Turns the raw corpus sources into the files the web app serves.
 *
 * For each entry in `raw/sources.json`: take the text's sentences, one per line, in an order that
 * looks random but never changes, normalize each, and keep whole sentences up to one megabyte; then
 * write `apps/web/public/corpora/<id>/{sample.txt,manifest.json}` and an `index.json` listing every
 * manifest. The same raw text always builds the same sample, byte for byte.
 *
 *   pnpm corpora               # build all
 *   pnpm corpora en-general    # build one
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeText, scrubContacts, words as splitWords } from '@layerbench/core/corpus';
import { languageKeep } from '@layerbench/core/lang';

const MAX_SAMPLE_BYTES = 1_000_000;

const here = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(here, '..', 'raw');
const OUT_DIR = join(here, '..', '..', '..', 'apps', 'web', 'public', 'corpora');

interface Source {
  file: string;
  name: string;
  language: string;
  license: string;
  source: string;
  description: string;
  /** When the source text was downloaded, for corpora fetched from the web. */
  retrieved?: string;
}

interface Manifest {
  built_at: string;
  description: string;
  id: string;
  language: string;
  license: string;
  name: string;
  retrieved?: string;
  source: string;
  symbols: number;
  words: number;
  /** Which non-letter classes the sample keeps; the analysis narrows from here. */
  text_class: string;
}

/**
 * A sentence's place in the sample: a hash of its text (32-bit FNV-1a). Leipzig's files are sorted
 * alphabetically, and an analysis reads a sample from its start, so in file order it would only ever
 * see sentences from `$` to `B`; ordered by hash, any stretch of the sample is a fair draw.
 */
function placeOf(sentence: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < sentence.length; i++) {
    h ^= sentence.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A letter of another script: mis-decoded text, or a name the language does not write. */
const NON_LATIN_LETTER = /[^\P{L}\p{Script=Latin}]/u;

/**
 * The sentences of a raw text, one per line, without those holding letters of another script, in
 * the order of `placeOf`.
 */
function sentences(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !NON_LATIN_LETTER.test(line))
    .map((line) => ({ line, place: placeOf(line) }))
    .sort((a, b) => a.place - b.place || (a.line < b.line ? -1 : a.line > b.line ? 1 : 0))
    .map(({ line }) => line);
}

/** The sample keeps everything; each analysis narrows it to the class the reader asked for. */
const SAMPLE_TEXT_CLASS = 'letters+digits+symbols';

function build(id: string, meta: Source, previous?: Manifest): Manifest {
  const raw = readFileSync(join(RAW_DIR, meta.file), 'utf8');
  const keepAlso = languageKeep(meta.language);
  // News text quotes people's phone numbers and addresses; the sample keeps their shape only.
  const kept: string[] = [];
  let bytes = 0;
  for (const sentence of sentences(scrubContacts(raw))) {
    const text = normalizeText(sentence, {
      caseMode: 'model',
      textClass: SAMPLE_TEXT_CLASS,
      keepAlso,
    });
    if (text.length === 0) continue;
    const size = Buffer.byteLength(text) + (kept.length > 0 ? 1 : 0);
    if (bytes + size > MAX_SAMPLE_BYTES) break;
    kept.push(text);
    bytes += size;
  }
  const sample = kept.join(' ');
  const wordCount = splitWords(sample).length;
  const dir = join(OUT_DIR, id);
  const unchanged = previous !== undefined && readIfPresent(join(dir, 'sample.txt')) === sample;

  const manifest: Manifest = {
    // Metadata only, and preserved when the sample itself did not move: a fresh timestamp on every
    // run would dirty every output file for nothing.
    built_at: unchanged ? previous.built_at : new Date().toISOString(),
    description: meta.description,
    id,
    language: meta.language,
    license: meta.license,
    name: meta.name,
    ...(meta.retrieved ? { retrieved: meta.retrieved } : {}),
    source: meta.source,
    symbols: [...sample].length - wordCount + 1,
    words: wordCount,
    text_class: SAMPLE_TEXT_CLASS,
  };

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'sample.txt'), sample);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  const kb = Math.round(new TextEncoder().encode(sample).length / 1000);
  console.log(`${id}: ${kb} kB, ${wordCount} words, ${manifest.symbols} symbols`);
  return manifest;
}

function readIfPresent(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function main(): void {
  const sources: Record<string, Source> = JSON.parse(
    readFileSync(join(RAW_DIR, 'sources.json'), 'utf8'),
  );
  const requested = process.argv.slice(2);
  const ids = requested.length > 0 ? requested : Object.keys(sources).sort();

  // The index is what the browser's picker reads, so it is rewritten on every run — a partial
  // build used to leave it describing corpora that had since changed.
  const previous = new Map<string, Manifest>(
    (JSON.parse(readIfPresent(join(OUT_DIR, 'index.json')) ?? '[]') as Manifest[]).map((m) => [
      m.id,
      m,
    ]),
  );

  const built = new Map<string, Manifest>();
  const missing: string[] = [];
  for (const id of ids) {
    const meta = sources[id];
    if (!meta) throw new Error(`unknown corpus id: ${id}`);
    if (readIfPresent(join(RAW_DIR, meta.file)) === null) {
      missing.push(`${id} (${meta.file})`);
      continue;
    }
    built.set(id, build(id, meta, previous.get(id)));
  }

  const manifests = Object.keys(sources)
    .sort()
    .map((id) => built.get(id) ?? previous.get(id))
    .filter((m): m is Manifest => m !== undefined);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(manifests));
  console.log(`index.json: ${manifests.length} corpora`);

  if (missing.length > 0) {
    console.log(
      `\nNo raw text yet for: ${missing.join(', ')}.\n` +
        'packages/corpora/README.md says where each comes from; then run `pnpm corpora` again.',
    );
  }
}

main();
