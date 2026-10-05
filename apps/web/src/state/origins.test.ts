import { beforeEach, describe, expect, it } from 'vitest';
import { draftOf, storedIdOf, useOrigins } from './origins.js';

describe('the drafts a tab made', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useOrigins.setState({ byInline: {} });
  });

  it('knows a draft of a stored layout, of one never stored, and nothing of anyone else’s link', () => {
    useOrigins.getState().remember('inline:aaa', 'mine');
    useOrigins.getState().remember('inline:bbb', null);
    expect(draftOf('inline:aaa')).toEqual({ storedId: 'mine' });
    expect(storedIdOf('inline:aaa')).toBe('mine');
    expect(draftOf('inline:bbb')).toEqual({ storedId: null });
    expect(storedIdOf('inline:bbb')).toBeNull();
    expect(draftOf('inline:ccc')).toBeNull();
    expect(draftOf('saved:mine')).toBeNull();
    expect(storedIdOf('saved:mine')).toBe('mine');
  });

  it('keeps them for the tab, across a reload', () => {
    useOrigins.getState().remember('inline:aaa', 'mine');
    expect(JSON.parse(sessionStorage.getItem('layoutmaster:origins') ?? '{}')).toEqual({
      'inline:aaa': 'mine',
    });
  });

  it('forgets the oldest past thirty', () => {
    for (let i = 0; i < 35; i++) useOrigins.getState().remember(`inline:${i}`, 'mine');
    expect(draftOf('inline:0')).toBeNull();
    expect(draftOf('inline:34')).toEqual({ storedId: 'mine' });
    expect(Object.keys(useOrigins.getState().byInline)).toHaveLength(30);
  });
});
