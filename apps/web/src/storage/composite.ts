import {
  COLLECTIONS,
  type Collection,
  type Deletion,
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
import { type Missing, type Unsynced, unsynced } from './unsynced.js';

/**
 * A document changed here since the gists last held it, and in the gists since, or deleted from them
 * since: neither version is written over the other, nor this browser's deleted or sent back, until
 * the user says which to keep.
 */
export interface Conflict {
  collection: Collection;
  id: string;
  /** The document's name as it is saved here, which is the one shown. */
  name: string;
  /** This browser's version, and when it was saved. */
  mine: { doc: JsonObject; updatedAt: string };
  /**
   * The gists' version, when it was saved, and its version for writing over it; null where the gists
   * deleted the document since, as `deleted` says.
   */
  theirs: { name: string; doc: JsonObject; updatedAt: string; sha: string } | null;
  /** Where the gists deleted it: when, as they recorded it. */
  deleted?: { at: string };
}

/** A document deleted from this browser because it was deleted from the gists, by another browser. */
export interface Removed {
  collection: Collection;
  id: string;
  name: string;
}

/** A document that could not be sent, and why. */
export interface Failure {
  collection: Collection;
  id: string;
  name: string;
  error: string;
}

/**
 * What copying up did: the documents sent to the gists, those that are the same in both, the
 * documents that differ and are not known to be an edit of the version the gists hold, which are
 * left as they are for the user to settle, the layouts left here because the gists have another of
 * the same name, the documents that could not be sent, each with why, and this browser's copies of
 * documents deleted from the gists, which went from here too.
 */
export interface CopiedUp {
  copied: number;
  current: number;
  conflicts: Conflict[];
  taken: number;
  failed: Failure[];
  removed: Removed[];
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
  /** Not edited here, the gists' version having moved on: this browser's copy was brought up to it. */
  adopted: number;
  /** Differing, and not known to be an older copy: marked, for sending to weigh. */
  marked: number;
  /** In this browser and not in the gists, as `missing` lists them. */
  lacking: number;
  /** Those documents, by name. */
  missing: Missing[];
}

/** Thrown when a copy up is told to stop. */
class Stopped extends Error {
  constructor() {
    super('GitHub did not answer in time');
    this.name = 'Stopped';
  }
}

const nothingDone = (): CopiedUp => ({
  copied: 0,
  current: 0,
  conflicts: [],
  taken: 0,
  failed: [],
  removed: [],
});

/** Whether two stored documents say the same, whichever order their keys came in. */
function sameDocument(a: JsonObject, b: JsonObject): boolean {
  return stableStringify(a) === stableStringify(b);
}

const SLOW = Symbol('slow');

/** `read`, or `SLOW` if it has not answered in `ms`: it is not cancelled, only no longer waited for. */
function patient<T>(read: Promise<T>, ms: number): Promise<T | typeof SLOW> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(SLOW), ms);
    read.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * How long a read of the gists is waited for before this browser's own copy is shown instead, if it
 * has one, and how long the check of a layout's name against the gists is waited for before the save
 * goes on without it: on mobile data a request can take a minute to give up, and a person cannot.
 */
const READ_PATIENCE_MS = 5_000;
/** How long a save waits for its turn with the gists before it says it is kept, and carries on in the background. */
const SEND_PATIENCE_MS = 10_000;

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
      // Waited for a while, as a save is: on a bad connection a list is no reason for it to hang.
      const remote = await patient(this.remote.list(collection), READ_PATIENCE_MS);
      if (remote === SLOW) {
        this.partial.add(collection);
        return local;
      }
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
    // A browser that cannot be read is not a copy that is missing: the account's older one does not
    // stand in for it, as the next save would then be of that.
    if (this.marks.has(collection, id)) {
      const waiting = await this.local.get(collection, id);
      if (waiting) return waiting;
    }
    let unreachable: unknown = null;
    if (this.remote) {
      try {
        const read = this.remote.get(collection, id);
        let remote = await patient(read, READ_PATIENCE_MS);
        if (remote === SLOW) {
          // The gists are slow: what is here is shown rather than waiting for them, if there is any.
          const here = await this.local.get(collection, id).catch(() => null);
          if (here) return here;
          remote = await read;
        }
        if (remote) {
          const mine = await this.local.get(collection, id).catch(() => null);
          if (mine && !sameDocument(mine.doc, remote.doc)) {
            // This browser's copy differs, and is not known to be an older one nobody edited: it is an
            // edit whose mark was never written or was lost, as with the first version to keep
            // them. It is the latest work, so it is marked, shown, and weighed when sent.
            const base = this.marks.base(collection, id);
            if (base === null || mine.meta.sha !== base) {
              this.marks.mark(collection, id);
              this.marks.notify();
              return mine;
            }
          }
          // Only a copy that is here is kept up to date: not one made of everything read. One that is
          // not has only the version recorded, which an edit of it, saved here, is made on.
          if (mine) this.adopt(collection, id, remote);
          else this.marks.setBase(collection, id, remote.meta.sha);
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
   * both hold, so that what is edited offline afterwards is an edit of it. Only a copy that is
   * here, and not one with edits waiting to be sent or one that may be an edit: it is brought up
   * only if it is the version both last held, and otherwise marked, to be weighed. It does not hold
   * the read up.
   */
  private adopt(
    collection: Collection,
    id: string,
    remote: { doc: JsonObject; meta: StorageMeta },
  ) {
    void this.exclusive(async () => {
      if (this.marks.has(collection, id)) return;
      const mine = await this.local.get(collection, id).catch(() => null);
      if (!mine) return;
      if (!sameDocument(mine.doc, remote.doc)) {
        const base = this.marks.base(collection, id);
        if (base === null || mine.meta.sha !== base) {
          this.marks.mark(collection, id);
          this.marks.notify();
          return;
        }
        if (!(await this.replaceLocal(collection, id, remote.doc, mine.meta))) return;
      }
      this.marks.setBase(collection, id, remote.meta.sha);
    }).catch(() => {});
  }

  /**
   * Replace this browser's copy of a document, which `was` the version it was decided on, unless it has
   * been saved or marked since: a save that lands while the gists were being read is not written
   * over with an older version. The last look is made, and the write started, in one go.
   */
  private async replaceLocal(
    collection: Collection,
    id: string,
    doc: JsonObject,
    was: StorageMeta,
  ): Promise<boolean> {
    const now = await this.local.get(collection, id).catch(() => null);
    if (!now || now.meta.sha !== was.sha) return false;
    if (this.marks.has(collection, id)) return false;
    try {
      // Written only over the version decided on, in the store's own transaction: a save that
      // commits after the look above and before this write refuses it, rather than being written over.
      await this.local.put(collection, id, doc, {
        message: `Read ${collection} ${id}`,
        expectedSha: was.sha,
      });
    } catch {
      return false;
    }
    return true;
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
    const waiting = this.marks.has(collection, id);
    const previousBase = this.marks.base(collection, id);
    // The version this save is an edit of is what it is weighed against for as long as it is not
    // sent, not whatever is read of the document meanwhile. Edits already waiting keep theirs. If the
    // save is then refused or fails, the version recorded before it is put back.
    const recorded = !waiting && typeof opts.basedOn === 'string';
    if (recorded) this.marks.setBase(collection, id, opts.basedOn as string);
    // Edits waiting to be sent are the latest work, and a save of them is written over exactly the
    // version the editor read: a tab opened before another saved them is refused, not written over
    // the other's, and what is waiting is kept.
    // A browser that cannot be read is no copy to decide from: the save is not made blind.
    const before = waiting ? null : await this.local.get(collection, id);
    // A layout saved new, of no copy here and of no version (an edit of a layout says which, with
    // `basedOn`), is a layout of its own: not an edit of the version recorded from reading another
    // of its id from the gists, which may have been deleted there since. It is not weighed against it.
    const fresh =
      collection === 'layouts' &&
      !waiting &&
      before === null &&
      typeof opts.basedOn !== 'string' &&
      previousBase !== null;
    if (fresh) this.marks.clearBase(collection, id);
    const restoreBase = () => {
      if (!recorded && !fresh) return;
      if (previousBase === null) this.marks.clearBase(collection, id);
      else this.marks.setBase(collection, id, previousBase);
    };
    // Unsent edits whose mark was lost are the same: a copy that is neither the version recorded nor
    // the one the editor read has been edited here since, and is not written over by an editor that
    // did not see it.
    const unmarkedEdit =
      !waiting &&
      before !== null &&
      typeof opts.basedOn === 'string' &&
      before.meta.sha !== opts.basedOn &&
      before.meta.sha !== previousBase;
    // Any other save is written over the copy it read, in the store's own transaction: a save from
    // another tab that lands between the read and the write is refused, not written over.
    const guard =
      (waiting || unmarkedEdit) && typeof opts.basedOn === 'string'
        ? { expectedSha: opts.basedOn }
        : before !== null
          ? { expectedSha: before.meta.sha }
          : undefined;
    const write = () => this.local.put(collection, id, doc, { ...here, ...guard });
    /** A save refused over edits whose mark was lost: they are unsent, and are marked again. */
    const refused = () => {
      restoreBase();
      if (unmarkedEdit) {
        this.marks.mark(collection, id);
        this.marks.notify();
      }
    };
    if (!remote) {
      let meta: StorageMeta;
      try {
        meta = await this.writeAhead(collection, id, write);
      } catch (e) {
        refused();
        throw e;
      }
      this.marks.notify();
      return meta;
    }
    // Written ahead, before the gists are asked anything: a save made on a bad connection must not
    // wait on it to be kept, and from here on, whatever happens, a mark says it is not sent.
    let saved: StorageMeta;
    try {
      saved = await this.writeAhead(collection, id, write);
    } catch (e) {
      refused();
      throw e;
    }
    // Edits not sent yet are not written to the gists by their next save either: the gists may
    // hold a version this browser has not seen, which the sender weighs, with a check against it.
    if (waiting) {
      this.marks.notify();
      return saved;
    }
    // The gists may have a layout of this name the browser does not know of. They are asked, for a
    // while: unreachable, they refuse nothing yet, and the browser's copy is the work kept. A
    // refusal takes the copy back. Each store judges its own names: a duplicate made before that the
    // gists have twice and the browser once is refused by the browser, and Overwrite then makes
    // one of the two.
    if (collection === 'layouts') {
      const there = await patient(remote.list(collection), READ_PATIENCE_MS).catch(() => null);
      const taken =
        there && there !== SLOW
          ? nameTaken(there, indexSummary(collection, id, doc).name, id, opts.replacing)
          : null;
      if (taken) {
        await this.undo(collection, id, before, saved.sha, restoreBase);
        throw new NameTakenError(taken);
      }
    }
    // The send is waited for for a while: it queues behind whatever else is being sent, and a save
    // that is kept does not wait on that to say so. What it finds after that is the sender's.
    const late = { slow: false };
    const sending = this.exclusive(() =>
      this.sendSave(collection, id, doc, opts, saved, before, restoreBase, late),
    );
    sending.catch(() => {});
    const outcome = await patient(sending, SEND_PATIENCE_MS);
    if (outcome === SLOW) late.slow = true;
    return outcome === SLOW ? saved : outcome;
  }

  /** A save's turn with the gists: write over the version it is an edit of, or leave it marked. */
  private async sendSave(
    collection: Collection,
    id: string,
    doc: JsonObject,
    opts: PutOptions,
    saved: StorageMeta,
    before: { doc: JsonObject } | null,
    restoreBase: () => void,
    late: { slow: boolean },
  ): Promise<StorageMeta> {
    const remote = this.remote as StorageAdapter;
    // What is behind is not known if the gists cannot be read: it stays here, marked, and the
    // sender looks again when they can be.
    let seen: Awaited<ReturnType<StorageAdapter['get']>>;
    try {
      seen = await remote.get(collection, id);
      // Held by the gists once, and deleted from them since, by another browser: an edit of it is
      // not put back unasked. It stays here, marked, and the sender asks whether to keep it.
      if (
        !seen &&
        opts.expectedSha === undefined &&
        this.marks.base(collection, id) !== null &&
        (await this.deletionOf(collection, id))
      ) {
        this.marks.notify();
        return saved;
      }
    } catch {
      this.marks.notify();
      return saved;
    }
    if (seen && sameDocument(seen.doc, doc)) {
      await this.settled(collection, id, seen.meta.sha, doc);
      return saved;
    }
    if (seen && opts.expectedSha === undefined) {
      // The gists hold a version this save is not an edit of: another browser saved it since this
      // one last held it. Writing over it would lose that save, so this one stays here, marked, and
      // is sent as a conflict for the user to settle. With no record of the version it is an edit
      // of, that is so wherever it could be an edit of an older one: where this browser held a copy
      // already, and for a rule set or a text, which two devices can both make under the same name.
      // Only a layout the user chose to overwrite is one they knowingly write over: a new one whose id
      // merely collides with a document the account holds, which a list that was slow or missing a row
      // would let it, is asked about.
      const base = this.marks.base(collection, id);
      if (base === null ? opts.overwriting !== true : seen.meta.sha !== base) {
        this.marks.notify();
        return saved;
      }
    }
    try {
      const { basedOn: _readAt, overwriting: _chosen, ...forwarded } = opts;
      const meta = await remote.put(collection, id, doc, {
        ...forwarded,
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
      if ((e instanceof NameTakenError || e instanceof StorageConflictError) && late.slow) {
        // The caller was told it is kept, so it is not taken back: it stays marked, and is left for
        // the sender, which weighs it against what the gists hold, and says so in the status.
        this.marks.notify();
        return saved;
      }
      if (e instanceof StorageConflictError || e instanceof NameTakenError) {
        // Refused for what the gists hold, and so for the caller to decide about: not left here to
        // be sent unasked, nor as a copy of what was refused.
        await this.undo(collection, id, before, saved.sha, restoreBase);
        throw e;
      }
      // Any other failure is not one to refuse a save for: it is kept, marked, and the status says
      // why it is not sent, as it does when the gists cannot be read. Refusing it would leave the
      // editor, which has not moved on, unable to save again. A caller with a check of its own is told.
      if (opts.expectedSha === undefined) {
        this.marks.notify();
        return saved;
      }
      throw e;
    }
  }

  /** Put back what this browser held before a save that was then refused. */
  private async undo(
    collection: Collection,
    id: string,
    before: { doc: JsonObject } | null,
    writtenSha: string,
    restoreBase: () => void,
  ) {
    // Only a copy that is still exactly what this save wrote is put back: a later save is not undone.
    const now = await this.local.get(collection, id).catch(() => null);
    if (!now || now.meta.sha !== writtenSha) return;
    try {
      if (before) await this.local.put(collection, id, before.doc, { expectedSha: writtenSha });
      else await this.local.delete(collection, id, { expectedSha: writtenSha });
    } catch {
      // Left as it is, and marked: the user is told, and it is weighed when sent. A save that landed
      // between the look and the write refuses the delete as it does the restore.
      return;
    }
    this.marks.clear(collection, id);
    // What it was an edit of is not recorded for a copy that is back as it was.
    restoreBase();
  }

  delete(collection: Collection, id: string, opts: { message?: string } = {}): Promise<void> {
    return this.exclusive(async () => {
      if (this.remote) {
        // The gists first: if they cannot be reached, nothing is deleted, edits not sent included.
        const seen = await this.remote.get(collection, id);
        const base = this.marks.base(collection, id);
        // Another browser saved it since this one last held it: that save is not deleted unseen. With
        // no record of which version this was, a copy that differs from the account's is not either.
        const mine = base === null && seen ? await this.local.get(collection, id) : null;
        if (
          seen &&
          (base === null ? mine && !sameDocument(mine.doc, seen.doc) : seen.meta.sha !== base)
        ) {
          throw new StorageConflictError();
        }
        await this.remote.delete(collection, id, opts);
      }
      await this.local.delete(collection, id, opts);
      // Gone from this browser, there is nothing left of it to send.
      this.marks.forget(collection, id);
      // Whatever lists documents of this browser is told one went, marked or not.
      this.marks.notify();
    });
  }

  /**
   * Delete a document from this browser alone, as the user chooses for one the account lacks: the
   * gists are neither read nor written, so one they hold under the same id stays there, and nothing
   * is deleted from the account unseen. `alongside` are other collections' documents under the same
   * id that go with it, as a layout's proposal does. Returns the documents gone, as
   * `collection/id`, one already gone from here included; null, with nothing deleted, when it has
   * been saved since the user was shown it (a save marks it, to be sent, and changes its version),
   * which is not the document they chose to throw away.
   */
  deleteHere(
    collection: Collection,
    id: string,
    alongside: readonly Collection[] = [],
  ): Promise<string[] | null> {
    return this.exclusive(async () => {
      // Read first, deleted only if still that version: a save from another tab that lands between
      // the two is never deleted, though no mark was there to see when it was looked for.
      const mine = await this.local.get(collection, id);
      if (this.marks.has(collection, id)) return null;
      const gone: string[] = [];
      try {
        if (mine) await this.local.delete(collection, id, { expectedSha: mine.meta.sha });
      } catch (e) {
        if (e instanceof StorageConflictError) return null;
        throw e;
      }
      this.marks.forget(collection, id);
      gone.push(`${collection}/${id}`);
      for (const c of alongside) {
        const other = await this.local.get(c, id).catch(() => null);
        if (!other) continue;
        try {
          await this.local.delete(c, id, { expectedSha: other.meta.sha });
        } catch (e) {
          // Saved again meanwhile: it is not the one that was looked at, and stays.
          if (e instanceof StorageConflictError) continue;
          throw e;
        }
        this.marks.forget(c, id);
        gone.push(`${c}/${id}`);
      }
      return gone;
    });
  }

  /**
   * Which of these documents (`collection/id`) this browser still holds: a look at its own copies
   * alone, the gists not asked.
   */
  async holds(keys: readonly string[]): Promise<Set<string>> {
    const held = new Set<string>();
    for (const collection of COLLECTIONS) {
      const prefix = `${collection}/`;
      const wanted = keys.filter((k) => k.startsWith(prefix));
      if (wanted.length === 0) continue;
      const here = new Set((await this.local.list(collection)).map((e) => `${prefix}${e.id}`));
      for (const key of wanted) if (here.has(key)) held.add(key);
    }
    return held;
  }

  /**
   * Send one document of this browser to the gists, as the user asks for one the account lacks:
   * weighed as `copyUp` weighs each, without touching the others, and whether or not it is marked.
   * 'absent' when this browser no longer holds it. What it did is what `copyUp` reports of it.
   */
  copyOne(collection: Collection, id: string): Promise<CopiedUp | 'absent'> {
    return this.exclusive(async () => {
      const done = nothingDone();
      if (!this.remote) return done;
      const entry = (await this.local.list(collection)).find((e) => e.id === id);
      if (!entry) return 'absent';
      await this.sendOne(collection, entry, true, done, true);
      return done;
    });
  }

  /**
   * Whether a document is kept here and not in the account: signed in, with its save not sent. What it
   * replaced, a renamed layout's old copy, is not deleted from the account until it is.
   */
  unsentToAccount(collection: Collection, id: string): boolean {
    return this.remote !== null && this.marks.has(collection, id);
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
    const found: Audited = { equal: 0, adopted: 0, marked: 0, lacking: 0, missing: [] };
    const remote = this.remote;
    if (!remote) return found;
    for (const collection of COLLECTIONS) {
      if (opts.signal?.aborted) throw new Stopped();
      const [here, there] = await Promise.all([
        this.local.list(collection),
        remote.list(collection),
      ]);
      const theirs = new Set(there.map((e) => e.id));
      /** One the gists lack. A version on record means they held it once: it was deleted from them. */
      const lack = (id: string, name: string) => {
        found.lacking++;
        found.missing.push({
          collection,
          id,
          name,
          sent: this.marks.base(collection, id) !== null,
        });
      };
      for (const { id, name } of here) {
        if (this.marks.has(collection, id)) continue;
        if (!theirs.has(id)) {
          lack(id, name);
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
            lack(id, name);
            return;
          }
          if (sameDocument(mine.doc, seen.doc)) {
            this.marks.setBase(collection, id, seen.meta.sha);
            found.equal++;
            return;
          }
          const base = this.marks.base(collection, id);
          if (base !== null && mine.meta.sha === base) {
            // Saved or marked meanwhile, or refused: left as it is, and not decided.
            if (await this.replaceLocal(collection, id, seen.doc, mine.meta)) {
              this.marks.setBase(collection, id, seen.meta.sha);
              found.adopted++;
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
   * were marked have to be: each that differs is marked, and sent only if the gists hold the version
   * it was an edit of, never by when each was saved, and asked about otherwise. That is for the user
   * to ask for, as a document the gists lack may be one another browser deleted.
   */
  async copyUp(opts: { everything?: boolean; signal?: AbortSignal } = {}): Promise<CopiedUp> {
    const everything = opts.everything === true;
    const remote = this.remote;
    const done = nothingDone();
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
        // What another browser deleted goes from here first, rather than being sent back.
        await this.follow(collection, here, stopped, done.removed);
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

  /**
   * Follow what was deleted from the gists, by another browser, in every collection: see `follow`. It
   * sends nothing. What it cannot read is left for the next time, said nowhere: nothing is lost by it.
   * Told to stop, it stops at the next document, and says what it deleted before.
   */
  async followDeletions(opts: { signal?: AbortSignal } = {}): Promise<Removed[]> {
    const removed: Removed[] = [];
    if (!this.remote) return removed;
    const stopped = () => {
      if (opts.signal?.aborted) throw new Stopped();
    };
    try {
      for (const collection of COLLECTIONS) {
        stopped();
        const here = await this.local.list(collection).catch(() => null);
        if (here) await this.follow(collection, here, stopped, removed);
      }
    } catch (e) {
      if (!(e instanceof Stopped)) throw e;
    }
    return removed;
  }

  /**
   * Delete from here what the gists record as deleted since, which is how a delete made in another
   * browser reaches this one, a renamed layout's old id included: each copy here not edited since
   * the gists last held it, or that is the very version deleted. One edited here since is left, and
   * marked if it was not, to be asked about when it is sent: it is neither dropped nor sent back
   * unasked. One with no version on record is not known to be the one deleted, and stays. Only a
   * deletion the gists record is followed: a document they merely lack (deleted by hand, or by an
   * older version of the app) is not deleted here. Each document deleted is added to `removed` as
   * it goes, so one stopped partway still says what it did.
   */
  private async follow(
    collection: Collection,
    here: readonly IndexEntry[],
    stopped: () => void,
    removed: Removed[],
  ): Promise<void> {
    const remote = this.remote;
    if (!remote?.deleted || here.length === 0) return;
    let deletions: Deletion[];
    try {
      deletions = await remote.deleted(collection);
    } catch {
      // Not known now, so nothing is followed: the next attempt looks again.
      return;
    }
    const byId = new Map(deletions.map((d) => [d.id, d]));
    for (const entry of here) {
      const deletion = byId.get(entry.id);
      if (!deletion) continue;
      try {
        await this.exclusive(async () => {
          stopped();
          if (await this.followOne(collection, entry.id, deletion)) {
            removed.push({ collection, id: entry.id, name: entry.name });
          }
        });
      } catch (e) {
        if (e instanceof Stopped) throw e;
        // This one is looked at again next time; the others are not held up by it.
      }
    }
  }

  /** One copy's turn in following a deletion: whether it was deleted here. */
  private async followOne(
    collection: Collection,
    id: string,
    deletion: Deletion,
  ): Promise<boolean> {
    const remote = this.remote as StorageAdapter;
    // An edit waiting to be sent is the sender's to ask about.
    if (this.marks.has(collection, id)) return false;
    // Saved there again since, by a version of the app that leaves the record: not deleted.
    if (await remote.get(collection, id)) return false;
    const mine = await this.local.get(collection, id);
    if (!mine) return false;
    const base = this.marks.base(collection, id);
    if (mine.meta.sha !== base && mine.meta.sha !== deletion.sha) {
      // Edited here since the gists last held it, its mark lost: an edit, asked about when sent.
      if (base !== null) {
        this.marks.mark(collection, id);
        this.marks.notify();
      }
      return false;
    }
    // Saved or marked meanwhile, by another tab: that is not the copy decided on.
    if (this.marks.has(collection, id)) return false;
    try {
      await this.local.delete(collection, id, { expectedSha: mine.meta.sha });
    } catch (e) {
      if (e instanceof StorageConflictError) return false;
      throw e;
    }
    this.marks.forget(collection, id);
    return true;
  }

  /** The gists' record of a document's deletion, if they keep one and it is deleted. */
  private async deletionOf(collection: Collection, id: string): Promise<Deletion | null> {
    const deletions = await this.remote?.deleted?.(collection);
    return deletions?.find((d) => d.id === id) ?? null;
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
    // Another browser may have saved it since the gists were listed: its version is taken first,
    // then the list is checked again, and the copy is written only over that version, so a save
    // that lands in between is never written over.
    let seen = await remote.get(collection, id);
    let now = (await remote.list(collection)).find((e) => e.id === id);
    if (seen && sameDocument(seen.doc, stored.doc)) {
      // The same, but missing from the account's list: an index rewritten from a stale read by
      // another tab dropped its row, which leaves the document unseen by every browser without a
      // copy. Written again, over the version just read, it is listed.
      if (now === undefined) {
        try {
          await remote.put(collection, id, stored.doc, {
            expectedSha: seen.meta.sha,
            message: `List ${collection} ${entry.name}`,
          });
        } catch (e) {
          if (!(e instanceof StorageConflictError) && !(e instanceof NameTakenError)) throw e;
        }
      }
      await this.settled(collection, id, seen.meta.sha, stored.doc);
      done.current++;
      return;
    }
    if (!seen) {
      // Deleted from the gists since this copy was a version they held, or this copy is the very
      // version deleted: not sent back unasked. Marked, it is asked about.
      const deletion = await this.deletionOf(collection, id);
      if (
        deletion &&
        (this.marks.base(collection, id) !== null || stored.meta.sha === deletion.sha)
      ) {
        this.marks.mark(collection, id);
        this.leaveDeleted(collection, entry, stored.doc, deletion, done);
        return;
      }
    }
    if (seen && !this.marks.has(collection, id)) {
      const base = this.marks.base(collection, id);
      // Never edited here since the version both last held, with the gists' since moved on: an
      // older copy, not an edit. It is brought up, not sent over a version that moved on.
      if (base !== null && stored.meta.sha === base) {
        if (await this.replaceLocal(collection, id, seen.doc, stored.meta)) {
          this.marks.setBase(collection, id, seen.meta.sha);
        }
        done.current++;
        return;
      }
      // Any other that differs is an edit made here with no mark, or an older copy: which is not
      // known, and never decided by when each was saved. Marked, it is weighed like any other:
      // sent only if the gists hold the version it was an edit of, else asked about.
      this.marks.mark(collection, id);
    }
    if (seen && !this.ahead(collection, entry, seen.meta.sha)) {
      this.leave(collection, entry, stored.doc, seen, now, done);
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
      } else {
        this.marks.mark(collection, id);
        this.leave(collection, entry, stored.doc, seen, now, done);
      }
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
   * Whether this browser's copy goes over the gists' version: it does if it is an edit of that
   * version, which the version it was made on says, and over no other; with no record of which
   * that was, it is not known to be an edit of this one.
   */
  private ahead(collection: Collection, entry: IndexEntry, sha: string): boolean {
    const base = this.marks.base(collection, entry.id);
    return base !== null && sha === base;
  }

  /**
   * Leave a document as it is in both places, as a conflict: it was edited here, with the gists'
   * version not the one the edit was made on. It is returned, and stays marked.
   */
  private leave(
    collection: Collection,
    entry: IndexEntry,
    doc: JsonObject,
    seen: { doc: JsonObject; meta: StorageMeta },
    now: IndexEntry | undefined,
    done: CopiedUp,
  ): void {
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

  /** Leave a document edited here that the gists deleted since, as a conflict, as `leave` does. */
  private leaveDeleted(
    collection: Collection,
    entry: IndexEntry,
    doc: JsonObject,
    deletion: Deletion,
    done: CopiedUp,
  ): void {
    done.conflicts.push({
      collection,
      id: entry.id,
      name: entry.name,
      mine: { doc, updatedAt: entry.updatedAt },
      theirs: null,
      deleted: { at: deletion.deletedAt },
    });
  }

  /**
   * Settle a conflict by keeping this browser's version: it is sent over the gists' version the
   * user was shown, or, where they deleted it, only where they still have none. If that has changed
   * again meanwhile nothing is written, and `changed` says so: the conflict is a new one, to be
   * looked at again.
   */
  keepMine(conflict: Conflict): Promise<'kept' | 'changed' | 'edited'> {
    return this.exclusive(async () => {
      const { collection, id } = conflict;
      const stored = await this.local.get(collection, id);
      if (!stored) {
        this.marks.forget(collection, id);
        return 'kept';
      }
      // What is sent is what the user chose: not an edit made here since they were shown the two.
      if (!sameDocument(stored.doc, conflict.mine.doc)) return 'edited';
      if (!this.remote) throw new Error('GitHub is not set up here');
      try {
        const meta = await this.remote.put(collection, id, stored.doc, {
          expectedSha: conflict.theirs?.sha ?? null,
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
   * the version the user was shown any more, nothing is written, and `changed` says so; nor if this
   * browser's copy has been saved again since the user was shown it (`edited`); if the gists' is gone, deleted
   * since, there is nothing to keep, and `gone` says so: this browser's version is not written
   * over, and is sent again.
   */
  keepTheirs(conflict: Conflict): Promise<'kept' | 'changed' | 'edited' | 'gone'> {
    return this.exclusive(async () => {
      const { collection, id } = conflict;
      if (!this.remote) throw new Error('GitHub is not set up here');
      const seen = await this.remote.get(collection, id);
      if (conflict.theirs === null) return this.deleteAsTheirs(conflict, seen !== null);
      if (!seen) return 'gone';
      if (seen.meta.sha !== conflict.theirs.sha) return 'changed';
      // An edit made here since the user was shown the two is not one they chose to throw away.
      const mine = await this.local.get(collection, id);
      if (mine && !sameDocument(mine.doc, conflict.mine.doc)) return 'edited';
      try {
        await this.local.put(collection, id, seen.doc, {
          message: `Keep GitHub's ${collection} ${conflict.name}`,
          // Only over the copy the user was shown, even if one is saved between the look and the write.
          expectedSha: mine?.meta.sha ?? null,
        });
      } catch (e) {
        if (e instanceof StorageConflictError) return 'edited';
        throw e;
      }
      await this.settled(collection, id, seen.meta.sha, seen.doc);
      return 'kept';
    });
  }

  /**
   * Keep the gists' side of a document they deleted: this browser's copy is deleted too, unless they
   * hold it again (`changed`), or it was saved here since the user was shown it (`edited`).
   */
  private async deleteAsTheirs(
    conflict: Conflict,
    savedThereAgain: boolean,
  ): Promise<'kept' | 'changed' | 'edited'> {
    const { collection, id } = conflict;
    if (savedThereAgain) return 'changed';
    const mine = await this.local.get(collection, id);
    if (mine) {
      if (!sameDocument(mine.doc, conflict.mine.doc)) return 'edited';
      try {
        // Only the copy the user was shown, even if one is saved between the look and the delete.
        await this.local.delete(collection, id, { expectedSha: mine.meta.sha });
      } catch (e) {
        if (e instanceof StorageConflictError) return 'edited';
        throw e;
      }
    }
    this.marks.forget(collection, id);
    return 'kept';
  }
}
