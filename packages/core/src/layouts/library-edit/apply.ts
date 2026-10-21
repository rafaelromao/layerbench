import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { LIBRARY_FILES, LIBRARY_REQUEST, type LibraryRequest, planEdit } from './plan.js';

/**
 * Applies the Library request a branch carries to the repository at `root`, and deletes the request:
 * Node only, for `pnpm library-edit` in CI. A branch with no request is left as it is, so CI's own
 * push of the result, and any fix pushed by hand after it, change nothing. What the request asks is
 * worked out whole first (`planEdit`), so a refusal writes nothing and leaves the request for a
 * person to read.
 *
 * Returns what was asked, or null when there was no request.
 */
export function applyRequest(
  root: string,
  bundled: readonly { id: string; name: string }[],
): LibraryRequest | null {
  const requestPath = join(root, LIBRARY_REQUEST);
  if (!existsSync(requestPath)) return null;
  const request = JSON.parse(readFileSync(requestPath, 'utf8')) as LibraryRequest;

  const files: Record<string, string> = {};
  for (const path of Object.values(LIBRARY_FILES)) {
    if (typeof path === 'string') files[path] = readFileSync(join(root, path), 'utf8');
  }
  const documents = join(root, dirname(LIBRARY_FILES.document('x')));
  for (const file of existsSync(documents) ? readdirSync(documents) : []) {
    if (!file.endsWith('.json')) continue;
    const path = LIBRARY_FILES.document(file.slice(0, -'.json'.length));
    files[path] = readFileSync(join(root, path), 'utf8');
  }

  const { write, remove } = planEdit(request, files, bundled);
  for (const [path, text] of Object.entries(write)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  for (const path of remove) rmSync(join(root, path), { force: true });
  rmSync(dirname(requestPath), { recursive: true, force: true });
  return request;
}
