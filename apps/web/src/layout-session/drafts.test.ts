import { describe, expect, it } from 'vitest';
import { webDrafts } from './drafts.js';

function mapStore() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe('the drafts a tab made', () => {
  it('knows a draft of a custom layout, of one never saved, and nothing of anyone else’s link', () => {
    const drafts = webDrafts(mapStore());
    drafts.remember('inline:aaa', 'mine');
    drafts.remember('inline:bbb', null);
    expect(drafts.originOf('inline:aaa')).toBe('mine');
    expect(drafts.originOf('inline:bbb')).toBeNull();
    expect(drafts.originOf('inline:ccc')).toBeUndefined();
  });

  it('knows the bundled or community layout a draft was made from, and nothing of a custom one', () => {
    const store = mapStore();
    webDrafts(store).remember('inline:aaa', null, { kind: 'bundled', id: 'qwerty' });
    webDrafts(store).remember('inline:bbb', 'mine');
    const drafts = webDrafts(store);
    expect(drafts.sourceOf('inline:aaa')).toEqual({ kind: 'bundled', id: 'qwerty' });
    expect(drafts.originOf('inline:aaa')).toBeNull();
    expect(drafts.sourceOf('inline:bbb')).toBeNull();
    expect(drafts.sourceOf('inline:ccc')).toBeNull();
    // Kept as a tab kept them before it knew where a draft came from.
    store.setItem('layerbench:origins', JSON.stringify({ 'inline:old': 'mine' }));
    expect(webDrafts(store).originOf('inline:old')).toBe('mine');
    expect(webDrafts(store).sourceOf('inline:old')).toBeNull();
  });

  it('keeps them for the tab, across a reload', () => {
    const store = mapStore();
    webDrafts(store).remember('inline:aaa', 'mine');
    expect(webDrafts(store).originOf('inline:aaa')).toBe('mine');
  });

  it('forgets one once it is saved', () => {
    const store = mapStore();
    const drafts = webDrafts(store);
    drafts.remember('inline:aaa', 'mine');
    drafts.forget('inline:aaa');
    expect(drafts.originOf('inline:aaa')).toBeUndefined();
    expect(webDrafts(store).originOf('inline:aaa')).toBeUndefined();
  });

  it('forgets the oldest past thirty', () => {
    const store = mapStore();
    const drafts = webDrafts(store);
    for (let i = 0; i < 35; i++) drafts.remember(`inline:${i}`, 'mine');
    expect(drafts.originOf('inline:0')).toBeUndefined();
    expect(drafts.originOf('inline:34')).toBe('mine');
    expect(Object.keys(JSON.parse(store.items.get('layerbench:origins') ?? '{}'))).toHaveLength(30);
  });

  it('keeps them in memory when the store cannot be written, and starts empty from one unreadable', () => {
    const drafts = webDrafts({
      getItem: () => '{not json',
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(drafts.originOf('inline:aaa')).toBeUndefined();
    drafts.remember('inline:aaa', 'mine');
    expect(drafts.originOf('inline:aaa')).toBe('mine');
  });
});
