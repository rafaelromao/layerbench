import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';
import { BUNDLED_LAYOUTS } from '../index.js';
import { applyRequest } from './apply.js';

const WRITE = process.env.LIBRARY_EDIT === '1';

/**
 * Not a test: the writer of a Library request, for CI on a `library/**` branch (see
 * `.github/workflows/library-edit.yml`). Like `pnpm goldens`, it runs through vitest because that
 * is the repository's TypeScript runner.
 *
 *   pnpm library-edit
 *
 * It applies `.library/request.json` to the repository and deletes it; with no request it does
 * nothing. Then `pnpm languages` and `pnpm goldens` measure what changed.
 */
describe.skipIf(!WRITE)('Library request writer (LIBRARY_EDIT=1)', () => {
  it('applies the request the branch carries', () => {
    const root = fileURLToPath(new URL('../../../../../', import.meta.url));
    const bundled = BUNDLED_LAYOUTS.map((l) => ({ id: l.id as string, name: l.name }));
    const request = applyRequest(root, bundled);
    console.log(request ? `applied: ${request.action} ${request.id}` : 'no request');
  });
});
