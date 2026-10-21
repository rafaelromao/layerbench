import {
  assertDocumentId,
  COLLECTIONS,
  type Collection,
  documentPath,
  type IndexEntry,
  indexSummary,
  type JsonObject,
  NameTakenError,
  nameTaken,
  type PutOptions,
  type StorageAdapter,
  StorageConflictError,
  type StorageMeta,
} from '@layerbench/core';
import { type IDBPDatabase, openDB } from 'idb';

/** 2: the proposals collection's store. */
const DB_VERSION = 2;
const INDEX_STORE = 'indexes';

interface StoredDoc {
  id: string;
  json: string;
  sha: string;
  updatedAt: string;
}

/** Content hash of the stored text, used as the document's version. */
export async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function open(name: string, onBlocked: () => void, onBlocking: () => void): Promise<IDBPDatabase> {
  return openDB(name, DB_VERSION, {
    upgrade(db) {
      for (const c of COLLECTIONS) {
        if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(INDEX_STORE)) db.createObjectStore(INDEX_STORE);
    },
    // Another tab has it open at an older version: it opens once that tab lets it go.
    blocked: () => onBlocked(),
    // Another tab asks for a newer version: this one lets it go, so that tab can open it.
    blocking: () => onBlocking(),
  });
}

/**
 * Custom layouts, rule sets and corpora in the browser. Each collection keeps an index, so a library
 * lists without reading every document.
 */
export class IndexedDbAdapter implements StorageAdapter {
  readonly id = 'local';
  private db: Promise<IDBPDatabase> | null = null;

  /**
   * The database name is injectable so tests can isolate themselves from each other. `onBlocked` is
   * told when another tab, of an older version of the app, keeps the database from opening.
   */
  constructor(
    private readonly dbName = 'layerbench',
    private readonly onBlocked: () => void = () => {},
  ) {}

  private conn(): Promise<IDBPDatabase> {
    this.db ??= open(this.dbName, this.onBlocked, () => this.release());
    return this.db;
  }

  /** Lets the database go, for another tab to open it at a newer version. */
  private release(): void {
    const db = this.db;
    this.db = null;
    void db?.then((d) => d.close());
  }

  /** Release the connection, so the database can be deleted. */
  async close(): Promise<void> {
    const db = this.db;
    this.db = null;
    if (db) (await db).close();
  }

  async list(collection: Collection): Promise<IndexEntry[]> {
    const db = await this.conn();
    const stored = (await db.get(INDEX_STORE, collection)) as IndexEntry[] | undefined;
    if (stored) return stored;
    // No index yet: rebuild it from whatever documents are there.
    const docs = (await db.getAll(collection)) as StoredDoc[];
    // Each as of when it was saved, not now: copying up goes by which copy is newer.
    const entries = docs.map((d) => ({
      ...indexSummary(collection, d.id, JSON.parse(d.json)),
      updatedAt: d.updatedAt,
    }));
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(
    collection: Collection,
    id: string,
  ): Promise<{ doc: JsonObject; meta: StorageMeta } | null> {
    assertDocumentId(id);
    const db = await this.conn();
    const stored = (await db.get(collection, id)) as StoredDoc | undefined;
    if (!stored) return null;
    return {
      doc: JSON.parse(stored.json) as JsonObject,
      meta: { sha: stored.sha, path: documentPath(collection, id) },
    };
  }

  async put(
    collection: Collection,
    id: string,
    doc: JsonObject,
    opts: PutOptions = {},
  ): Promise<StorageMeta> {
    assertDocumentId(id);
    const db = await this.conn();
    const json = JSON.stringify(doc);
    const sha = await sha1Hex(json);
    const updatedAt = new Date().toISOString();
    const entry = { ...indexSummary(collection, id, doc), updatedAt };

    const tx = db.transaction([collection, INDEX_STORE], 'readwrite');
    const existing = (await tx.objectStore(collection).get(id)) as StoredDoc | undefined;
    // A missing document is not a conflict: the first write of an id always wins.
    if (opts.expectedSha !== undefined && existing && existing.sha !== opts.expectedSha) {
      await tx.done.catch(() => {});
      throw new StorageConflictError();
    }
    const indexStore = tx.objectStore(INDEX_STORE);
    const current =
      ((await indexStore.get(collection)) as IndexEntry[] | undefined) ??
      // No index yet: what is there is rebuilt into it, so no document drops out of the list.
      ((await tx.objectStore(collection).getAll()) as StoredDoc[]).map((d) => ({
        ...indexSummary(collection, d.id, JSON.parse(d.json)),
        updatedAt: d.updatedAt,
      }));
    // Never a second custom layout of a name, whoever asks: the caller overwrites the one there.
    const taken =
      collection === 'layouts' ? nameTaken(current, entry.name, id, opts.replacing) : null;
    if (taken) {
      await tx.done.catch(() => {});
      throw new NameTakenError(taken);
    }
    await tx.objectStore(collection).put({ id, json, sha, updatedAt } satisfies StoredDoc);

    const next = [...current.filter((e) => e.id !== id), entry].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    await indexStore.put(next, collection);
    await tx.done;

    return { sha, path: documentPath(collection, id) };
  }

  async delete(collection: Collection, id: string): Promise<void> {
    assertDocumentId(id);
    const db = await this.conn();
    const tx = db.transaction([collection, INDEX_STORE], 'readwrite');
    await tx.objectStore(collection).delete(id);
    const indexStore = tx.objectStore(INDEX_STORE);
    const current = ((await indexStore.get(collection)) as IndexEntry[] | undefined) ?? [];
    await indexStore.put(
      current.filter((e) => e.id !== id),
      collection,
    );
    await tx.done;
  }
}
