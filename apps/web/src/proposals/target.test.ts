import { bundledLayout, type Layout } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { communityDoc } from '../test/community.js';
import { libraryLayoutNamed } from './target.js';

describe('the layout of the Library a name is the name of', () => {
  const qwerty = bundledLayout('qwerty') as Layout;

  it('is a bundled layout, by its name as a person reads it', () => {
    expect(libraryLayoutNamed('Qwerty', [])).toEqual({ kind: 'bundled', id: 'qwerty' });
    expect(libraryLayoutNamed('  qwerty ', [])).toEqual({ kind: 'bundled', id: 'qwerty' });
    expect(libraryLayoutNamed(qwerty.name.toUpperCase(), [])).toEqual({
      kind: 'bundled',
      id: 'qwerty',
    });
  });

  it('is a community layout when no bundled one has the name', () => {
    const owl = communityDoc('night-owl', 'Night owl');
    expect(libraryLayoutNamed('night   OWL', [owl])).toEqual({
      kind: 'community',
      id: 'night-owl',
    });
  });

  it('is the bundled layout when both have the name', () => {
    const same = communityDoc('qwerty-2', qwerty.name);
    expect(libraryLayoutNamed(qwerty.name, [same])).toEqual({ kind: 'bundled', id: 'qwerty' });
  });

  it('is none for a name no layout of the Library has, or a copy’s own', () => {
    expect(libraryLayoutNamed('Qwerty copy', [communityDoc('night-owl', 'Night owl')])).toBeNull();
    expect(libraryLayoutNamed('', [])).toBeNull();
  });
});
