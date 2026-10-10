import {
  bundledLayout,
  type Layout,
  StorageConflictError,
  toCanonicalJson,
} from '@layerbench/core';
import { describe, expect, it, vi } from 'vitest';
import { MemoryLink } from '../test/memory-link.js';
import { MemoryStorage } from '../test/memory-storage.js';
import { decodeInline } from '../url/inline.js';
import { type Drafts, webDrafts } from './drafts.js';
import { createLayoutSession, type LayoutSession, type SessionState } from './session.js';

function mapStore() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

/** A saved copy of a bundled layout, under its own id and name. */
async function seed(storage: MemoryStorage, from: string, id: string, extra: Partial<Layout> = {}) {
  const layout = bundledLayout(from) as Layout;
  await storage.put('layouts', id, toCanonicalJson({ ...layout, id, ...extra }));
}

/** A session on the link `ref`, in a tab with `drafts`, on `storage`. */
function session(
  ref: string,
  {
    storage = new MemoryStorage(),
    drafts = webDrafts(mapStore()),
  }: {
    storage?: MemoryStorage;
    drafts?: Drafts;
  } = {},
) {
  const link = new MemoryLink(ref);
  const s = createLayoutSession({ storage: () => storage, drafts, link }, { linkDelayMs: 5 });
  return { s, link, storage, drafts };
}

/** The state once the layout asked for has opened, or failed to. */
function settled(s: LayoutSession): Promise<SessionState> {
  return new Promise((resolve) => {
    const check = () => {
      const state = s.getState();
      if (state.status === 'opening') return;
      unsubscribe();
      resolve(state);
    };
    const unsubscribe = s.subscribe(check);
    check();
  });
}

async function opened(s: LayoutSession) {
  const state = await settled(s);
  if (state.status !== 'open') throw new Error(state.status === 'failed' ? state.error : 'opening');
  return state;
}

/** The layout a link carries whole, read back. */
async function carried(ref: string): Promise<Layout | null> {
  if (!ref.startsWith('inline:')) return null;
  const decoded = await decodeInline(ref.slice('inline:'.length));
  return decoded.ok ? decoded.layout : null;
}

/** The layout with `ç` on its left home-row middle finger. */
function withCedilla(layout: Layout): Layout {
  return {
    ...layout,
    layers: layout.layers.map((l, i) =>
      i === 0 ? { ...l, bindings: { ...l.bindings, LHM: { kind: 'kp', symbol: 'ç' } } } : l,
    ),
  };
}

const ids = async (storage: MemoryStorage) =>
  (await storage.list('layouts')).map((e) => e.id).sort();

describe('Opening a layout', () => {
  it('opens a bundled layout as a layout of its own, and writes nothing', async () => {
    const { s, link } = session('qwerty');
    const state = await opened(s);
    expect(state.layout.name).toBe('Qwerty');
    expect(state.storedId).toBeNull();
    expect(state.startsUnsaved).toBe(false);
    expect(link.writes).toEqual([]);
  });

  it('opens a saved layout, by `saved:` or by its id alone, and puts it in the link whole', async () => {
    for (const ref of ['saved:mine', 'mine']) {
      const storage = new MemoryStorage();
      await seed(storage, 'qwerty', 'mine', { name: 'Mine' });
      const { s, link } = session(ref, { storage });
      const state = await opened(s);
      expect(state.storedId).toBe('mine');
      expect(state.pickedRef).toBe('saved:mine');
      // The link carries it whole, its id inside, so it opens for anyone it is sent to.
      expect(link.writes).toHaveLength(1);
      expect((await carried(link.current()))?.id).toBe('mine');
    }
  });

  it('says why a layout will not open', async () => {
    const { s } = session('saved:gone');
    expect(await settled(s)).toMatchObject({ status: 'failed', error: 'layout gone not found' });
  });

  it('opens again on a link it did not write, and on a layout picked, even the same one', async () => {
    const { s, link } = session('qwerty');
    const first = await opened(s);

    link.visit('colemak');
    const followed = await opened(s);
    expect(followed.layout.name).toBe('Colemak');
    expect(followed.opening).toBeGreaterThan(first.opening);

    await s.open('colemak');
    const picked = await opened(s);
    expect(picked.opening).toBeGreaterThan(followed.opening);
    expect(link.writes.at(-1)).toEqual({ ref: 'colemak', how: 'open' });
  });
});

describe('The link', () => {
  it('holds unsaved edits a moment after the last one, as a draft, and the saved layout once they are undone', async () => {
    const storage = new MemoryStorage();
    await seed(storage, 'qwerty', 'mine', { name: 'Mine' });
    const { s, link, drafts } = session('saved:mine', { storage });
    const state = await opened(s);
    const clean = link.current();

    s.edited(state.layout, false);
    s.edited(withCedilla(state.layout), true);
    expect(link.current()).toBe(clean);
    await vi.waitFor(() => expect(link.current()).not.toBe(clean));
    expect(JSON.stringify(await carried(link.current()))).toContain('ç');
    expect(drafts.originOf(link.current())).toBe('mine');
    expect(s.getState()).toMatchObject({ pickedRef: link.current() });

    s.edited(state.layout, false);
    expect(link.current()).toBe(clean);
    // The links it wrote are its own: the layout was never opened again.
    expect(s.getState()).toMatchObject({ opening: state.opening, pickedRef: 'saved:mine' });
  });

  it('gives the link as it is about to be, a draft not yet written included', async () => {
    const { s, link } = session('qwerty');
    const state = await opened(s);
    s.edited(withCedilla(state.layout), true);
    const ref = await s.link();
    expect(JSON.stringify(await carried(ref))).toContain('ç');
    expect(link.current()).toBe(ref);
  });
});

describe('Drafts', () => {
  it('reopens unsaved edits from their link still unsaved, and saves them as the layout they edit', async () => {
    const storage = new MemoryStorage();
    await seed(storage, 'qwerty', 'qwerty-copy', { name: 'Qwerty copy' });
    const drafts = webDrafts(mapStore());
    const first = session('saved:qwerty-copy', { storage, drafts });
    const state = await opened(first.s);
    first.s.edited(withCedilla(state.layout), true);
    const draft = await first.s.link();
    first.s.dispose();

    // The same link, opened again in this tab: a reload, Back.
    const again = session(draft, { storage, drafts });
    const reopened = await opened(again.s);
    expect(reopened.startsUnsaved).toBe(true);
    expect(reopened.storedId).toBe('qwerty-copy');
    again.s.edited(reopened.layout, true);
    expect(again.link.writes).toEqual([]);

    expect(await again.s.save(reopened.layout)).toEqual({
      ok: true,
      id: 'qwerty-copy',
      leftBehind: false,
    });
    again.s.edited(reopened.layout, false);
    expect(JSON.stringify(await carried(again.link.current()))).toContain('ç');
    expect(drafts.originOf(again.link.current())).toBeUndefined();
    expect(await ids(storage)).toEqual(['qwerty-copy']);
    expect(JSON.stringify((await storage.get('layouts', 'qwerty-copy'))?.doc)).toContain('ç');
  });

  it('opens a draft another tab made as a layout of its own', async () => {
    const storage = new MemoryStorage();
    await seed(storage, 'qwerty', 'qwerty-copy', { name: 'Qwerty copy' });
    const first = session('saved:qwerty-copy', { storage });
    first.s.edited(withCedilla((await opened(first.s)).layout), true);
    const draft = await first.s.link();

    const elsewhere = await opened(session(draft, { storage }).s);
    expect(elsewhere.startsUnsaved).toBe(false);
    expect(elsewhere.storedId).toBeNull();
  });
});

describe('A saved layout sent by its link', () => {
  async function ownersLink(): Promise<string> {
    const storage = new MemoryStorage();
    await seed(storage, 'qwerty', 'mine', { name: 'Mine', author: 'Me' });
    const owner = session('saved:mine', { storage });
    await opened(owner.s);
    return owner.link.current();
  }

  it('opens for someone who has not got it as a layout of their own, saved beside nothing', async () => {
    const theirs = new MemoryStorage();
    const { s } = session(await ownersLink(), { storage: theirs });
    const state = await opened(s);
    expect(state.storedId).toBeNull();
    expect(await s.save(state.layout)).toMatchObject({ ok: true, id: 'mine' });
    expect((await theirs.get('layouts', 'mine'))?.doc).toMatchObject({
      name: 'Mine',
      author: 'Me',
    });
  });

  it('opens as the saved layout where it is saved with the same contents, and saves in place', async () => {
    const link = await ownersLink();
    const mine = new MemoryStorage();
    await seed(mine, 'qwerty', 'mine', { name: 'Mine', author: 'Me' });
    const { s } = session(link, { storage: mine });
    const state = await opened(s);
    expect(state).toMatchObject({ storedId: 'mine', pickedRef: 'saved:mine' });
    const edited = withCedilla(state.layout);
    s.edited(edited, true);
    expect(await s.save(edited)).toMatchObject({ ok: true, id: 'mine' });
    expect(await ids(mine)).toEqual(['mine']);
    expect(JSON.stringify((await mine.get('layouts', 'mine'))?.doc)).toContain('ç');
  });

  it('never saves over a different layout saved under the same id', async () => {
    const link = await ownersLink();
    const theirs = new MemoryStorage();
    await seed(theirs, 'colemak', 'mine', { name: 'Mine' });
    const { s } = session(link, { storage: theirs });
    const state = await opened(s);
    expect(state.storedId).toBeNull();
    expect(await s.save(state.layout)).toMatchObject({ ok: true, id: 'mine-2' });
    expect(JSON.stringify((await theirs.get('layouts', 'mine'))?.doc)).toBe(
      JSON.stringify(
        toCanonicalJson({ ...(bundledLayout('colemak') as Layout), id: 'mine', name: 'Mine' }),
      ),
    );
  });
});

describe('Saving', () => {
  it('stores a layout under the id its name gives, beside a saved one of the same name, and puts it in the link', async () => {
    const storage = new MemoryStorage();
    await seed(storage, 'qwerty', 'qwerty', { description: 'mine' });
    const { s, link } = session('qwerty', { storage });
    const state = await opened(s);
    s.edited(state.layout, false);
    expect(await s.save(state.layout)).toEqual({ ok: true, id: 'qwerty-2', leftBehind: false });
    expect((await storage.get('layouts', 'qwerty'))?.doc.description).toBe('mine');
    expect((await carried(link.current()))?.id).toBe('qwerty-2');
    expect(s.getState()).toMatchObject({ storedId: 'qwerty-2', pickedRef: 'saved:qwerty-2' });
  });

  it('keeps the id its first save gave while the name keeps it, and saves there again', async () => {
    const storage = new MemoryStorage();
    const { s } = session('qwerty', { storage });
    const state = await opened(s);
    const renamed = { ...withCedilla(state.layout), name: 'Qwerty plus' };
    s.edited(renamed, true);
    expect(await s.save(renamed)).toMatchObject({ ok: true, id: 'qwerty-plus' });
    const again = { ...renamed, description: 'more' };
    s.edited(again, true);
    expect(await s.save(again)).toMatchObject({ ok: true, id: 'qwerty-plus' });
    expect(await ids(storage)).toEqual(['qwerty-plus']);
    expect((await storage.get('layouts', 'qwerty-plus'))?.doc.description).toBe('more');
  });

  it("moves a renamed layout to its new name's id, or beside one already there", async () => {
    const storage = new MemoryStorage();
    await seed(storage, 'qwerty', 'qwerty-copy', { name: 'Qwerty copy' });
    const { s } = session('saved:qwerty-copy', { storage });
    const state = await opened(s);
    expect(await s.save({ ...state.layout, name: 'My layout' })).toEqual({
      ok: true,
      id: 'my-layout',
      leftBehind: false,
    });
    expect(await ids(storage)).toEqual(['my-layout']);

    await seed(storage, 'colemak', 'theirs', { name: 'Theirs' });
    expect(await s.save({ ...state.layout, name: 'Theirs' })).toMatchObject({ id: 'theirs-2' });
    expect(await ids(storage)).toEqual(['theirs', 'theirs-2']);
  });

  it('says when the old copy of a renamed layout could not be removed', async () => {
    const storage = new MemoryStorage();
    await seed(storage, 'qwerty', 'qwerty-copy', { name: 'Qwerty copy' });
    storage.delete = async () => {
      throw new Error('offline');
    };
    const { s } = session('saved:qwerty-copy', { storage });
    const state = await opened(s);
    expect(await s.save({ ...state.layout, name: 'My layout' })).toMatchObject({
      ok: true,
      id: 'my-layout',
      leftBehind: true,
    });
  });

  it('tells a conflict from another failure, and changes nothing on either', async () => {
    const storage = new MemoryStorage();
    await seed(storage, 'qwerty', 'mine', { name: 'Mine' });
    const { s } = session('saved:mine', { storage });
    const state = await opened(s);
    const put = storage.put.bind(storage);
    storage.put = async () => {
      throw new StorageConflictError();
    };
    expect(await s.save(state.layout)).toMatchObject({ ok: false, reason: 'conflict' });
    storage.put = async () => {
      throw new Error('offline');
    };
    expect(await s.save(state.layout)).toMatchObject({
      ok: false,
      reason: 'failed',
      error: 'offline',
    });
    expect(s.getState()).toMatchObject({ storedId: 'mine', saving: false });
    storage.put = put;
  });

  it('saves one after another, so saving twice at once makes one layout', async () => {
    const storage = new MemoryStorage();
    const { s } = session('qwerty', { storage });
    const state = await opened(s);
    const [a, b] = await Promise.all([s.save(state.layout), s.save(state.layout)]);
    expect(a).toMatchObject({ ok: true, id: 'qwerty' });
    expect(b).toMatchObject({ ok: true, id: 'qwerty' });
    expect(await ids(storage)).toEqual(['qwerty']);
  });
});
