/**
 * Document identity and index entries. These shapes are the storage contract shared by every
 * adapter (browser database, GitHub data repository) and match the reference implementation.
 */

export type Collection = 'layouts' | 'rulesets' | 'corpora';

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
    opts?: { expectedSha?: string; message?: string },
  ): Promise<StorageMeta>;
  delete(collection: Collection, id: string, opts?: { message?: string }): Promise<void>;
}

/** Thrown when a write loses a race with another writer. */
export class StorageConflictError extends Error {
  constructor(message = 'the stored document changed since it was read') {
    super(message);
    this.name = 'StorageConflictError';
  }
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
function slugWords(name: string): string {
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
  const base = slug(name);
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
