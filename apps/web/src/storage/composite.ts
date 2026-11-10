import {
  COLLECTIONS,
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
  stableStringify,
} from '@layerbench/core';
import { type Unsynced, unsynced } from './unsynced.js';

/**
 * A document changed here since the gists last held it, and in the gists since: neither version is
 * written over the other until the user says which to keep.
 */
export interface Conflict {
  collection: Collection;
  id: string;
  /** The document's name as it is saved here, which is the one shown. */
  name: string;
  /** This browser's version, and when it was saved. */
  mine: { doc: JsonObject; updatedAt: string };
  /** The gists' version, when it was saved, and its version for writing over it. */
  theirs: { name: string; doc: JsonObject; updatedAt: string; sha: string };
}

/**
 * What copying up did: the documents sent to the gists, those they had as new already, the
 * documents changed in both places, which are left as they are for the user to settle, and the
 * layouts left here because the gists have another of the same name.
 */
export interface CopiedUp {
  copied: number;
  current: number;
  conflicts: Conflict[];
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

/** Whether two stored documents say the same, whichever order their keys came in. */
function sameDocument(a: JsonObject, b: JsonObject): boolean {
  return stableStringify(a) === stableStringify(b);
}

/** Whether this browser's copy was saved after the gists', or the gists have none. */
function newer(here: IndexEntry, there: IndexEntry | undefined): boolean {
  // A date that cannot be read compares as neither, so its copy is left alone.
  return there === undefined || Date.parse(here.updatedAt) > Date.parse(there.updatedAt);
}

/**
 * Both stores at once. The browser copy is always written, so work is never lost to a network
 * problem, and the gists are the shared copy when someone is signed in. What reaches only the
 * browser is marked, so it can be sent later (`copyUp`), and until it is, it is what this browser
 * shows, since it is the latest work.
 */
export class CompositeStorage implements StorageAdapter {
  readonly id = 'composite';

  constructor(
    private readonly local: StorageAdapter,
    private readonly remote: StorageAdapter | null,
    private readonly marks: Unsynced = unsynced,
  ) {}

  /** The collections whose last listing had to do without the gists. */
  private readonly partial = new Set<Collection>();

  /**
   * One thing at a time: a save, a delete, and one document's turn in a copy up each read a
   * document and then write it, which must not interleave with another's, or one writes over the
   * other with what it read before.
   */
  private turn: Promise<unknown> = Promise.resolve();

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.turn.then(work, work);
    this.turn = run.catch(() => {});
    return run;
  }

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
      // The gists are the shared truth, so their entry wins where both hold the same id, unless
      // this browser's has edits not sent yet: those are the latest work.
      const waiting = new Set(this.marks.marked(collection));
      const merged = new Map(local.map((e) => [e.id, e]));
      for (const e of remote) if (!waiting.has(e.id) || !merged.has(e.id)) merged.set(e.id, e);
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
    // Edits not sent yet are the latest work, so the gists' older copy does not stand in for them.
    if (this.marks.has(collection, id)) {
      const waiting = await this.local.get(collection, id).catch(() => null);
      if (waiting) return waiting;
    }
    let unreachable: unknown = null;
    if (this.remote) {
      try {
        const remote = await this.remote.get(collection, id);
        if (remote) {
          // What is handed out is what an edit of it is made on: a save that finds the gists
          // holding another version since is an edit of a version that is no longer there.
          this.marks.setBase(collection, id, remote.meta.sha);
          return remote;
        }
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

  put(
    collection: Collection,
    id: string,
    doc: JsonObject,
    opts: PutOptions = {},
  ): Promise<StorageMeta> {
    return this.exclusive(async () => {
      const here = { message: opts.message, replacing: opts.replacing };
      if (!this.remote) {
        const meta = await this.local.put(collection, id, doc, here);
        this.marks.mark(collection, id);
        this.marks.notify();
        return meta;
      }
      // A document with edits not sent yet is not written to the gists by its next save either: they
      // may hold a version this browser has not seen, which is for sending to settle, with a check
      // against it. It is sent a moment later.
      if (this.marks.has(collection, id)) {
        const meta = await this.local.put(collection, id, doc, here);
        this.marks.notify();
        return meta;
      }
      // The gists may have a layout of this name the browser does not know of. They are asked
      // first, so the browser takes no copy of one they would refuse; unreachable, they refuse
      // nothing yet, and the browser's copy is the work kept. Each store judges its own names: a
      // duplicate made before that the gists have twice and the browser once is refused by the
      // browser, and Overwrite then makes one of the two.
      if (collection === 'layouts') {
        const there = await this.remote.list(collection).catch(() => null);
        const name = indexSummary(collection, id, doc).name;
        const taken = there && nameTaken(there, name, id, opts.replacing);
        if (taken) throw new NameTakenError(taken);
      }
      // The gists may hold a version this save is not an edit of: another browser saved the
      // document since this one last held it. Writing over it would lose that save, so this one
      // stays here, marked, and is sent as a conflict for the user to settle.
      const base = this.marks.base(collection, id);
      if (base !== null) {
        const seen = await this.remote.get(collection, id).catch(() => null);
        if (seen && seen.meta.sha !== base) {
          const meta = await this.local.put(collection, id, doc, here);
          this.marks.mark(collection, id);
          this.marks.notify();
          return meta;
        }
      }
      await this.local.put(collection, id, doc, here);
      try {
        const meta = await this.remote.put(collection, id, doc, opts);
        // Both now hold this version.
        await this.settled(collection, id, meta.sha, doc);
        return meta;
      } catch (e) {
        // The work is safe locally. A failure to write is marked, and the document is sent when
        // the gists can be written again; one the gists refused for what they hold (a version
        // that changed, a name that is taken) is the user's to decide about, so not sent unasked.
        // Either propagates, for the user to see.
        if (!(e instanceof StorageConflictError) && !(e instanceof NameTakenError)) {
          this.marks.mark(collection, id);
        }
        throw e;
      }
    });
  }

  delete(collection: Collection, id: string, opts: { message?: string } = {}): Promise<void> {
    return this.exclusive(async () => {
      await this.local.delete(collection, id, opts).catch(() => {});
      // Gone from this browser, there is nothing left of it to send.
      this.marks.forget(collection, id);
      if (this.remote) await this.remote.delete(collection, id, opts);
    });
  }

  /** Whether there are gists to copy up to, rather than the browser store alone. */
  get reachesRemote(): boolean {
    return this.remote !== null;
  }

  /**
   * Copy up: send the gists each document edited here that nobody has touched in the gists since
   * they last held it, or that they lack. A document edited here and in the gists since is a
   * conflict: it is left as it is in both and returned, for the user to settle with `keepMine` or
   * `keepTheirs`. One saved in the gists while copying is left as it is, as a conflict if it was
   * edited here, and nothing is deleted or comes down. It stops at the first failure, keeping what
   * went up before it, so trying again carries on from there. What it sends, or finds the gists
   * hold already, is no longer marked as unsent; a layout left for its name, and a conflict, are.
   *
   * With `everything`, the documents never marked are weighed too, as those saved before edits
   * were marked have to be: each is sent that this browser saved later than the gists, by when each
   * was saved, and left as it is otherwise. That is for the user to ask for, as a document the gists
   * lack may be one another browser deleted.
   */
  async copyUp(opts: { everything?: boolean; signal?: AbortSignal } = {}): Promise<CopiedUp> {
    const everything = opts.everything === true;
    const stopped = () => {
      // Given up on by whoever asked: it stops at the next document, keeping what went up.
      if (opts.signal?.aborted) throw new Error('GitHub did not answer in time');
    };
    const remote = this.remote;
    const done: CopiedUp = { copied: 0, current: 0, conflicts: [], taken: 0 };
    if (!remote) return done;
    try {
      for (const collection of COLLECTIONS) {
        stopped();
        const [here, there] = await Promise.all([
          this.local.list(collection),
          remote.list(collection),
        ]);
        await this.prune(collection, new Set(here.map((e) => e.id)));
        const theirs = new Map(there.map((e) => [e.id, e]));
        for (const entry of here) {
          await this.exclusive(async () => {
            stopped();
            await this.sendOne(collection, entry, theirs.get(entry.id), everything, done);
          });
        }
      }
    } catch (e) {
      throw new CopyUpError(done.copied, e);
    }
    return done;
  }

  /** Forget the marks of documents this browser no longer holds, having looked for each. */
  private async prune(collection: Collection, listed: ReadonlySet<string>): Promise<void> {
    for (const id of this.marks.marked(collection)) {
      if (listed.has(id)) continue;
      // Not in the list taken a moment ago; it may have been saved since.
      let gone = false;
      try {
        gone = (await this.local.get(collection, id)) === null;
      } catch {
        // Not known to be gone.
      }
      if (gone) this.marks.forget(collection, id);
    }
  }

  /** One document's turn in a copy up. */
  private async sendOne(
    collection: Collection,
    listed: IndexEntry,
    first: IndexEntry | undefined,
    everything: boolean,
    done: CopiedUp,
  ): Promise<void> {
    const remote = this.remote as StorageAdapter;
    const id = listed.id;
    if (!this.marks.has(collection, id) && !(everything && newer(listed, first))) {
      if (everything) done.current++;
      return;
    }
    const stored = await this.local.get(collection, id);
    // Listed, but with nothing behind it to send.
    if (!stored) {
      this.marks.forget(collection, id);
      return;
    }
    // As of now, not as of the list: it may have been saved again while waiting for its turn.
    const entry = (await this.local.list(collection)).find((e) => e.id === id) ?? listed;
    const marked = this.marks.has(collection, id);
    // Another browser may have saved it since the gists were listed: its version is taken first,
    // then the list is checked again, and the copy is written only over that version, so a save
    // that lands in between is never written over.
    let seen = await remote.get(collection, id);
    let now = (await remote.list(collection)).find((e) => e.id === id);
    if (seen && sameDocument(seen.doc, stored.doc)) {
      await this.settled(collection, id, seen.meta.sha, stored.doc);
      done.current++;
      return;
    }
    if (seen && !this.ahead(collection, entry, now, seen.meta.sha, marked)) {
      this.leave(collection, entry, stored.doc, seen, now, marked, done);
      return;
    }
    try {
      const meta = await remote.put(collection, id, stored.doc, {
        // Not there, it must still not be there: one made meanwhile is not written over.
        expectedSha: seen?.meta.sha ?? null,
        message: `Copy ${collection} ${entry.name} from the browser`,
      });
      await this.settled(collection, id, meta.sha, stored.doc);
    } catch (e) {
      // The gists have another layout of its name: it stays here, for the user to rename.
      if (e instanceof NameTakenError) {
        done.taken++;
        return;
      }
      if (!(e instanceof StorageConflictError)) throw e;
      // Saved there since it was read: what is there now is what to weigh it against.
      seen = await remote.get(collection, id);
      now = (await remote.list(collection)).find((x) => x.id === id);
      if (seen && sameDocument(seen.doc, stored.doc)) {
        await this.settled(collection, id, seen.meta.sha, stored.doc);
        done.current++;
      } else this.leave(collection, entry, stored.doc, seen, now, marked, done);
      return;
    }
    done.copied++;
  }

  /**
   * Both stores now hold `sent`: it is what later edits are weighed against, and nothing is waiting,
   * unless this browser's copy has been saved again since (by another tab), which is not what went up.
   */
  private async settled(
    collection: Collection,
    id: string,
    sha: string,
    sent: JsonObject,
  ): Promise<void> {
    this.marks.setBase(collection, id, sha);
    const now = await this.local.get(collection, id).catch(() => null);
    if (!now || sameDocument(now.doc, sent)) this.marks.clear(collection, id);
  }

  /**
   * Whether this browser's copy goes over the gists' version. One edited here goes over the
   * version it was an edit of, which is what the gists hold if nobody has touched it since, and
   * over no other; with no record of which version that was, it is not known to be an edit of this
   * one. One never marked, weighed by a copy of everything, goes over an older one.
   */
  private ahead(
    collection: Collection,
    entry: IndexEntry,
    now: IndexEntry | undefined,
    sha: string,
    marked: boolean,
  ): boolean {
    const base = this.marks.base(collection, entry.id);
    // Never edited here and a version on record: nothing here to send, and the gists' version is
    // another's. With no record, by when each was saved, as before versions were kept.
    if (!marked) return base === null && newer(entry, now);
    return base !== null && sha === base;
  }

  /**
   * Leave a document as it is in both places. Edited here, with the gists' version not the one the
   * edit was made on, it is a conflict, which is returned and stays marked. Not edited here, the
   * gists' copy is the newer and nothing is to be done.
   */
  private leave(
    collection: Collection,
    entry: IndexEntry,
    doc: JsonObject,
    seen: { doc: JsonObject; meta: StorageMeta } | null,
    now: IndexEntry | undefined,
    marked: boolean,
    done: CopiedUp,
  ): void {
    if (!marked || !seen) {
      done.current++;
      return;
    }
    done.conflicts.push({
      collection,
      id: entry.id,
      name: entry.name,
      mine: { doc, updatedAt: entry.updatedAt },
      theirs: {
        name: now?.name ?? entry.name,
        doc: seen.doc,
        updatedAt: now?.updatedAt ?? '',
        sha: seen.meta.sha,
      },
    });
  }

  /**
   * Settle a conflict by keeping this browser's version: it is sent over the gists' version the
   * user was shown. If that has changed again meanwhile nothing is written, and `changed` says so:
   * the conflict is a new one, to be looked at again.
   */
  keepMine(conflict: Conflict): Promise<'kept' | 'changed'> {
    return this.exclusive(async () => {
      const { collection, id } = conflict;
      const stored = await this.local.get(collection, id);
      if (!stored) {
        this.marks.forget(collection, id);
        return 'kept';
      }
      if (!this.remote) throw new Error('GitHub is not set up here');
      try {
        const meta = await this.remote.put(collection, id, stored.doc, {
          expectedSha: conflict.theirs.sha,
          message: `Keep the browser's ${collection} ${conflict.name}`,
        });
        await this.settled(collection, id, meta.sha, stored.doc);
        return 'kept';
      } catch (e) {
        if (e instanceof StorageConflictError) return 'changed';
        throw e;
      }
    });
  }

  /**
   * Settle a conflict by keeping the gists' version: this browser's copy becomes it. If it is not
   * the version the user was shown any more, nothing is written, and `changed` says so; if it is
   * gone, deleted from the gists since, there is nothing to keep, and `gone` says so: this
   * browser's version is not written over, and is sent again.
   */
  keepTheirs(conflict: Conflict): Promise<'kept' | 'changed' | 'gone'> {
    return this.exclusive(async () => {
      const { collection, id } = conflict;
      if (!this.remote) throw new Error('GitHub is not set up here');
      const seen = await this.remote.get(collection, id);
      if (!seen) return 'gone';
      if (seen.meta.sha !== conflict.theirs.sha) return 'changed';
      await this.local.put(collection, id, seen.doc, {
        message: `Keep GitHub's ${collection} ${conflict.name}`,
      });
      await this.settled(collection, id, seen.meta.sha, seen.doc);
      return 'kept';
    });
  }
}
