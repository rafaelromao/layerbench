import {
  assertDocumentId,
  type Collection,
  documentPath,
  type IndexEntry,
  indexSummary,
  type JsonObject,
  type StorageAdapter,
  StorageConflictError,
  type StorageMeta,
} from '@layoutmaster/core';
import { type IDBPDatabase, openDB } from 'idb';

const DB_VERSION = 1;
const COLLECTIONS: Collection[] = ['layouts', 'rulesets', 'corpora'];
const INDEX_STORE = 'indexes';

interface StoredDoc {
  id: string;
  json: string;
  sha: string;
  updatedAt: string;
}

/** Content hash of the stored text, used the same way the reference implementation uses it. */
export async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function open(name: string): Promise<IDBPDatabase> {
  return openDB(name, DB_VERSION, {
    upgrade(db) {
      for (const c of COLLECTIONS) {
        if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(INDEX_STORE)) db.createObjectStore(INDEX_STORE);
    },
  });
}

/**
 * Saved layouts, rule sets and corpora in the browser. Documents are the same JSON the reference
 * implementation writes, and each collection keeps an index so a library lists without reading
 * every document.
 */
export class IndexedDbAdapter implements StorageAdapter {
  readonly id = 'local';
  private db: Promise<IDBPDatabase> | null = null;

  /** The database name is injectable so tests can isolate themselves from each other. */
  constructor(private readonly dbName = 'layoutmaster') {}

  private conn(): Promise<IDBPDatabase> {
    this.db ??= open(this.dbName);
    return this.db;
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
    const entries = docs.map((d) => indexSummary(collection, d.id, JSON.parse(d.json)));
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
    opts: { expectedSha?: string; message?: string } = {},
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
    await tx.objectStore(collection).put({ id, json, sha, updatedAt } satisfies StoredDoc);

    const indexStore = tx.objectStore(INDEX_STORE);
    const current = ((await indexStore.get(collection)) as IndexEntry[] | undefined) ?? [];
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
