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

/** A document that could not be sent, and why. */
export interface Failure {
  collection: Collection;
  id: string;
  name: string;
  error: string;
}

/**
 * What copying up did: the documents sent to the gists, those that are the same in both, those
 * never edited here that differ from the gists' and were left as the gists have them, the
 * documents changed in both places, which are left as they are for the user to settle, the layouts
 * left here because the gists have another of the same name, and the documents that could not be
 * sent, each with why.
 */
export interface CopiedUp {
  copied: number;
  current: number;
  differing: number;
  conflicts: Conflict[];
  taken: number;
  failed: Failure[];
}

/** Copying up stopped partway; what it did before is in `result`, and what went up is in the gists. */
export class CopyUpError extends Error {
  constructor(
    readonly result: CopiedUp,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'CopyUpError';
  }

  get copied(): number {
    return this.result.copied;
  }
}

/** What looking at every document this browser holds, against the gists', found. */
export interface Audited {
  /** The same in both. */
  equal: number;
  /** Not edited here, the gists' being newer: this browser's copy was brought up to it. */
  adopted: number;
  /** Differing, and not known to be an older copy: marked, for sending to weigh. */
  marked: number;
  /** In this browser and not in the gists. */
  lacking: number;
}

/** Thrown when a copy up is told to stop. */
class Stopped extends Error {
  constructor() {
    super('GitHub did not answer in time');
    this.name = 'Stopped';
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

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** This many documents in a row that cannot be sent end a copy up: the gists are out of reach, not the documents. */
const FAILURES_IN_A_ROW = 3;

/**
 * Both stores at once. The browser copy is always written, and marked as not sent before anything
 * else is done with it, so work is never lost to a network problem or a tab that is closed
 * meanwhile, and the gists are the shared copy when someone is signed in. What is marked can be
 * sent later (`copyUp`), and until it is, it is what this browser shows, since it is the latest work.
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
   * One thing at a time: what reads a document and then writes it, a copy up's turn with each
   * document, a save's with the gists, a delete, must not interleave with another's, or one writes
   * over the other with what it read before. Only this storage's own: another tab has its own.
   */
  private turn: Promise<unknown> = Promise.resolve();

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.turn.then(work, work);
    this.turn = run.catch(() => {});
    return run;
  }

  /** Resolves once everything asked of this storage so far has finished, as a read's bringing this browser's copy up to date. */
  whenIdle(): Promise<void> {
    return this.turn.then(() => {});
  }

  /**
   * Whether the last listing of a collection was the whole of it: false when the gists could
   * not be listed, and the browser's copy alone was.
   */
  listedWhole(collection: Collection): boolean {
    return !this.partial.has(collection);
  }

  async list(collection: Collection): Promise<IndexEntry[]> {
    // A browser store that cannot be read is not an empty one, where it is all there is.
    if (!this.remote) return this.local.list(collection);
    const local = await this.local.list(collection).catch(() => [] as IndexEntry[]);
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
          this.adopt(collection, id, remote);
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

  /**
   * Bring this browser's copy up to a version just read from the gists, and record it as the one
   * both hold: what an edit of the document is made on is what was handed out, and an edit made
   * on it, offline too, is an edit of that. Not where edits are waiting to be sent, which are not
   * replaced; and if this browser's copy cannot be brought up (a name it has for another layout),
   * the version both last held stays what it was, and an edit of it is weighed as a conflict.
   * It does not hold the read up.
   */
  private adopt(
    collection: Collection,
    id: string,
    remote: { doc: JsonObject; meta: StorageMeta },
  ) {
    void this.exclusive(async () => {
      if (this.marks.has(collection, id)) return;
      const mine = await this.local.get(collection, id).catch(() => null);
      if (!mine || !sameDocument(mine.doc, remote.doc)) {
        try {
          await this.local.put(collection, id, remote.doc, { message: `Read ${collection} ${id}` });
        } catch {
          return;
        }
      }
      this.marks.setBase(collection, id, remote.meta.sha);
    }).catch(() => {});
  }

  /** Mark a document as not sent before it is written here, so a save cut short leaves its mark. */
  private async writeAhead<T>(collection: Collection, id: string, write: () => Promise<T>) {
    const was = this.marks.has(collection, id);
    this.marks.mark(collection, id);
    try {
      const written = await write();
      // Marked again once it is written: a send that finished while it was being written looked
      // at the copy from before, and cleared the mark of that one.
      this.marks.mark(collection, id);
      return written;
    } catch (e) {
      if (!was) this.marks.clear(collection, id);
      throw e;
    }
  }

  async put(
    collection: Collection,
    id: string,
    doc: JsonObject,
    opts: PutOptions = {},
  ): Promise<StorageMeta> {
    const here = { message: opts.message, replacing: opts.replacing };
    const remote = this.remote;
    if (!remote) {
      const meta = await this.writeAhead(collection, id, () =>
        this.local.put(collection, id, doc, here),
      );
      this.marks.notify();
      return meta;
    }
    // The gists may have a layout of this name the browser does not know of. They are asked
    // first, so the browser takes no copy of one they would refuse; unreachable, they refuse
    // nothing yet, and the browser's copy is the work kept. Each store judges its own names: a
    // duplicate made before that the gists have twice and the browser once is refused by the
    // browser, and Overwrite then makes one of the two. Nothing is saved yet, so a tab closed
    // while this waits loses only a save not made.
    if (collection === 'layouts') {
      const there = await remote.list(collection).catch(() => null);
      const name = indexSummary(collection, id, doc).name;
      const taken = there && nameTaken(there, name, id, opts.replacing);
      if (taken) throw new NameTakenError(taken);
    }
    const waiting = this.marks.has(collection, id);
    const before = waiting ? null : await this.local.get(collection, id).catch(() => null);
    // Written ahead: from here on, whatever happens to the gists, a mark says it is not sent.
    const saved = await this.writeAhead(collection, id, () =>
      this.local.put(collection, id, doc, here),
    );
    // Edits not sent yet are not written to the gists by their next save either: the gists may
    // hold a version this browser has not seen, which the sender weighs, with a check against it.
    if (waiting) {
      this.marks.notify();
      return saved;
    }
    return this.exclusive(() => this.sendSave(collection, id, doc, opts, saved, before));
  }

  /** A save's turn with the gists: write over the version it is an edit of, or leave it marked. */
  private async sendSave(
    collection: Collection,
    id: string,
    doc: JsonObject,
    opts: PutOptions,
    saved: StorageMeta,
    before: { doc: JsonObject } | null,
  ): Promise<StorageMeta> {
    const remote = this.remote as StorageAdapter;
    // What is behind is not known if the gists cannot be read: it stays here, marked, and the
    // sender looks again when they can be.
    let seen: Awaited<ReturnType<StorageAdapter['get']>>;
    try {
      seen = await remote.get(collection, id);
    } catch {
      this.marks.notify();
      return saved;
    }
    if (seen && sameDocument(seen.doc, doc)) {
      await this.settled(collection, id, seen.meta.sha, doc);
      return saved;
    }
    if (seen) {
      // The gists hold a version this save is not an edit of: another browser saved it since this
      // one last held it. Writing over it would lose that save, so this one stays here, marked, and
      // is sent as a conflict for the user to settle. With no record of the version it is an edit
      // of, that is so where this browser held a copy of the document already (one from before
      // versions were kept); a document it never held is one the user knowingly writes to, as when
      // they choose to overwrite a layout of the same name.
      const base = this.marks.base(collection, id);
      if (base === null ? before !== null : seen.meta.sha !== base) {
        this.marks.notify();
        return saved;
      }
    }
    try {
      const meta = await remote.put(collection, id, doc, {
        ...opts,
        expectedSha: opts.expectedSha !== undefined ? opts.expectedSha : (seen?.meta.sha ?? null),
      });
      // Both now hold this version.
      await this.settled(collection, id, meta.sha, doc);
      return meta;
    } catch (e) {
      if (e instanceof StorageConflictError && opts.expectedSha === undefined) {
        // Saved in the gists in between: the sender weighs it, with what is there now.
        this.marks.notify();
        return saved;
      }
      if (e instanceof StorageConflictError || e instanceof NameTakenError) {
        // Refused for what the gists hold, and so for the caller to decide about: not left here to
        // be sent unasked, nor as a copy of what was refused.
        await this.undo(collection, id, before);
        throw e;
      }
      // Any other failure leaves it marked, to be sent when the gists can be written again, and
      // propagates, for the user to see.
      throw e;
    }
  }

  /** Put back what this browser held before a save that was then refused. */
  private async undo(collection: Collection, id: string, before: { doc: JsonObject } | null) {
    try {
      if (before) await this.local.put(collection, id, before.doc, {});
      else await this.local.delete(collection, id);
    } catch {
      // Left as it is, and marked: the user is told, and it is weighed when sent.
      return;
    }
    this.marks.clear(collection, id);
  }

  delete(collection: Collection, id: string, opts: { message?: string } = {}): Promise<void> {
    return this.exclusive(async () => {
      if (this.remote) {
        // The gists first: if they cannot be reached, nothing is deleted, edits not sent included.
        const seen = await this.remote.get(collection, id);
        const base = this.marks.base(collection, id);
        // Another browser saved it since this one last held it: that save is not deleted unseen.
        if (seen && base !== null && seen.meta.sha !== base) throw new StorageConflictError();
        await this.remote.delete(collection, id, opts);
      }
      await this.local.delete(collection, id, opts);
      // Gone from this browser, there is nothing left of it to send.
      this.marks.forget(collection, id);
    });
  }

  /** Whether there are gists to copy up to, rather than the browser store alone. */
  get reachesRemote(): boolean {
    return this.remote !== null;
  }

  /**
   * Look at every document this browser holds that is not marked, against the gists' by content,
   * never by when each was saved: the same in both, and what both hold is recorded; not edited here
   * since the version both last held, with the gists' since changed, and this browser's copy is
   * brought up to it; any other that differs is marked, for `copyUp` to send or raise as a conflict.
   * One the gists lack is counted and left: another browser may have deleted it.
   */
  async audit(opts: { signal?: AbortSignal } = {}): Promise<Audited> {
    const found: Audited = { equal: 0, adopted: 0, marked: 0, lacking: 0 };
    const remote = this.remote;
    if (!remote) return found;
    for (const collection of COLLECTIONS) {
      if (opts.signal?.aborted) throw new Stopped();
      const [here, there] = await Promise.all([
        this.local.list(collection),
        remote.list(collection),
      ]);
      const theirs = new Set(there.map((e) => e.id));
      for (const { id } of here) {
        if (this.marks.has(collection, id)) continue;
        if (!theirs.has(id)) {
          found.lacking++;
          continue;
        }
        await this.exclusive(async () => {
          if (opts.signal?.aborted) throw new Stopped();
          if (this.marks.has(collection, id)) return;
          const [mine, seen] = await Promise.all([
            this.local.get(collection, id),
            remote.get(collection, id),
          ]);
          if (!mine) return;
          if (!seen) {
            found.lacking++;
            return;
          }
          if (sameDocument(mine.doc, seen.doc)) {
            this.marks.setBase(collection, id, seen.meta.sha);
            found.equal++;
            return;
          }
          const base = this.marks.base(collection, id);
          if (base !== null && mine.meta.sha === base) {
            try {
              await this.local.put(collection, id, seen.doc, {
                message: `Read ${collection} ${id}`,
              });
              this.marks.setBase(collection, id, seen.meta.sha);
              found.adopted++;
            } catch {
              // Not brought up: left as it is, and not an edit.
            }
            return;
          }
          this.marks.mark(collection, id);
          found.marked++;
        });
      }
    }
    return found;
  }

  /**
   * Copy up: send the gists each document edited here that nobody has touched in the gists since
   * they last held it, or that they lack. A document edited here and in the gists since is a
   * conflict: it is left as it is in both and returned, for the user to settle with `keepMine` or
   * `keepTheirs`. One saved in the gists while copying is left as it is, as a conflict if it was
   * edited here, and nothing is deleted or comes down. A document that cannot be sent is reported
   * with why, and the rest go on; several in a row end it, as the gists are then out of reach,
   * keeping what went up. What it sends, or finds the gists hold already, is no longer marked as
   * unsent; a layout left for its name, a conflict, and one that could not be sent, are.
   *
   * With `everything`, the documents never marked are weighed too, as those saved before edits
   * were marked have to be: each that differs and has no version on record is sent if this browser
   * saved it later than the gists, by when each was saved, and left as it is otherwise. That is for
   * the user to ask for, as a document the gists lack may be one another browser deleted.
   */
  async copyUp(opts: { everything?: boolean; signal?: AbortSignal } = {}): Promise<CopiedUp> {
    const everything = opts.everything === true;
    const remote = this.remote;
    const done: CopiedUp = {
      copied: 0,
      current: 0,
      differing: 0,
      conflicts: [],
      taken: 0,
      failed: [],
    };
    if (!remote) return done;
    const stopped = () => {
      // Given up on by whoever asked: it stops at the next document, keeping what went up.
      if (opts.signal?.aborted) throw new Stopped();
    };
    try {
      for (const collection of COLLECTIONS) {
        stopped();
        const here = await this.local.list(collection);
        await this.prune(collection, new Set(here.map((e) => e.id)));
        let inARow = 0;
        for (const entry of here) {
          try {
            await this.exclusive(async () => {
              stopped();
              await this.sendOne(collection, entry, everything, done, true);
            });
            inARow = 0;
          } catch (e) {
            if (e instanceof Stopped) throw e;
            done.failed.push({ collection, id: entry.id, name: entry.name, error: messageOf(e) });
            if (++inARow >= FAILURES_IN_A_ROW) throw e;
          }
        }
      }
    } catch (e) {
      throw new CopyUpError(done, e);
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
    everything: boolean,
    done: CopiedUp,
    again: boolean,
  ): Promise<void> {
    const remote = this.remote as StorageAdapter;
    const id = listed.id;
    if (!everything && !this.marks.has(collection, id)) return;
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
      if (!seen) {
        // Deleted there in between: nothing to weigh it against, so once more as new.
        if (again) return this.sendOne(collection, listed, everything, done, false);
        throw e;
      }
      if (sameDocument(seen.doc, stored.doc)) {
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
   * one. One never marked, weighed by a copy of everything, goes over an older one if no version of
   * it is on record.
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
   * gists' copy is the one this browser's differs from, and is counted as that, not as up to date.
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
      done.differing++;
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
   * the version the user was shown any more, or this browser's copy has been saved again since the
   * user was shown it, nothing is written, and `changed` says so; if the gists' is gone, deleted
   * since, there is nothing to keep, and `gone` says so: this browser's version is not written
   * over, and is sent again.
   */
  keepTheirs(conflict: Conflict): Promise<'kept' | 'changed' | 'gone'> {
    return this.exclusive(async () => {
      const { collection, id } = conflict;
      if (!this.remote) throw new Error('GitHub is not set up here');
      const seen = await this.remote.get(collection, id);
      if (!seen) return 'gone';
      if (seen.meta.sha !== conflict.theirs.sha) return 'changed';
      // An edit made here since the user was shown the two is not one they chose to throw away.
      const mine = await this.local.get(collection, id);
      if (mine && !sameDocument(mine.doc, conflict.mine.doc)) return 'changed';
      await this.local.put(collection, id, seen.doc, {
        message: `Keep GitHub's ${collection} ${conflict.name}`,
      });
      await this.settled(collection, id, seen.meta.sha, seen.doc);
      return 'kept';
    });
  }
}
