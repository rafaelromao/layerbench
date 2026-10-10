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
  it('knows a draft of a saved layout, of one never saved, and nothing of anyone else’s link', () => {
    const drafts = webDrafts(mapStore());
    drafts.remember('inline:aaa', 'mine');
    drafts.remember('inline:bbb', null);
    expect(drafts.originOf('inline:aaa')).toBe('mine');
    expect(drafts.originOf('inline:bbb')).toBeNull();
    expect(drafts.originOf('inline:ccc')).toBeUndefined();
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
