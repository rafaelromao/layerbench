import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { describe, it } from 'vitest';
import { toCanonicalJson } from '../layout/json.js';
import { bundledLayout, documentedLayout, documentedLayouts } from '../layouts/index.js';
import { goldenPath } from './paths.js';
import { buildGoldenReport, goldenMatrix, goldenName } from './report.js';

const WRITE = process.env.GOLDENS === '1';

/**
 * Regenerates every golden report, bundled layout document and the inline share blob from this
 * engine — the artefact that has been missing since the Elixir reference left the working tree.
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
    for (const layout of documentedLayouts()) {
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

    // The share-link blob: `?layout=inline:…` round-trips through this exact framing.
    const magic = bundledLayout('magic-romak');
    if (magic) {
      const encoded = JSON.stringify(toCanonicalJson(magic));
      writeFileSync(
        goldenPath('inline-magic-romak.txt'),
        deflateSync(Buffer.from(encoded, 'utf8')).toString('base64url'),
      );
    }
  }, 300_000);
});
