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
import { BUNDLED_LAYOUTS, bundledLayout, CLASSIC_DEFS } from '../index.js';
import { applyRequest } from './apply.js';
import { LIBRARY_FILES, LIBRARY_REQUEST } from './plan.js';
import { keptInLibrary, LibraryRequestRefused } from './request.js';

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
const bundled = BUNDLED_LAYOUTS.map((l) => ({ id: l.id as string, name: l.name }));
/** A layout written in code that may go, whatever a request has changed on this branch. */
const CLASSIC = CLASSIC_DEFS.map((d) => d.id).find((id) => keptInLibrary(id) === null) as string;

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
  cpSync(join(REPO, LIBRARY_FILES.golden(CLASSIC)), join(root, LIBRARY_FILES.golden(CLASSIC)));
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
    const layout = toCanonicalJson({ ...(bundledLayout(CLASSIC) as Layout), author: 'Ana' });
    ask({ action: 'change', id: CLASSIC, layout, by: 'ana' });
    expect(applyRequest(root, bundled)).toMatchObject({ action: 'change', id: CLASSIC });
    expect(JSON.parse(readFileSync(join(root, LIBRARY_FILES.document(CLASSIC)), 'utf8'))).toEqual(
      JSON.parse(JSON.stringify(layout)),
    );
    expect(readFileSync(join(root, LIBRARY_FILES.classic), 'utf8')).not.toContain(
      `id: '${CLASSIC}'`,
    );
    expect(existsSync(join(root, LIBRARY_FILES.golden(CLASSIC)))).toBe(false);
    expect(existsSync(join(root, dirname(LIBRARY_REQUEST)))).toBe(false);
  });

  it('writes nothing, and keeps the request, when it refuses', () => {
    copy();
    ask({ action: 'delete', id: 'magic-romak' });
    const before = readFileSync(join(root, LIBRARY_FILES.small), 'utf8');
    expect(() => applyRequest(root, bundled)).toThrow(LibraryRequestRefused);
    expect(readFileSync(join(root, LIBRARY_FILES.small), 'utf8')).toBe(before);
    expect(existsSync(join(root, LIBRARY_REQUEST))).toBe(true);
  });
});
