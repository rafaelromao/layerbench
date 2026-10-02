import { describe, expect, it } from 'vitest';
import { freeId, idForName, slug } from './ids.js';

describe('document ids', () => {
  it('makes an id of a name: lowercase ASCII words joined by dashes', () => {
    expect(slug('Magic Romak')).toBe('magic-romak');
    expect(slug('  Ação & Reação! ')).toBe('acao-reacao');
  });

  it('takes the slug of the name while no other document has it', () => {
    expect(freeId('Qwerty copy', new Set())).toBe('qwerty-copy');
    expect(freeId('Qwerty copy', new Set(['qwerty']))).toBe('qwerty-copy');
  });

  it('numbers the slug rather than taking an id in use', () => {
    expect(freeId('Qwerty', new Set(['qwerty']))).toBe('qwerty-2');
    expect(freeId('Qwerty', new Set(['qwerty', 'qwerty-2', 'qwerty-3']))).toBe('qwerty-4');
  });
});

describe('the id of a renamed document', () => {
  const taken = new Set(['qwerty', 'qwerty-2', 'qwerty-copy', 'my-layout']);

  it('stays while it matches the name, numbered or not, so saving again never moves it', () => {
    expect(idForName('Qwerty copy', 'qwerty-copy', taken)).toBe('qwerty-copy');
    // Saved beside another Qwerty, it keeps its number even once that one is gone.
    expect(idForName('Qwerty', 'qwerty-2', taken)).toBe('qwerty-2');
    expect(idForName('Qwerty', 'qwerty-2', new Set(['qwerty-2']))).toBe('qwerty-2');
  });

  it('follows a new name', () => {
    expect(idForName('Colemak mine', 'qwerty-copy', taken)).toBe('colemak-mine');
    // A slug its own old id shares does not count as taken.
    expect(idForName('Qwerty copy 2', 'qwerty-copy', taken)).toBe('qwerty-copy-2');
  });

  it('numbers around a name another document already has', () => {
    expect(idForName('My layout', 'qwerty-copy', taken)).toBe('my-layout-2');
  });

  it('keeps the id of a name with nothing to slug, rather than making one up each time', () => {
    expect(idForName('Ρωμαϊκό', 'qwerty-copy', taken)).toBe('qwerty-copy');
    expect(idForName('!!!', 'qwerty-copy', taken)).toBe('qwerty-copy');
  });
});
