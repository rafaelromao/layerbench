import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';
import { libraryRetitle } from '../../convention/library-title.js';
import { LIBRARY_REQUEST } from './request.js';

const OUT = process.env.RETITLE_OUT;

/**
 * Not a test: the title a Library request's pull request should have, for CI on a `library/**`
 * branch (see `.github/workflows/library-edit.yml`). `PR_TITLE` is the title it has now, passed in
 * the environment and never written into a command; `RETITLE_OUT` is the file the new title is
 * written to, which is empty when the title is fine as it is.
 *
 *   PR_TITLE='Library: change enthium' RETITLE_OUT=title.txt pnpm library-retitle
 */
describe.skipIf(OUT === undefined)('Library request title (RETITLE_OUT=<file>)', () => {
  it('writes the title the request gives its pull request, if it has none that follows the convention', () => {
    const root = fileURLToPath(new URL('../../../../../', import.meta.url));
    const request = JSON.parse(readFileSync(`${root}${LIBRARY_REQUEST}`, 'utf8')) as {
      action?: unknown;
      id?: unknown;
    };
    const title = libraryRetitle(request, process.env.PR_TITLE ?? '');
    writeFileSync(OUT as string, title ?? '');
    console.log(title ? `retitle: ${title}` : 'retitle: none');
  });
});
