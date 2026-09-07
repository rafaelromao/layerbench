import type {
  Collection,
  IndexEntry,
  JsonObject,
  StorageAdapter,
  StorageMeta,
} from '@layoutmaster/core';

/**
 * Both stores at once. The browser copy is always written, so work is never lost to a network
 * problem, and the repository is the shared copy when one is configured.
 */
export class CompositeStorage implements StorageAdapter {
  readonly id = 'composite';

  constructor(
    private readonly local: StorageAdapter,
    private readonly remote: StorageAdapter | null,
  ) {}

  async list(collection: Collection): Promise<IndexEntry[]> {
    const local = await this.local.list(collection).catch(() => [] as IndexEntry[]);
    if (!this.remote) return local;
    try {
      const remote = await this.remote.list(collection);
      // The repository is the shared truth, so its entry wins where both hold the same id.
      const merged = new Map(local.map((e) => [e.id, e]));
      for (const e of remote) merged.set(e.id, e);
      return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return local;
    }
  }

  async get(
    collection: Collection,
    id: string,
  ): Promise<{ doc: JsonObject; meta: StorageMeta } | null> {
    if (this.remote) {
      try {
        const remote = await this.remote.get(collection, id);
        if (remote) return remote;
      } catch {
        // Fall back to the browser copy rather than failing the read.
      }
    }
    return this.local.get(collection, id);
  }

  async put(
    collection: Collection,
    id: string,
    doc: JsonObject,
    opts: { expectedSha?: string; message?: string } = {},
  ): Promise<StorageMeta> {
    const localMeta = await this.local.put(collection, id, doc, { message: opts.message });
    if (!this.remote) return localMeta;
    // A conflict propagates: the work is safe locally, and the user decides what to do about it.
    return this.remote.put(collection, id, doc, opts);
  }

  async delete(collection: Collection, id: string, opts: { message?: string } = {}): Promise<void> {
    await this.local.delete(collection, id, opts).catch(() => {});
    if (this.remote) await this.remote.delete(collection, id, opts);
  }

  /** Push everything held in the browser to the repository, for a first sync. */
  async pushAll(collection: Collection): Promise<number> {
    if (!this.remote) return 0;
    const entries = await this.local.list(collection);
    let pushed = 0;
    for (const entry of entries) {
      const stored = await this.local.get(collection, entry.id);
      if (!stored) continue;
      await this.remote.put(collection, entry.id, stored.doc, {
        message: `Copy ${collection} ${entry.name} from the browser`,
      });
      pushed++;
    }
    return pushed;
  }
}
