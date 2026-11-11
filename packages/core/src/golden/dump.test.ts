import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { describe, it } from 'vitest';
import { toCanonicalJson } from '../layout/json.js';
import { bundledLayout, documentedLayout } from '../layouts/index.js';
import { goldenDocuments } from './documents.js';
import { inlineBlob } from './inline-blob.js';
import { goldenPath } from './paths.js';
import { buildGoldenReport, goldenMatrix, goldenName } from './report.js';

const WRITE = process.env.GOLDENS === '1';

/**
 * Regenerates every golden report, bundled layout document and the inline share blob from this
 * engine.
 *
 * It runs through vitest because that is the repository's only TypeScript runner, and because
 * resolving `golden/` and `fixtures/` exactly the way the parity suite does is the whole point: a
 * bundled script would resolve them from its own output directory instead.
 *
 * Run with `pnpm goldens`, then review the diff. On a clean tree it must produce no change; a dirty
 * tree means the engine's output moved.
 */
describe.skipIf(!WRITE)('golden dump (GOLDENS=1)', () => {
  it('writes every report, layout document and the inline blob', () => {
    mkdirSync(goldenPath('layouts'), { recursive: true });
    const cases = goldenMatrix();
    const expected = new Set(cases.map(goldenName));

    // Documents first: the parity suite resolves a report's layout from `layouts/`, so writing the
    // reports before the documents they describe would pin them against the previous keymap.
    for (const layout of goldenDocuments()) {
      writeFileSync(
        goldenPath(`layouts/${layout.id}.json`),
        JSON.stringify(toCanonicalJson(layout)),
      );
    }

    for (const c of cases) {
      const report = buildGoldenReport(c, documentedLayout(c.layout));
      writeFileSync(goldenPath(goldenName(c)), JSON.stringify(report));
    }

    // A report file with no case behind it is read by nothing and would drift silently.
    for (const f of readdirSync(goldenPath('.'))) {
      if (f.endsWith('.json') && !expected.has(f)) unlinkSync(goldenPath(f));
    }

    // The share-link blob: `?layout=inline:…` round-trips through this exact framing. A file that
    // holds the same text is left as it is: another Node's zlib writes other bytes for it.
    const magic = bundledLayout('magic-romak');
    if (magic) {
      const path = goldenPath('inline-magic-romak.txt');
      const encoded = JSON.stringify(toCanonicalJson(magic));
      const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
      writeFileSync(path, inlineBlob(existing, encoded));
    }
  }, 300_000);
});
