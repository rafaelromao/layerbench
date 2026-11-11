import { readFileSync, writeFileSync } from 'node:fs';
import { libraryRetitle } from '../../convention/library-title.js';

/**
 * What `pnpm library-retitle` does, for `.github/workflows/library-edit.yml`: the title the Library
 * request at `requestPath` gives its pull request, written to `outPath`, which is left empty when
 * the title `currentTitle` is fine as it is, is not known, or there is no request to read. The
 * title written, or null.
 */
export function writeRetitle(
  requestPath: string,
  currentTitle: string | undefined,
  outPath: string,
): string | null {
  let title: string | null = null;
  try {
    const request = JSON.parse(readFileSync(requestPath, 'utf8')) as {
      action?: unknown;
      id?: unknown;
    };
    title = libraryRetitle(request, currentTitle ?? '');
  } catch {
    // No request, or not JSON: nothing is made of it, and applying it says why it is refused.
  }
  writeFileSync(outPath, title ?? '');
  return title;
}
