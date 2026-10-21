import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { toCanonicalJson } from '../../layout/json.js';
import type { Layout } from '../../layout/types.js';
import { BUNDLED_LAYOUTS, bundledLayout } from '../index.js';
import { applyRequest } from './apply.js';
import { LibraryEditRefused } from './edits.js';
import { LIBRARY_FILES, LIBRARY_REQUEST } from './plan.js';

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
const bundled = BUNDLED_LAYOUTS.map((l) => ({ id: l.id as string, name: l.name }));

let root = '';

/** A copy of the files a request reads, in a folder of its own. */
function copy(): string {
  root = mkdtempSync(join(tmpdir(), 'library-edit-'));
  for (const path of Object.values(LIBRARY_FILES)) {
    if (typeof path !== 'string') continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    cpSync(join(REPO, path), join(root, path));
  }
  const documents = dirname(LIBRARY_FILES.document('x'));
  cpSync(join(REPO, documents), join(root, documents), { recursive: true });
  mkdirSync(join(root, dirname(LIBRARY_FILES.golden('x'))), { recursive: true });
  cpSync(join(REPO, LIBRARY_FILES.golden('dvorak')), join(root, LIBRARY_FILES.golden('dvorak')));
  return root;
}

function ask(request: object) {
  mkdirSync(join(root, dirname(LIBRARY_REQUEST)), { recursive: true });
  writeFileSync(join(root, LIBRARY_REQUEST), JSON.stringify(request));
}

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = '';
});

describe('applying the request a branch carries', () => {
  it('does nothing on a branch with no request', () => {
    copy();
    expect(applyRequest(root, bundled)).toBeNull();
  });

  it('writes and deletes what the request asks, then deletes the request', () => {
    copy();
    const layout = toCanonicalJson({ ...(bundledLayout('dvorak') as Layout), author: 'Ana' });
    ask({ action: 'change', id: 'dvorak', layout, by: 'ana' });
    expect(applyRequest(root, bundled)).toMatchObject({ action: 'change', id: 'dvorak' });
    expect(JSON.parse(readFileSync(join(root, LIBRARY_FILES.document('dvorak')), 'utf8'))).toEqual(
      JSON.parse(JSON.stringify(layout)),
    );
    expect(readFileSync(join(root, LIBRARY_FILES.classic), 'utf8')).not.toContain("id: 'dvorak'");
    expect(existsSync(join(root, LIBRARY_FILES.golden('dvorak')))).toBe(false);
    expect(existsSync(join(root, dirname(LIBRARY_REQUEST)))).toBe(false);
  });

  it('writes nothing, and keeps the request, when it refuses', () => {
    copy();
    ask({ action: 'delete', id: 'magic-romak' });
    const before = readFileSync(join(root, LIBRARY_FILES.small), 'utf8');
    expect(() => applyRequest(root, bundled)).toThrow(LibraryEditRefused);
    expect(readFileSync(join(root, LIBRARY_FILES.small), 'utf8')).toBe(before);
    expect(existsSync(join(root, LIBRARY_REQUEST))).toBe(true);
  });
});
