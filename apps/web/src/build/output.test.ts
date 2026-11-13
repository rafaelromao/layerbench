import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assertSafeBuildOutput,
  type BuildChunk,
  type BuildOutputBundle,
  CHUNK_WARNING_LIMIT_KB,
  eagerGzipBytes,
  INITIAL_GZIP_BUDGET,
} from './output.js';

function chunk(
  fileName: string,
  code: string,
  options: { imports?: string[]; entry?: boolean } = {},
): BuildChunk {
  return {
    type: 'chunk',
    fileName,
    name: fileName,
    isEntry: options.entry ?? false,
    imports: options.imports ?? [],
    code,
  };
}

function bundle(...chunks: BuildChunk[]): BuildOutputBundle {
  return {
    ...Object.fromEntries(chunks.map((item) => [item.fileName, item])),
    'index.html': {
      type: 'asset',
      fileName: 'index.html',
      source: '<script type="module" src="/assets/index.js"></script>',
    },
  } as BuildOutputBundle;
}

describe('production JavaScript output', () => {
  it('counts the entry and its static import closure against the 250 KiB gzip budget', () => {
    expect(INITIAL_GZIP_BUDGET).toBe(250 * 1024);
    const shared = chunk('assets/shared.js', 'export const shared = 1;');
    const entry = chunk('assets/index.js', 'import { shared } from "./shared.js";', {
      imports: [shared.fileName],
      entry: true,
    });

    expect(eagerGzipBytes(bundle(entry, shared))).toBeLessThanOrEqual(200 * 1024);

    const oversized = chunk(
      'assets/index.js',
      `export const data = ${JSON.stringify(randomBytes(300_000).toString('base64'))};`,
      { entry: true },
    );
    expect(() => eagerGzipBytes(bundle(oversized))).toThrow(/250 KiB gzip/);
  });

  it('rejects inline scripts and unsafe code in every emitted chunk, including lazy chunks', () => {
    const entry = chunk('assets/index.js', 'export {};', { entry: true });
    const lazy = chunk('assets/AnalyzeView.js', 'eval("blocked")');
    const output = bundle(entry, lazy);
    output['index.html'] = {
      type: 'asset',
      fileName: 'index.html',
      source: '<script type="module" src="/assets/index.js"></script>',
    };

    expect(() => assertSafeBuildOutput(output)).toThrow(/AnalyzeView\.js contains eval\(/);
    lazy.code = 'new Function("return 1")';
    expect(() => assertSafeBuildOutput(output)).toThrow(/AnalyzeView\.js contains new Function\(/);

    output['index.html'] = {
      type: 'asset',
      fileName: 'index.html',
      source: '<script>window.blocked = true</script>',
    };
    lazy.code = 'export {};';
    expect(() => assertSafeBuildOutput(output)).toThrow(/index.html has an inline script/);
  });

  it('rejects unsafe JavaScript emitted as an asset, including the analysis worker', () => {
    const entry = chunk('assets/index.js', 'export {};', { entry: true });
    const worker: { type: 'asset'; fileName: string; source: string | Uint8Array } = {
      type: 'asset',
      fileName: 'assets/analysis.worker.js',
      source: 'eval("blocked")',
    };
    const output = bundle(entry);
    output[worker.fileName] = worker;

    expect(() => assertSafeBuildOutput(output)).toThrow(/analysis\.worker\.js contains eval\(/);

    worker.source = new TextEncoder().encode('new Function("return 1")');
    expect(() => assertSafeBuildOutput(output)).toThrow(
      /analysis\.worker\.js contains new Function\(/,
    );
  });

  it('rejects an emitted JavaScript chunk above Vite’s 500 kB warning threshold', () => {
    expect(CHUNK_WARNING_LIMIT_KB).toBe(500);
    const entry = chunk('assets/index.js', 'export {};', { entry: true });
    const large = chunk('assets/large.js', 'x'.repeat(500_001));
    expect(() => assertSafeBuildOutput(bundle(entry, large))).toThrow(/500 kB warning threshold/);
  });
});
