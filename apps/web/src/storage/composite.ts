import {
  COLLECTIONS,
  type Collection,
  type IndexEntry,
  type JsonObject,
  NameTakenError,
  type StorageAdapter,
  StorageConflictError,
  type StorageMeta,
} from '@layerbench/core';

/**
 * What copying up did: the documents sent to the gists, those they had as new already, and the
 * layouts left here because the gists have another of the same name.
 */
export interface CopiedUp {
  copied: number;
  current: number;
  taken: number;
}

/** Copying up stopped partway; what went up before it is in the gists. */
export class CopyUpError extends Error {
  constructor(
    readonly copied: number,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'CopyUpError';
  }
}

/** Whether this browser's copy was saved after the gists', or the gists have none. */
function newer(here: IndexEntry, there: IndexEntry | undefined): boolean {
  // A date that cannot be read compares as neither, so its copy is left alone.
  return there === undefined || Date.parse(here.updatedAt) > Date.parse(there.updatedAt);
}

/**
 * Both stores at once. The browser copy is always written, so work is never lost to a network
 * problem, and the gists are the shared copy when someone is signed in.
 */
export class CompositeStorage implements StorageAdapter {
  readonly id = 'composite';

  constructor(
    private readonly local: StorageAdapter,
    private readonly remote: StorageAdapter | null,
  ) {}

  /** The collections whose last listing had to do without the gists. */
  private readonly partial = new Set<Collection>();

  /**
   * Whether the last listing of a collection was the whole of it: false when the gists could
   * not be listed, and the browser's copy alone was.
   */
  listedWhole(collection: Collection): boolean {
    return !this.partial.has(collection);
  }

  async list(collection: Collection): Promise<IndexEntry[]> {
    const local = await this.local.list(collection).catch(() => [] as IndexEntry[]);
    if (!this.remote) return local;
    try {
      const remote = await this.remote.list(collection);
      this.partial.delete(collection);
      // The gists are the shared truth, so their entry wins where both hold the same id.
      const merged = new Map(local.map((e) => [e.id, e]));
      for (const e of remote) merged.set(e.id, e);
      return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      this.partial.add(collection);
      return local;
    }
  }

  async get(
    collection: Collection,
    id: string,
  ): Promise<{ doc: JsonObject; meta: StorageMeta } | null> {
    let unreachable: unknown = null;
    if (this.remote) {
      try {
        const remote = await this.remote.get(collection, id);
        if (remote) return remote;
      } catch (e) {
        // Fall back to the browser copy rather than failing the read.
        unreachable = e;
      }
    }
    const local = await this.local.get(collection, id);
    // Without a browser copy, gists that could not be read do not say there is none.
    if (!local && unreachable) throw unreachable;
    return local;
  }

  async put(
    collection: Collection,
    id: string,
    doc: JsonObject,
    opts: { expectedSha?: string | null; message?: string } = {},
  ): Promise<StorageMeta> {
    if (!this.remote) return this.local.put(collection, id, doc, { message: opts.message });
    const before = await this.local.get(collection, id).catch(() => null);
    await this.local.put(collection, id, doc, { message: opts.message });
    try {
      // A conflict propagates: the work is safe locally, and the user decides what to do about it.
      return await this.remote.put(collection, id, doc, opts);
    } catch (e) {
      // The gists have another layout of this name, which the browser did not know of: what the
      // browser wrote is taken back, so it keeps no second of the name once the user overwrites.
      if (e instanceof NameTakenError) {
        await (before
          ? this.local.put(collection, id, before.doc)
          : this.local.delete(collection, id)
        ).catch(() => {});
      }
      throw e;
    }
  }

  async delete(collection: Collection, id: string, opts: { message?: string } = {}): Promise<void> {
    await this.local.delete(collection, id, opts).catch(() => {});
    if (this.remote) await this.remote.delete(collection, id, opts);
  }

  /** Whether there are gists to copy up to, rather than the browser store alone. */
  get reachesRemote(): boolean {
    return this.remote !== null;
  }

  /**
   * Copy up: send the gists each document this browser holds that they lack, or holds an
   * older copy of, by when each was saved. One saved the same moment, or later, in the gists
   * is left as it is, as is one whose date cannot be read, or one saved there while copying;
   * nothing is deleted, and nothing comes down. It stops at the first failure, keeping what went up before it, so trying again carries
   * on from there.
   */
  async copyUp(): Promise<CopiedUp> {
    const remote = this.remote;
    const done: CopiedUp = { copied: 0, current: 0, taken: 0 };
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
          // Another browser may have saved it since the gists were listed: its version is
          // taken first, then the list is checked again, and the copy is written only over that
          // version, so a save that lands in between is never written over.
          const version = (await remote.get(collection, entry.id))?.meta.sha;
          const now = (await remote.list(collection)).find((e) => e.id === entry.id);
          if (!newer(entry, now)) {
            done.current++;
            continue;
          }
          try {
            await remote.put(collection, entry.id, stored.doc, {
              // Not there, it must still not be there: one made meanwhile is not written over.
              expectedSha: version ?? null,
              message: `Copy ${collection} ${entry.name} from the browser`,
            });
          } catch (e) {
            // The gists have another layout of its name: it stays here, for the user to rename.
            if (e instanceof NameTakenError) {
              done.taken++;
              continue;
            }
            if (!(e instanceof StorageConflictError)) throw e;
            done.current++;
            continue;
          }
          done.copied++;
        }
      }
    } catch (e) {
      throw new CopyUpError(done.copied, e);
    }
    return done;
  }
}
