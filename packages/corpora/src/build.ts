/**
 * Turns the raw corpus sources into the files the web app serves.
 *
 * For each entry in `raw/sources.json`: normalize the text, cap it at one megabyte cut on a
 * sentence boundary, then write `apps/web/public/corpora/<id>/{sample.txt,manifest.json}` and an
 * `index.json` listing every manifest. The output is byte-for-byte what the reference
 * implementation produced, so analyses stay comparable across the two engines.
 *
 *   pnpm corpora            # build all
 *   pnpm corpora en-work    # build one
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeText, words as splitWords } from '@layoutmaster/core/corpus';

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
}

interface Manifest {
  built_at: string;
  description: string;
  id: string;
  language: string;
  license: string;
  name: string;
  source: string;
  symbols: number;
  words: number;
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

function build(id: string, meta: Source): Manifest {
  const raw = readFileSync(join(RAW_DIR, meta.file), 'utf8');
  const sample = cap(normalizeText(raw, { caseMode: 'model' }), MAX_SAMPLE_BYTES);
  const wordCount = splitWords(sample).length;

  const manifest: Manifest = {
    // Only metadata: the build timestamp is not part of what makes two samples comparable.
    built_at: new Date().toISOString(),
    description: meta.description,
    id,
    language: meta.language,
    license: meta.license,
    name: meta.name,
    source: meta.source,
    symbols: [...sample].length - wordCount + 1,
    words: wordCount,
  };

  const dir = join(OUT_DIR, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'sample.txt'), sample);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  const kb = Math.round(new TextEncoder().encode(sample).length / 1000);
  console.log(`${id}: ${kb} kB, ${wordCount} words, ${manifest.symbols} symbols`);
  return manifest;
}

function main(): void {
  const sources: Record<string, Source> = JSON.parse(
    readFileSync(join(RAW_DIR, 'sources.json'), 'utf8'),
  );
  const requested = process.argv.slice(2);
  const ids = requested.length > 0 ? requested : Object.keys(sources).sort();

  const manifests: Manifest[] = [];
  for (const id of ids) {
    const meta = sources[id];
    if (!meta) throw new Error(`unknown corpus id: ${id}`);
    manifests.push(build(id, meta));
  }

  // The browser cannot list a directory, so the index is what the corpus picker reads.
  if (requested.length === 0) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(manifests));
    console.log(`index.json: ${manifests.length} corpora`);
  }
}

main();
