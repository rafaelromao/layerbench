import {
  COLLECTIONS,
  type Collection,
  type IndexEntry,
  type JsonObject,
  type StorageAdapter,
  type StorageMeta,
} from '@layerbench/core';

/** What copying up did: the documents sent to the repository, and those it had as new already. */
export interface CopiedUp {
  copied: number;
  current: number;
}

/** Copying up stopped partway; what went up before it is in the repository. */
export class CopyUpError extends Error {
  constructor(
    readonly copied: number,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'CopyUpError';
  }
}

/** Whether this browser's copy was saved after the repository's, or the repository has none. */
function newer(here: IndexEntry, there: IndexEntry | undefined): boolean {
  // A date that cannot be read compares as neither, so its copy is left alone.
  return there === undefined || Date.parse(here.updatedAt) > Date.parse(there.updatedAt);
}

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

  /** Whether there is a repository to copy up to, rather than the browser store alone. */
  get reachesRemote(): boolean {
    return this.remote !== null;
  }

  /**
   * Copy up: send the repository each document this browser holds that it lacks, or holds an
   * older copy of, by when each was saved. One saved the same moment, or later, in the repository
   * is left as it is, as is one whose date cannot be read; nothing is deleted, and nothing comes
   * down. It stops at the first failure, keeping what went up before it, so trying again carries
   * on from there.
   */
  async copyUp(): Promise<CopiedUp> {
    const remote = this.remote;
    const done: CopiedUp = { copied: 0, current: 0 };
    if (!remote) return done;
    try {
      for (const collection of COLLECTIONS) {
        const [here, there] = await Promise.all([
          this.local.list(collection),
          remote.list(collection),
        ]);
        const theirs = new Map(there.map((e) => [e.id, e]));
        for (const entry of here) {
          if (!newer(entry, theirs.get(entry.id))) {
            done.current++;
            continue;
          }
          const stored = await this.local.get(collection, entry.id);
          // Listed, but with nothing behind it to send.
          if (!stored) continue;
          await remote.put(collection, entry.id, stored.doc, {
            message: `Copy ${collection} ${entry.name} from the browser`,
          });
          done.copied++;
        }
      }
    } catch (e) {
      throw new CopyUpError(done.copied, e);
    }
    return done;
  }
}
