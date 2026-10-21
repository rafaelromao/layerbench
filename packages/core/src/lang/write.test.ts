import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';
import { toCanonicalJson } from '../layout/json.js';
import { DOCUMENT_LAYOUTS, goldenLayouts } from '../layouts/index.js';
import { measureLanguages } from './measure.js';
import { languagesFileText } from './performance.js';

const WRITE = process.env.LANGUAGES === '1';

const layoutsFile = (rel: string) => fileURLToPath(new URL(`../layouts/${rel}`, import.meta.url));

/**
 * Not a test: the writer of each bundled layout's languages. Like `pnpm goldens`, it runs through
 * vitest because that is the repository's TypeScript runner and resolves the served corpora the way
 * the suite does.
 *
 *   pnpm languages
 *
 * It measures every bundled layout in every language (`measure.ts`), then writes the languages of
 * the layouts written in code to `layouts/languages.json`, and those of a layout added as a
 * document into its own file. Then run `pnpm goldens`, since the documents of the layouts written in
 * code carry their languages, and review the diff.
 */
describe.skipIf(!WRITE)('languages writer (LANGUAGES=1)', () => {
  it('writes the languages each bundled layout performs well in', {
    timeout: 300_000,
  }, async () => {
    const measured = await measureLanguages();
    writeFileSync(
      layoutsFile('languages.json'),
      languagesFileText(goldenLayouts().map((l) => [l.id as string, measured[l.id as string]])),
    );
    for (const layout of DOCUMENT_LAYOUTS) {
      const doc = toCanonicalJson({ ...layout, languages: measured[layout.id as string] });
      writeFileSync(
        layoutsFile(`documents/${layout.id}.json`),
        `${JSON.stringify(doc, null, 2)}\n`,
      );
    }
  });
});
