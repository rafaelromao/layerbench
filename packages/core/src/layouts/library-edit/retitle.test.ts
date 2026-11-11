import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeRetitle } from './retitle.js';

let dir = '';
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

/** A request file, and where the title goes, in a folder of their own. */
function files(request: string | null) {
  dir = mkdtempSync(join(tmpdir(), 'retitle-'));
  const requestPath = join(dir, 'request.json');
  if (request !== null) writeFileSync(requestPath, request);
  return { requestPath, outPath: join(dir, 'title.txt') };
}
const REQUEST = JSON.stringify({ action: 'change', id: 'enthium', layout: {} });

describe('the title file of a Library request', () => {
  it('holds the title for a pull request an older sign-in server opened', () => {
    const { requestPath, outPath } = files(REQUEST);
    expect(writeRetitle(requestPath, 'Library: change enthium', outPath)).toBe(
      'fix(library): change enthium',
    );
    expect(readFileSync(outPath, 'utf8')).toBe('fix(library): change enthium');
  });

  it('is empty when the title is fine, a person’s own included, or was not read', () => {
    for (const current of [
      'fix(library): change enthium',
      'feat(layouts): upgrade Enthium',
      '',
      undefined,
    ]) {
      const { requestPath, outPath } = files(REQUEST);
      expect(writeRetitle(requestPath, current, outPath)).toBe(null);
      expect(readFileSync(outPath, 'utf8')).toBe('');
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is empty when there is no request to read, or it is not one', () => {
    for (const request of [null, 'not json', JSON.stringify({ action: 'drop', id: 'x' })]) {
      const { requestPath, outPath } = files(request);
      expect(writeRetitle(requestPath, 'Library: change enthium', outPath)).toBe(null);
      expect(readFileSync(outPath, 'utf8')).toBe('');
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
