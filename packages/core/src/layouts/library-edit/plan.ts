import { GOLDEN_LAYOUTS } from '../../golden/report.js';
import { compileLayout } from '../../layout/compile.js';
import { isDocumentId } from '../../storage/ids.js';
import { DEFAULT_LAYOUT_ID } from '../bundled-ids.js';
import { documentLayout } from '../documents.js';
import { pruneUnused, removeDef } from './code.js';
import {
  dropLanguages,
  LibraryEditRefused,
  landingAdd,
  landingRemove,
  landingRename,
  registerDocument,
  removeBuiltInId,
  unregisterDocument,
} from './edits.js';
import type { LibraryRequest } from './request.js';

export { LIBRARY_REQUEST, type LibraryRequest } from './request.js';

/** The files a request reads and writes, from the repository's root. */
export const LIBRARY_FILES = {
  classic: 'packages/core/src/layouts/classic.ts',
  small: 'packages/core/src/layouts/small.ts',
  builtInIds: 'packages/core/src/layouts/bundled-ids.ts',
  documents: 'packages/core/src/layouts/documents.ts',
  languages: 'packages/core/src/layouts/languages.json',
  landing: 'docs/site/index.html',
  document: (id: string) => `packages/core/src/layouts/documents/${id}.json`,
  golden: (id: string) => `packages/core/golden/layouts/${id}.json`,
} as const;

const DEF_LISTS = [
  [LIBRARY_FILES.classic, 'CLASSIC_DEFS'],
  [LIBRARY_FILES.small, 'SMALL_DEFS'],
] as const;

/** What a request changes: the files to write, by path, and those to delete. */
export interface LibraryEdit {
  write: Record<string, string>;
  remove: string[];
}

/** The layout a request carries, checked as a bundled document is; or a refusal. */
function checkedLayout(request: LibraryRequest) {
  if (request.layout === undefined) throw new LibraryEditRefused(`no layout to ${request.action}`);
  try {
    const layout = documentLayout(request.id, request.layout);
    compileLayout(layout);
    return layout;
  } catch (e) {
    throw new LibraryEditRefused(e instanceof Error ? e.message : String(e));
  }
}

/**
 * The edit a request makes to the repository's files, worked out whole before anything is
 * written, so a refusal writes nothing. `files` are the texts of `LIBRARY_FILES` and of the
 * documents there are, by path; `bundled` the layouts the Library has now.
 */
export function planEdit(
  request: LibraryRequest,
  files: Readonly<Record<string, string | undefined>>,
  bundled: readonly { id: string; name: string }[],
): LibraryEdit {
  const { action, id } = request;
  if (!isDocumentId(id)) throw new LibraryEditRefused('no layout could have that id');
  const isBundled = bundled.some((l) => l.id === id);
  if (action === 'promote' && isBundled) throw new LibraryEditRefused(`${id} is bundled already`);
  if (action !== 'promote' && !isBundled) throw new LibraryEditRefused(`${id} is not bundled`);
  if (action === 'delete' && id === DEFAULT_LAYOUT_ID) {
    throw new LibraryEditRefused(`${id} is the layout a visit opens`);
  }
  if (action === 'delete' && (GOLDEN_LAYOUTS as readonly string[]).includes(id)) {
    throw new LibraryEditRefused(`the golden reports read ${id}`);
  }
  const layout = action === 'delete' ? undefined : checkedLayout(request);
  if (layout && bundled.some((l) => l.id !== id && l.name === layout.name)) {
    throw new LibraryEditRefused(`another bundled layout is called ${layout.name}`);
  }

  const text = (path: string) => {
    const t = files[path];
    if (t === undefined) throw new LibraryEditRefused(`${path} was not read`);
    return t;
  };
  const write: Record<string, string> = {};
  const remove: string[] = [];
  const edit = (path: string, change: (t: string) => string) => {
    write[path] = change(write[path] ?? text(path));
  };
  const writeDocument = () => {
    write[LIBRARY_FILES.document(id)] = `${JSON.stringify(request.layout, null, 2)}\n`;
  };

  const inCode = text(LIBRARY_FILES.builtInIds).includes(`  '${id}',\n`);
  const isDocument = files[LIBRARY_FILES.document(id)] !== undefined;
  if (action !== 'promote' && inCode === isDocument) {
    throw new LibraryEditRefused(`${id} is not written once, in code or as a document`);
  }

  if (action !== 'promote' && inCode) {
    const holding = DEF_LISTS.filter(([path]) => text(path).includes(`\n    id: '${id}',\n`));
    if (holding.length !== 1)
      throw new LibraryEditRefused(`${id} is defined in ${holding.length} files`);
    const [[path, list]] = holding;
    edit(path, (t) => pruneUnused(removeDef(t, list, id)));
    edit(LIBRARY_FILES.builtInIds, (t) => removeBuiltInId(t, id));
    edit(LIBRARY_FILES.languages, (t) => dropLanguages(t, id));
    if (!(GOLDEN_LAYOUTS as readonly string[]).includes(id)) remove.push(LIBRARY_FILES.golden(id));
  }
  if (action === 'delete') {
    if (isDocument) {
      remove.push(LIBRARY_FILES.document(id));
      edit(LIBRARY_FILES.documents, (t) => unregisterDocument(t, id));
    }
    edit(LIBRARY_FILES.landing, (t) => landingRemove(t, id));
  } else if (layout) {
    writeDocument();
    if (!isDocument) edit(LIBRARY_FILES.documents, (t) => registerDocument(t, id));
    edit(LIBRARY_FILES.landing, (t) =>
      action === 'promote'
        ? landingAdd(t, { id, name: layout.name, author: layout.author })
        : landingRename(t, { id, name: layout.name }),
    );
  }
  // A file the edit left as it was is not written.
  for (const [path, t] of Object.entries(write)) if (files[path] === t) delete write[path];
  return { write, remove };
}
