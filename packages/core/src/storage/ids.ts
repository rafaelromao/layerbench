/**
 * Document identity and index entries. These shapes are the storage contract shared by every
 * adapter (browser database, GitHub data repository, gists).
 */

/** The kinds of document a user saves: layouts, rule sets and texts. */
export const COLLECTIONS = ['layouts', 'rulesets', 'corpora'] as const;

export type Collection = (typeof COLLECTIONS)[number];

export type JsonObject = Record<string, unknown>;

export interface IndexEntry {
  id: string;
  name: string;
  updatedAt: string;
  author?: string;
  languages?: string[];
  geometry?: string;
  layers?: number;
  description?: string;
  rules?: number;
  language?: string;
  license?: string;
  words?: number;
}

export interface StorageMeta {
  sha: string;
  etag?: string;
  path?: string;
  commit?: string;
}

export interface StorageAdapter {
  readonly id: string;
  list(collection: Collection): Promise<IndexEntry[]>;
  get(collection: Collection, id: string): Promise<{ doc: JsonObject; meta: StorageMeta } | null>;
  put(
    collection: Collection,
    id: string,
    doc: JsonObject,
    /**
     * `expectedSha`: write only over that version, or, when null, only where there is no document
     * yet; a document missing where a version was expected is written all the same. `replacing`:
     * custom layouts whose names do not count against this one's, as the caller deletes them once
     * it is written, such as the old copy of a layout renamed.
     */
    opts?: PutOptions,
  ): Promise<StorageMeta>;
  delete(collection: Collection, id: string, opts?: { message?: string }): Promise<void>;
}

export interface PutOptions {
  expectedSha?: string | null;
  message?: string;
  replacing?: readonly string[];
}

/** Thrown when a write loses a race with another writer. */
export class StorageConflictError extends Error {
  constructor(message = 'the stored document changed since it was read') {
    super(message);
    this.name = 'StorageConflictError';
  }
}

/**
 * Thrown when a save would make a second custom layout going by a name another already has, as the
 * `-N` copies once did. `taken` is that other one, to overwrite or to name this one apart from.
 */
export class NameTakenError extends Error {
  constructor(readonly taken: { id: string; name: string }) {
    super(`a custom layout is already called ${taken.name}`);
    this.name = 'NameTakenError';
  }
}

/** A name as a person reads it: capitals and the spacing in and around it do not make two names. */
function readName(name: string): string {
  return String(name).trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Whether two names read as one. */
export function sameName(a: string, b: string): boolean {
  return readName(a) === readName(b);
}

/**
 * The custom document, other than `id`, that already goes by `name`: saving `id` under it would
 * make a second. None when `id` goes by that name already, so a layout that shares its name with a
 * duplicate made before can still be saved; `id` is null for a document not saved yet. Those
 * `replacing` do not count, as they are about to be deleted.
 */
export function nameTaken<E extends { id: string; name: string }>(
  entries: readonly E[],
  name: string,
  id: string | null,
  replacing: readonly string[] = [],
): E | null {
  const others = entries.filter((e) => !replacing.includes(e.id));
  if (id !== null && others.some((e) => e.id === id && sameName(e.name, name))) return null;
  return others.find((e) => e.id !== id && sameName(e.name, name)) ?? null;
}

/** `base`, numbered (`<base> 2`, `<base> 3`, …) while one of `taken` already goes by it. */
export function freeName(base: string, taken: Iterable<string>): string {
  const used = [...taken];
  const trimmed = base.trim();
  let name = trimmed;
  for (let n = 2; used.some((u) => sameName(u, name)); n++) name = `${trimmed} ${n}`;
  return name;
}

function randomSuffix(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** The ASCII words of a name, joined by dashes; empty when it has none. */
export function slugWords(name: string): string {
  return (
    name
      .normalize('NFD')
      // biome-ignore lint/suspicious/noControlCharactersInRegex: matching the ASCII range is the point
      .replace(/[^\x00-\x7F]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}

/** What `slug` and the random suffix can produce: ASCII letters, digits, dashes and underscores. */
export const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** `index` is the collection's own index file, so no document may go by it. */
const RESERVED_IDS: ReadonlySet<string> = new Set(['index']);

/**
 * Whether `id` may name a document. Ids arrive from links and from a shared repository's index,
 * and an adapter turns one into a path, so anything that is not a plain word is refused first.
 */
export function isDocumentId(id: string): boolean {
  return ID_PATTERN.test(id) && !RESERVED_IDS.has(id.toLowerCase());
}

/** The adapters' guard: an id that could not have been made here never reaches a path. */
export function assertDocumentId(id: string): void {
  if (!isDocumentId(id)) throw new Error('invalid document id');
}

/** Document ids: lowercase ASCII words joined by dashes. */
export function slug(name: string): string {
  const s = slugWords(name);
  return s === '' ? `item-${randomSuffix()}` : s;
}

/**
 * An id for a new document called `name` that none in `taken` has: its slug, numbered (`-2`, `-3`,
 * …) while that is in use. Two documents whose names slug alike used to overwrite each other
 * silently, because nothing checked.
 */
export function freeId(name: string, taken: ReadonlySet<string>): string {
  return unusedId(slug(name), { has: (id) => taken.has(id) || RESERVED_IDS.has(id) });
}

/**
 * `base`, or `base` numbered `-2`, `-3`, … while that is taken: the one rule for every new id,
 * whether of a document, a layer or a combo. Layers numbered by how many there were used to land
 * on an id still in use.
 */
export function unusedId(base: string, taken: { has(id: string): boolean }): string {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * The id a stored document called `name` goes by: the one it has, while that still matches its
 * name — the name's slug, or the slug numbered as `freeId` numbers it — so saving it again without
 * renaming never moves it; and once it is renamed, a free id from the new name. A name with no
 * letters or digits to slug keeps the id it has, as `slug` would make up a new one at every save.
 */
export function idForName(name: string, currentId: string, taken: ReadonlySet<string>): string {
  // An id that could not have been made here came in from a link; the document gets a real one.
  if (!isDocumentId(currentId)) return freeId(name, taken);
  const base = slugWords(name);
  if (base === '' || currentId === base) return currentId;
  const numbered =
    currentId.startsWith(`${base}-`) && /^\d+$/.test(currentId.slice(base.length + 1));
  if (numbered) return currentId;
  const others = new Set(taken);
  others.delete(currentId);
  return freeId(name, others);
}

export function documentPath(collection: Collection, id: string): string {
  return `${collection}/${id}.json`;
}

export function indexPath(collection: Collection): string {
  return `${collection}/index.json`;
}

/** The index row for a document: enough to list a library without fetching every file. */
export function indexSummary(collection: Collection, id: string, doc: JsonObject): IndexEntry {
  const base: IndexEntry = {
    id,
    name: (doc.name as string) ?? id,
    updatedAt: new Date().toISOString(),
  };
  const extra: Record<string, unknown> =
    collection === 'layouts'
      ? {
          author: doc.author,
          languages: doc.languages,
          geometry: (doc.geometry as { preset?: string } | undefined)?.preset,
          layers: Array.isArray(doc.layers) ? doc.layers.length : undefined,
        }
      : collection === 'rulesets'
        ? {
            description: doc.description,
            rules: Array.isArray(doc.rules) ? doc.rules.length : undefined,
          }
        : { language: doc.language, license: doc.license, words: doc.words };

  const out = base as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(extra)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return base;
}
