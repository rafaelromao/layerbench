import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toCanonicalJson } from '../../layout/json.js';
import { BUNDLED_LAYOUTS, bundledLayout } from '../index.js';
import { LibraryEditRefused } from './edits.js';
import { LIBRARY_FILES, type LibraryRequest, planEdit } from './plan.js';

const root = new URL('../../../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

/** The repository's files a request reads, as they are. */
function tree(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const path of Object.values(LIBRARY_FILES)) {
    if (typeof path === 'string') files[path] = read(path);
  }
  files[LIBRARY_FILES.document('nordwind')] = read(LIBRARY_FILES.document('nordwind'));
  return files;
}

const bundled = BUNDLED_LAYOUTS.map((l) => ({ id: l.id as string, name: l.name }));

/** A layout as LayerBench saves it, under an id and a name. */
function saved(id: string, name: string, from = 'colemak'): Record<string, unknown> {
  const layout = { ...(bundledLayout(from) as object), id, name, author: 'Ana' };
  return JSON.parse(JSON.stringify(toCanonicalJson(layout as never)));
}

const plan = (request: LibraryRequest, files = tree()) => planEdit(request, files, bundled);

describe('promoting a layout to the Library', () => {
  it('adds its document, registers it, and names it on the landing page', () => {
    const doc = saved('breeze', 'Breeze');
    const { write, remove } = plan({ action: 'promote', id: 'breeze', layout: doc });
    expect(remove).toEqual([]);
    expect(JSON.parse(write[LIBRARY_FILES.document('breeze')])).toEqual(doc);
    expect(write[LIBRARY_FILES.document('breeze')].endsWith('}\n')).toBe(true);
    expect(write[LIBRARY_FILES.documents]).toContain(
      "import breeze from './documents/breeze.json';",
    );
    expect(write[LIBRARY_FILES.landing]).toContain('layout=breeze&amp;');
  });
});

describe('changing a bundled layout', () => {
  it('overwrites a document, and renames it on the landing page', () => {
    const doc = saved('nordwind', 'Nordwind 2');
    const { write, remove } = plan({ action: 'change', id: 'nordwind', layout: doc });
    expect(remove).toEqual([]);
    expect(JSON.parse(write[LIBRARY_FILES.document('nordwind')])).toEqual(doc);
    expect(write[LIBRARY_FILES.landing]).toContain('>Nordwind 2 <span>');
    expect(write[LIBRARY_FILES.documents]).toBeUndefined();
  });

  it('turns a layout written in code into a document, its code, id, golden and languages gone', () => {
    const doc = saved('dvorak', 'Dvorak');
    const { write, remove } = plan({ action: 'change', id: 'dvorak', layout: doc });
    expect(write[LIBRARY_FILES.classic]).not.toContain("id: 'dvorak'");
    expect(write[LIBRARY_FILES.builtInIds]).not.toContain("'dvorak'");
    expect(JSON.parse(write[LIBRARY_FILES.languages])).not.toHaveProperty('dvorak');
    expect(write[LIBRARY_FILES.documents]).toContain(
      "import dvorak from './documents/dvorak.json';",
    );
    expect(JSON.parse(write[LIBRARY_FILES.document('dvorak')])).toEqual(doc);
    expect(remove).toEqual([LIBRARY_FILES.golden('dvorak')]);
    expect(write[LIBRARY_FILES.landing]).toBeUndefined();
  });

  it('keeps the golden of a layout the golden reports read, for the dump to rewrite', () => {
    const { remove } = plan({ action: 'change', id: 'romak', layout: saved('romak', 'Romak') });
    expect(remove).toEqual([]);
  });

  it('applies again on a branch where an earlier change made it a document', () => {
    const first = plan({ action: 'change', id: 'dvorak', layout: saved('dvorak', 'Dvorak') });
    const files = { ...tree(), ...first.write };
    for (const path of first.remove) delete files[path];
    const again = plan(
      { action: 'change', id: 'dvorak', layout: saved('dvorak', 'Dvorak II') },
      files,
    );
    expect(JSON.parse(again.write[LIBRARY_FILES.document('dvorak')]).name).toBe('Dvorak II');
    expect(again.write[LIBRARY_FILES.landing]).toContain('>Dvorak II <span>');
    expect(again.remove).toEqual([]);
  });
});

describe('deleting a bundled layout', () => {
  it('takes a layout written in code out of its file, the ids, the goldens, languages and landing page', () => {
    const { write, remove } = plan({ action: 'delete', id: 'hands-down-gold' });
    expect(write[LIBRARY_FILES.small]).not.toContain("id: 'hands-down-gold'");
    expect(write[LIBRARY_FILES.builtInIds]).not.toContain("'hands-down-gold'");
    expect(JSON.parse(write[LIBRARY_FILES.languages])).not.toHaveProperty('hands-down-gold');
    expect(write[LIBRARY_FILES.landing]).not.toContain('layout=hands-down-gold&amp;');
    expect(remove).toEqual([LIBRARY_FILES.golden('hands-down-gold')]);
  });

  it('takes a document out, and its import and entry', () => {
    const { write, remove } = plan({ action: 'delete', id: 'nordwind' });
    expect(remove).toEqual([LIBRARY_FILES.document('nordwind')]);
    expect(write[LIBRARY_FILES.documents]).not.toContain('nordwind');
    expect(write[LIBRARY_FILES.landing]).not.toContain('layout=nordwind&amp;');
  });
});

describe('a request it refuses, writing nothing', () => {
  const colemak = saved('colemak', 'Colemak');
  it.each<[string, LibraryRequest]>([
    ['an id no layout could have', { action: 'delete', id: '../classic' }],
    ['deleting a layout that is not bundled', { action: 'delete', id: 'breeze' }],
    [
      'changing a layout that is not bundled',
      { action: 'change', id: 'breeze', layout: saved('breeze', 'Breeze') },
    ],
    ['promoting a layout already bundled', { action: 'promote', id: 'colemak', layout: colemak }],
    [
      'a name another bundled layout has',
      { action: 'promote', id: 'breeze', layout: saved('breeze', 'Colemak') },
    ],
    ['deleting the layout a visit opens', { action: 'delete', id: 'magic-romak' }],
    ['deleting a layout the golden reports read', { action: 'delete', id: 'qwerty' }],
    [
      'a layout under another id',
      { action: 'promote', id: 'breeze', layout: saved('gust', 'Gust') },
    ],
    ['no layout to add', { action: 'promote', id: 'breeze' }],
    [
      'a layout not as LayerBench saves it',
      { action: 'promote', id: 'breeze', layout: { name: 'Breeze', ...saved('breeze', 'Breeze') } },
    ],
  ])('%s', (_what, request) => {
    expect(() => plan(request)).toThrow(LibraryEditRefused);
  });
});
