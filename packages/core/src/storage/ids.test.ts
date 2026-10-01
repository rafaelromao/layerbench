import { describe, expect, it } from 'vitest';
import { freeId, slug } from './ids.js';

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
