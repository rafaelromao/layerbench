import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GOLDEN_LAYOUTS } from '../../golden/set.js';
import { toCanonicalJson } from '../../layout/json.js';
import { DEFAULT_LAYOUT_ID } from '../bundled-ids.js';
import { DOCUMENT_IDS } from '../documents.js';
import { BUNDLED_LAYOUTS, bundledLayout, CLASSIC_DEFS, SMALL_DEFS } from '../index.js';
import { LIBRARY_FILES, type LibraryRequest, planRequest } from './plan.js';
import { keptInLibrary, LibraryRequestRefused } from './request.js';

const root = new URL('../../../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

/** The repository's files a request reads, as they are. */
function tree(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const path of Object.values(LIBRARY_FILES)) {
    if (typeof path === 'string') files[path] = read(path);
  }
  for (const id of DOCUMENT_IDS)
    files[LIBRARY_FILES.document(id)] = read(LIBRARY_FILES.document(id));
  return files;
}

const bundled = BUNDLED_LAYOUTS.map((l) => ({ id: l.id as string, name: l.name }));
const nameOf = (id: string) => bundled.find((l) => l.id === id)?.name ?? id;

/**
 * Layouts by where they are, a deletable one of each kind, so the cases hold on a branch where a
 * request has changed the Library: one written in `classic.ts`, one in `small.ts`, and a document.
 */
const deletable = (ids: readonly string[]) => ids.find((id) => keptInLibrary(id) === null);
const CLASSIC = deletable(CLASSIC_DEFS.map((d) => d.id)) as string;
const SMALL = deletable(SMALL_DEFS.map((d) => d.id)) as string;
const DOCUMENT = deletable(DOCUMENT_IDS);
/** One the golden reports read, still written in code. */
const GOLDEN_IN_CODE = GOLDEN_LAYOUTS.find((id) => CLASSIC_DEFS.some((d) => d.id === id));

/** An id no layout has: what is promoted. */
const NEW = 'new-layout';

/** A layout as LayerBench saves it, under an id and a name. */
function saved(id: string, name: string, from = CLASSIC): Record<string, unknown> {
  const layout = { ...(bundledLayout(from) as object), id, name, author: 'Ana' };
  return JSON.parse(JSON.stringify(toCanonicalJson(layout as never)));
}

const plan = (request: LibraryRequest, files = tree()) => planRequest(request, files, bundled);

describe('promoting a layout to the Library', () => {
  it('adds its document, registers it, and names it on the landing page', () => {
    const doc = saved(NEW, 'New layout');
    const { write, remove } = plan({ action: 'promote', id: NEW, layout: doc });
    expect(remove).toEqual([]);
    expect(JSON.parse(write[LIBRARY_FILES.document(NEW)])).toEqual(doc);
    expect(write[LIBRARY_FILES.document(NEW)].endsWith('}\n')).toBe(true);
    expect(write[LIBRARY_FILES.documents]).toContain(
      "import newLayout from './documents/new-layout.json';",
    );
    expect(write[LIBRARY_FILES.landing]).toContain(`layout=${NEW}&amp;`);
  });
});

describe('changing a bundled layout', () => {
  it.runIf(DOCUMENT)('overwrites a document, and renames it on the landing page', () => {
    const id = DOCUMENT as string;
    const doc = saved(id, `${nameOf(id)} 2`, id);
    const { write, remove } = plan({ action: 'change', id, layout: doc });
    expect(remove).toEqual([]);
    expect(JSON.parse(write[LIBRARY_FILES.document(id)])).toEqual(doc);
    expect(write[LIBRARY_FILES.landing]).toContain(`>${nameOf(id)} 2 <span>`);
    expect(write[LIBRARY_FILES.documents]).toBeUndefined();
  });

  it('turns a layout written in code into a document, its code, id, golden and languages gone', () => {
    const doc = saved(CLASSIC, nameOf(CLASSIC));
    const { write, remove } = plan({ action: 'change', id: CLASSIC, layout: doc });
    expect(write[LIBRARY_FILES.classic]).not.toContain(`id: '${CLASSIC}'`);
    expect(write[LIBRARY_FILES.builtInIds]).not.toContain(`'${CLASSIC}'`);
    expect(JSON.parse(write[LIBRARY_FILES.languages])).not.toHaveProperty(CLASSIC);
    expect(write[LIBRARY_FILES.documents]).toContain(`from './documents/${CLASSIC}.json';`);
    expect(JSON.parse(write[LIBRARY_FILES.document(CLASSIC)])).toEqual(doc);
    expect(remove).toEqual([LIBRARY_FILES.golden(CLASSIC)]);
    expect(write[LIBRARY_FILES.landing]).toBeUndefined();
  });

  it.runIf(GOLDEN_IN_CODE)(
    'keeps the golden of a layout the golden reports read, for the dump to rewrite',
    () => {
      const id = GOLDEN_IN_CODE as string;
      const { remove } = plan({ action: 'change', id, layout: saved(id, nameOf(id), id) });
      expect(remove).toEqual([]);
    },
  );

  it('applies again on a branch where an earlier change made it a document', () => {
    const first = plan({ action: 'change', id: CLASSIC, layout: saved(CLASSIC, nameOf(CLASSIC)) });
    const files = { ...tree(), ...first.write };
    for (const path of first.remove) delete files[path];
    const again = plan(
      { action: 'change', id: CLASSIC, layout: saved(CLASSIC, `${nameOf(CLASSIC)} II`) },
      files,
    );
    expect(JSON.parse(again.write[LIBRARY_FILES.document(CLASSIC)]).name).toBe(
      `${nameOf(CLASSIC)} II`,
    );
    expect(again.write[LIBRARY_FILES.landing]).toContain(`>${nameOf(CLASSIC)} II <span>`);
    expect(again.remove).toEqual([]);
  });
});

describe('deleting a bundled layout', () => {
  it('takes a layout written in code out of its file, the ids, the goldens, languages and landing page', () => {
    const { write, remove } = plan({ action: 'delete', id: SMALL });
    expect(write[LIBRARY_FILES.small]).not.toContain(`id: '${SMALL}'`);
    expect(write[LIBRARY_FILES.builtInIds]).not.toContain(`'${SMALL}'`);
    expect(JSON.parse(write[LIBRARY_FILES.languages])).not.toHaveProperty(SMALL);
    expect(write[LIBRARY_FILES.landing]).not.toContain(`layout=${SMALL}&amp;`);
    expect(remove).toEqual([LIBRARY_FILES.golden(SMALL)]);
  });

  it.runIf(DOCUMENT)('takes a document out, and its import and entry', () => {
    const id = DOCUMENT as string;
    const { write, remove } = plan({ action: 'delete', id });
    expect(remove).toEqual([LIBRARY_FILES.document(id)]);
    expect(write[LIBRARY_FILES.documents]).not.toContain(`/${id}.json`);
    expect(write[LIBRARY_FILES.landing]).not.toContain(`layout=${id}&amp;`);
  });
});

describe('a request it refuses, writing nothing', () => {
  const bundledOne = saved(CLASSIC, nameOf(CLASSIC));
  it.each<[string, LibraryRequest]>([
    ['an id no layout could have', { action: 'delete', id: '../classic' }],
    ['deleting a layout that is not bundled', { action: 'delete', id: NEW }],
    [
      'changing a layout that is not bundled',
      { action: 'change', id: NEW, layout: saved(NEW, 'New layout') },
    ],
    ['promoting a layout already bundled', { action: 'promote', id: CLASSIC, layout: bundledOne }],
    [
      'a name another bundled layout has',
      { action: 'promote', id: NEW, layout: saved(NEW, nameOf(CLASSIC)) },
    ],
    ['deleting the layout a visit opens', { action: 'delete', id: 'magic-romak' }],
    ['deleting a layout the golden reports read', { action: 'delete', id: 'qwerty' }],
    [
      'a layout under another id',
      { action: 'promote', id: NEW, layout: saved('other-layout', 'Other layout') },
    ],
    ['no layout to add', { action: 'promote', id: NEW }],
    [
      'a layout not as LayerBench saves it',
      { action: 'promote', id: NEW, layout: { name: 'New layout', ...saved(NEW, 'New layout') } },
    ],
  ])('%s', (_what, request) => {
    expect(() => plan(request)).toThrow(LibraryRequestRefused);
  });
});

describe('the bundled layouts the Library keeps', () => {
  it('keeps the layout a visit opens and those the golden reports measure, and no other', () => {
    expect(keptInLibrary(DEFAULT_LAYOUT_ID)).toBe('it is the layout a visit opens');
    for (const id of GOLDEN_LAYOUTS) expect(keptInLibrary(id)).not.toBeNull();
    const free = bundled.filter((l) => keptInLibrary(l.id) === null);
    expect(free.length).toBe(bundled.length - GOLDEN_LAYOUTS.length);
  });

  it('says why when it is asked to delete one', () => {
    expect(() => plan({ action: 'delete', id: 'qwerty' })).toThrow(
      'qwerty stays in the Library: the golden reports measure it',
    );
  });
});
