import { gzipSync } from 'node:zlib';

export interface BuildChunk {
  type: 'chunk';
  fileName: string;
  name: string;
  isEntry: boolean;
  imports: string[];
  code: string;
}

interface BuildAsset {
  type: 'asset';
  fileName: string;
  source: string | Uint8Array;
}

export type BuildOutputBundle = Record<string, BuildChunk | BuildAsset>;

export const INITIAL_GZIP_BUDGET = 250 * 1024;
export const CHUNK_WARNING_LIMIT_KB = 500;
const CHUNK_WARNING_LIMIT_BYTES = CHUNK_WARNING_LIMIT_KB * 1000;

function chunksOf(bundle: BuildOutputBundle): BuildChunk[] {
  return Object.values(bundle).filter((item): item is BuildChunk => item.type === 'chunk');
}

/** The compressed bytes the browser must fetch for the entry and all its static imports. */
export function eagerGzipBytes(bundle: BuildOutputBundle): number {
  const chunks = chunksOf(bundle);
  const entries = chunks.filter((chunk) => chunk.isEntry);
  if (entries.length !== 1) throw new Error('The production build must have one app entry chunk.');
  const [entry] = entries;
  if (!entry) throw new Error('The production build has no app entry chunk.');

  const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const visited = new Set<string>();
  const sizes = new Map<string, number>();
  let bytes = 0;

  function visit(chunk: BuildChunk): void {
    if (visited.has(chunk.fileName)) return;
    visited.add(chunk.fileName);
    const size = gzipSync(chunk.code).byteLength;
    sizes.set(chunk.fileName, size);
    bytes += size;
    for (const fileName of chunk.imports) {
      const imported = byFile.get(fileName);
      if (!imported) throw new Error(`${chunk.fileName} imports missing chunk ${fileName}.`);
      visit(imported);
    }
  }

  visit(entry);
  if (bytes > INITIAL_GZIP_BUDGET) {
    throw new Error(
      `The Library's eagerly loaded JavaScript is ${(bytes / 1024).toFixed(1)} KiB gzip; ` +
        `the maximum is 250 KiB gzip (${[...sizes]
          .map(([file, size]) => `${file}: ${(size / 1024).toFixed(1)} KiB`)
          .join(', ')}).`,
    );
  }
  return bytes;
}

/** Fail the build if it emits code the page's script-src policy blocks or an oversized chunk. */
export function assertSafeBuildOutput(bundle: BuildOutputBundle): void {
  for (const output of Object.values(bundle)) {
    if (output.type === 'asset' && !/\.(?:[cm]?js)$/i.test(output.fileName)) continue;
    const code =
      output.type === 'chunk'
        ? output.code
        : typeof output.source === 'string'
          ? output.source
          : new TextDecoder().decode(output.source);
    const offender = /(?<![.\w])eval\(|new Function\(/.exec(code);
    if (offender) {
      throw new Error(
        `${output.fileName} contains ${offender[0]}, which "script-src 'self'" blocks. ` +
          'Replace the dependency or relax the policy deliberately.',
      );
    }
    if (output.type === 'chunk' && Buffer.byteLength(code) > CHUNK_WARNING_LIMIT_BYTES) {
      throw new Error(
        `${output.fileName} exceeds Vite's ${CHUNK_WARNING_LIMIT_KB} kB warning threshold.`,
      );
    }
  }

  const html = bundle['index.html'];
  if (html?.type === 'asset' && /<script(?![^>]*\bsrc=)/.test(String(html.source))) {
    throw new Error('index.html has an inline script, which "script-src \'self\'" blocks.');
  }

  eagerGzipBytes(bundle);
}
