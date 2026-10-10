import {
  type CompiledLayout,
  compileLayout,
  freeId,
  idForName,
  type Layout,
  type StorageAdapter,
  toCanonicalJson,
} from '@layerbench/core';
import { encodeInline } from '../url/inline.js';
import { inlineRef, parseLayoutRef, savedRef } from '../url/params.js';
import type { Drafts } from './drafts.js';
import { openLayout } from './open.js';

/**
 * The link, as the layout session reaches it: the router in the app, an array in tests. The session
 * is the only writer of the layout in it (ADR 0002).
 */
export interface LinkPort {
  /** The layout reference the link holds now. */
  current(): string;
  /**
   * Put `ref` in the link in place of the one there. `edit` leaves the rest of the page as it is;
   * `open` is a layout picked, which starts on its first layer.
   */
  write(ref: string, how: 'edit' | 'open'): void;
  /** Hear every reference the link takes, whoever wrote it. */
  subscribe(listener: (ref: string) => void): () => void;
}

export type SessionState =
  | { status: 'opening'; opening: number }
  | { status: 'failed'; opening: number; error: string }
  | {
      status: 'open';
      /** Which opening this is: a new one each time a layout is opened, even the same one again. */
      opening: number;
      /** The layout as opened. */
      layout: Layout;
      compiled: CompiledLayout;
      /** A draft this tab made, opened from its own link: its edits are still unsaved. */
      startsUnsaved: boolean;
      /** The saved layout this is, or will be saved as; null for one never saved. */
      storedId: string | null;
      /** What a layout picker shows: the saved layout while nothing is unsaved, else the link. */
      pickedRef: string;
      saving: boolean;
    };

export type SaveResult =
  | { ok: true; id: string; leftBehind: boolean }
  | { ok: false; reason: 'conflict' | 'failed'; error: string };

export interface LayoutSession {
  getState(): SessionState;
  subscribe(listener: () => void): () => void;
  /**
   * The layout in the editor now, and whether it is unsaved. Call it after every change to either,
   * the first render included. With nothing unsaved the link holds the layout's clean reference at
   * once; unsaved, a draft follows a moment after the last edit.
   */
  edited(layout: Layout, unsaved: boolean): void;
  /**
   * Store the layout, under the id its name gives, in place of the one this is, if any. Saves run one
   * after another. Once it resolves, the editor marks the layout saved, and reports it so.
   */
  save(layout: Layout): Promise<SaveResult>;
  /** Open another layout, or the same one afresh: a layout picked. */
  open(ref: string): Promise<void>;
  /** The link as it is about to be: a draft still waiting to be written is written now. */
  link(): Promise<string>;
  /** Write nothing more, and stop listening to the link. */
  dispose(): void;
}

export interface SessionPorts {
  /** Read at each use: storage changes when someone signs in, and the layout stays open. */
  storage: () => StorageAdapter;
  drafts: Drafts;
  link: LinkPort;
}

const LINK_DELAY_MS = 400;

/** The link of a saved layout: the layout itself, its id inside, so it opens for anyone sent it. */
async function snapshotRef(layout: Layout, id: string): Promise<string> {
  return inlineRef(await encodeInline({ ...layout, id }));
}

/**
 * Store a layout. Its id follows its name: one already stored keeps its id while that still matches
 * its name, and moves to its new name's once renamed; anything else takes a free id from its name.
 * Neither overwrites a saved layout whose name happens to slug the same. A renamed layout's old copy
 * goes only once the new one is safely stored.
 */
async function store(
  storage: StorageAdapter,
  layout: Layout,
  storedId: string | null,
): Promise<{ id: string; leftBehind: boolean }> {
  const taken = new Set((await storage.list('layouts')).map((e) => e.id));
  const id =
    storedId !== null ? idForName(layout.name, storedId, taken) : freeId(layout.name, taken);
  await storage.put('layouts', id, toCanonicalJson({ ...layout, id }), {
    message: `Save layout ${layout.name}`,
  });
  let leftBehind = false;
  if (storedId !== null && id !== storedId) {
    try {
      await storage.delete('layouts', storedId, { message: `Rename layout to ${layout.name}` });
    } catch {
      leftBehind = true;
    }
  }
  return { id, leftBehind };
}

/**
 * The layout session: the layout open in Analyze, from the moment it is opened until another is.
 * It opens the layout the link names, knows which saved layout it is, keeps the link holding the
 * layout as it is — its clean reference, or a draft of its unsaved edits — and saves it. A link it
 * wrote never opens it again; any other does, Back and a followed link included.
 */
export function createLayoutSession(
  ports: SessionPorts,
  opts: { linkDelayMs?: number } = {},
): LayoutSession {
  const { drafts, link } = ports;
  const delay = opts.linkDelayMs ?? LINK_DELAY_MS;
  const listeners = new Set<() => void>();
  let disposed = false;

  let state: SessionState = { status: 'opening', opening: 0 };
  /** The reference this opening opened, and every one it has written since. */
  let own = new Set<string>();
  /** What the link holds when nothing is unsaved. */
  let cleanRef = '';
  let storedId: string | null = null;
  let opened: { layout: Layout; startsUnsaved: boolean } | null = null;
  let editor: { layout: Layout; unsaved: boolean } | null = null;
  /** A draft waiting to be written, and the promise of its reference once it is. */
  let pending: { timer: ReturnType<typeof setTimeout> | null; ref: Promise<string> } | null = null;
  let saves: Promise<unknown> = Promise.resolve();
  let saving = false;

  const pickedRef = (): string =>
    !(editor?.unsaved ?? opened?.startsUnsaved) && storedId !== null
      ? savedRef(storedId)
      : link.current();

  const publish = () => {
    if (state.status === 'open') {
      const next = { ...state, storedId, pickedRef: pickedRef(), saving };
      if (
        next.storedId !== state.storedId ||
        next.pickedRef !== state.pickedRef ||
        next.saving !== state.saving
      ) {
        state = next;
      }
    }
    for (const listener of listeners) listener();
  };

  const write = (ref: string, how: 'edit' | 'open' = 'edit') => {
    if (disposed) return;
    own.add(ref);
    if (link.current() === ref && how === 'edit') return;
    link.write(ref, how);
    publish();
  };

  const cancelPending = () => {
    if (pending?.timer) clearTimeout(pending.timer);
    pending = null;
  };

  /** Write the layout in the editor as a draft of the saved layout it is an edit of. */
  const writeDraft = async (layout: Layout, opening: number): Promise<string> => {
    const ref = inlineRef(await encodeInline(layout));
    if (state.opening === opening && !disposed) {
      drafts.remember(ref, storedId);
      write(ref);
    }
    return ref;
  };

  const start = async (ref: string) => {
    cancelPending();
    const opening = state.opening + 1;
    state = { status: 'opening', opening };
    own = new Set([ref]);
    editor = null;
    opened = null;
    publish();

    const origin = drafts.originOf(ref);
    const result = await openLayout(ref, ports.storage());
    if (state.opening !== opening || disposed) return;
    if (!result.ok) {
      state = { status: 'failed', opening, error: result.error };
      publish();
      return;
    }
    let compiled: CompiledLayout;
    try {
      compiled = compileLayout(result.layout);
    } catch (e) {
      state = { status: 'failed', opening, error: e instanceof Error ? e.message : String(e) };
      publish();
      return;
    }
    const startsUnsaved = origin !== undefined;
    storedId = startsUnsaved ? origin : result.storedId;
    // A saved layout opened by its id gets the link that carries it whole, which opens anywhere: an
    // id opens only where the layout is saved.
    cleanRef =
      !startsUnsaved && storedId !== null && parseLayoutRef(ref).kind !== 'inline'
        ? await snapshotRef(result.layout, storedId)
        : ref;
    if (state.opening !== opening || disposed) return;
    opened = { layout: result.layout, startsUnsaved };
    saving = false;
    state = {
      status: 'open',
      opening,
      layout: result.layout,
      compiled,
      startsUnsaved,
      storedId,
      pickedRef: '',
      saving,
    };
    if (!startsUnsaved) write(cleanRef);
    state = { ...state, pickedRef: pickedRef() };
    publish();
  };

  const unsubscribe = link.subscribe((ref) => {
    if (disposed || own.has(ref)) return;
    void start(ref);
  });
  void start(link.current());

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    edited(layout, unsaved) {
      if (state.status !== 'open' || disposed) return;
      if (editor && editor.layout === layout && editor.unsaved === unsaved) return;
      editor = { layout, unsaved };
      cancelPending();
      if (!unsaved) {
        write(cleanRef);
      } else if (!(opened?.startsUnsaved && layout === opened.layout)) {
        // A draft opened from its own link is in the link already.
        const opening = state.opening;
        let resolve: (ref: string) => void = () => {};
        const ref = new Promise<string>((r) => {
          resolve = r;
        });
        const timer = setTimeout(() => {
          if (pending?.ref === ref) pending.timer = null;
          void writeDraft(layout, opening).then(resolve);
        }, delay);
        pending = { timer, ref };
      }
      publish();
    },

    save(layout) {
      const run = async (): Promise<SaveResult> => {
        if (state.status !== 'open') return { ok: false, reason: 'failed', error: 'nothing open' };
        const opening = state.opening;
        saving = true;
        publish();
        try {
          const { id, leftBehind } = await store(ports.storage(), layout, storedId);
          // Its link from now on carries it whole, so it can still be sent. A moment ago that may
          // have been the link of a draft of it, which it no longer is.
          const ref = await snapshotRef(layout, id);
          if (state.opening === opening) {
            drafts.forget(ref);
            cleanRef = ref;
            storedId = id;
            // Saved with nothing unsaved, it is in the link at once; otherwise once the editor says
            // the layout saved is the one it has.
            if (editor && !editor.unsaved) write(cleanRef);
          }
          return { ok: true, id, leftBehind };
        } catch (e) {
          const conflict = e instanceof Error && e.name === 'StorageConflictError';
          return {
            ok: false,
            reason: conflict ? 'conflict' : 'failed',
            error: e instanceof Error ? e.message : String(e),
          };
        } finally {
          saving = false;
          publish();
        }
      };
      const result = saves.then(run, run);
      saves = result;
      return result;
    },

    async open(ref) {
      own = new Set([ref]);
      write(ref, 'open');
      await start(ref);
    },

    async link() {
      if (pending?.timer && editor) {
        clearTimeout(pending.timer);
        pending = { timer: null, ref: writeDraft(editor.layout, state.opening) };
      }
      return pending ? pending.ref : link.current();
    },

    dispose() {
      disposed = true;
      cancelPending();
      unsubscribe();
    },
  };
}
