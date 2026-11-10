import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';
import { measureAllEfforts } from './measure.js';
import { effortsFileText } from './performance.js';

const WRITE = process.env.LANGUAGES === '1';

/**
 * Not a test: the writer of the bundled layouts' Efforts on each language's text. Like
 * `pnpm goldens`, it runs through vitest because that is the repository's TypeScript runner and
 * resolves the served corpora the way the suite does.
 *
 *   pnpm languages
 *
 * It analyzes every bundled layout on every language's text (`measure.ts`) and writes the Efforts,
 * lowest first, to `lang/efforts.json`: what the editor's "Measure languages" counts a layout's own
 * Effort against. Review the diff.
 */
describe.skipIf(!WRITE)('bundled layouts’ Efforts writer (LANGUAGES=1)', () => {
  it('writes the Effort of each bundled layout on each language’s text', {
    timeout: 300_000,
  }, async () => {
    writeFileSync(
      fileURLToPath(new URL('./efforts.json', import.meta.url)),
      effortsFileText(await measureAllEfforts()),
    );
  });
});
