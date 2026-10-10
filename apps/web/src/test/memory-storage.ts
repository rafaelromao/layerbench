import {
  assertDocumentId,
  type Collection,
  type IndexEntry,
  indexSummary,
  type JsonObject,
  type StorageAdapter,
  StorageConflictError,
  type StorageMeta,
} from '@layerbench/core';

interface Stored {
  json: string;
  sha: string;
  updatedAt: string;
}

/**
 * Storage held in memory, for tests: what the browser's store does, without a database. Documents
 * are kept as text, so each read is a copy, as from any real store, and each write gives the
 * document a new version, so a write that names an older one is a conflict. To make an operation
 * fail, replace it on the instance.
 */
export class MemoryStorage implements StorageAdapter {
  private readonly docs = new Map<string, Stored>();
  private writes = 0;

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
    opts: { expectedSha?: string; message?: string } = {},
  ): Promise<StorageMeta> {
    assertDocumentId(id);
    const existing = this.docs.get(`${collection}/${id}`);
    // A missing document is not a conflict: the first write of an id always wins.
    if (opts.expectedSha !== undefined && existing && existing.sha !== opts.expectedSha) {
      throw new StorageConflictError();
    }
    const sha = `${this.id}-${++this.writes}`;
    this.docs.set(`${collection}/${id}`, {
      json: JSON.stringify(doc),
      sha,
      updatedAt: new Date().toISOString(),
    });
    return { sha };
  }

  async delete(collection: Collection, id: string): Promise<void> {
    assertDocumentId(id);
    this.docs.delete(`${collection}/${id}`);
  }
}
