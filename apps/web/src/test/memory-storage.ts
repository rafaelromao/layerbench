import {
  assertDocumentId,
  type Collection,
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
import { sha1Hex } from '../storage/indexeddb.js';

interface Stored {
  json: string;
  sha: string;
  updatedAt: string;
}

/**
 * Storage held in memory, for tests: what the browser's store does, without a database. Documents
 * are kept as text, so each read is a copy, as from any real store, and a document's version is the
 * hash of that text, as a gist's is and as the browser's store gives it, so the same text is the same
 * version in any store, and a write that names another version is a conflict. To make an operation
 * fail, replace it on the instance. As every store does, it keeps no second custom layout of a name
 * another has.
 */
export class MemoryStorage implements StorageAdapter {
  private readonly docs = new Map<string, Stored>();

  constructor(readonly id = 'memory') {}

  async list(collection: Collection): Promise<IndexEntry[]> {
    const entries: IndexEntry[] = [];
    for (const [key, stored] of this.docs) {
      const [c, id] = key.split('/');
      if (c !== collection) continue;
      entries.push({
        ...indexSummary(collection, id, JSON.parse(stored.json)),
        updatedAt: stored.updatedAt,
      });
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(
    collection: Collection,
    id: string,
  ): Promise<{ doc: JsonObject; meta: StorageMeta } | null> {
    assertDocumentId(id);
    const stored = this.docs.get(`${collection}/${id}`);
    return stored
      ? { doc: JSON.parse(stored.json) as JsonObject, meta: { sha: stored.sha } }
      : null;
  }

  async put(
    collection: Collection,
    id: string,
    doc: JsonObject,
    opts: PutOptions = {},
  ): Promise<StorageMeta> {
    assertDocumentId(id);
    // What takes time first, then the check and the write with nothing awaited between them, as a
    // store's transaction is.
    const json = JSON.stringify(doc);
    const sha = await sha1Hex(json);
    const entries = collection === 'layouts' ? await this.list(collection) : [];
    const existing = this.docs.get(`${collection}/${id}`);
    // A missing document is not a conflict: the first write of an id always wins.
    if (opts.expectedSha !== undefined && existing && existing.sha !== opts.expectedSha) {
      throw new StorageConflictError();
    }
    if (collection === 'layouts') {
      const taken = nameTaken(entries, indexSummary(collection, id, doc).name, id, opts.replacing);
      if (taken) throw new NameTakenError(taken);
    }
    this.docs.set(`${collection}/${id}`, { json, sha, updatedAt: new Date().toISOString() });
    return { sha };
  }

  async delete(
    collection: Collection,
    id: string,
    opts: { message?: string; expectedSha?: string } = {},
  ): Promise<void> {
    assertDocumentId(id);
    const existing = this.docs.get(`${collection}/${id}`);
    if (opts.expectedSha !== undefined && existing && existing.sha !== opts.expectedSha) {
      throw new StorageConflictError();
    }
    this.docs.delete(`${collection}/${id}`);
  }
}
