/**
 * Turns the raw corpus sources into the files the web app serves.
 *
 * For each entry in `raw/sources.json`: normalize the text, cap it at one megabyte cut on a
 * sentence boundary, then write `apps/web/public/corpora/<id>/{sample.txt,manifest.json}` and an
 * `index.json` listing every manifest. The output is byte-for-byte what the reference
 * implementation produced, so analyses stay comparable across the two engines.
 *
 *   pnpm corpora            # build all
 *   pnpm corpora en-conv    # build one
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeText, scrubContacts, words as splitWords } from '@layoutmaster/core/corpus';
import { languageKeep } from '@layoutmaster/core/lang';

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
  /** True when the text was produced from a word-frequency list rather than sampled from writing. */
  generated?: boolean;
  /** When the source text was downloaded, for corpora fetched from the web. */
  retrieved?: string;
}

interface Manifest {
  built_at: string;
  description: string;
  generated?: boolean;
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

const SENTENCE_ENDS = new Set(['.'.charCodeAt(0), '!'.charCodeAt(0), '?'.charCodeAt(0)]);
const SPACE = ' '.charCodeAt(0);

/**
 * Cap the text at `maxBytes`, cutting after the last sentence end so sentence-case modeling still
 * sees well-formed input. Slicing by bytes can split a character; the sentence cut discards it.
 */
function cap(text: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) return text;
  const head = bytes.subarray(0, maxBytes);
  let cut = -1;
  for (let i = head.length - 2; i >= 0; i--) {
    if (SENTENCE_ENDS.has(head[i]) && head[i + 1] === SPACE) {
      cut = i;
      break;
    }
  }
  const kept = cut === -1 ? head : head.subarray(0, cut + 1);
  return new TextDecoder('utf-8').decode(kept).trim();
}

/** The sample keeps everything; each analysis narrows it to the class the reader asked for. */
const SAMPLE_TEXT_CLASS = 'letters+digits+symbols';

function build(id: string, meta: Source, previous?: Manifest): Manifest {
  const raw = readFileSync(join(RAW_DIR, meta.file), 'utf8');
  // News text quotes people's phone numbers and addresses; the sample keeps their shape only.
  const sample = cap(
    normalizeText(scrubContacts(raw), {
      caseMode: 'model',
      textClass: SAMPLE_TEXT_CLASS,
      keepAlso: languageKeep(meta.language),
    }),
    MAX_SAMPLE_BYTES,
  );
  const wordCount = splitWords(sample).length;
  const dir = join(OUT_DIR, id);
  const unchanged = previous !== undefined && readIfPresent(join(dir, 'sample.txt')) === sample;

  const manifest: Manifest = {
    // Metadata only, and preserved when the sample itself did not move: a fresh timestamp on every
    // run would dirty every output file for nothing.
    built_at: unchanged ? previous.built_at : new Date().toISOString(),
    description: meta.description,
    ...(meta.generated ? { generated: true } : {}),
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
        'Run `pnpm corpora:fetch` to download the sources, then `pnpm corpora` again.',
    );
  }
}

main();
