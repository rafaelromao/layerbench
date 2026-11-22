import { describe, expect, it } from 'vitest';
import { PLAIN_MAX, plain } from './plain-text.js';

describe('plain', () => {
  it('leaves ordinary text, accents and emoji as they are', () => {
    expect(plain('Magic Romak — Rafael Romão ✦ \u{1f680}')).toBe(
      'Magic Romak — Rafael Romão ✦ \u{1f680}',
    );
  });

  it('makes one line: white space of every kind becomes one space', () => {
    expect(plain('  a \n\t b\u00a0\u2028 c  ')).toBe('a b c');
  });

  it('turns control characters into spaces', () => {
    expect(plain('a\u0000b\u001fc\u007fd\u0085e')).toBe('a b c d e');
  });

  it('takes out the marks that change which way a line reads', () => {
    expect(plain('a\u202eb\u202ac\u2066d\u2069e\u200ef\u200fg\u061ch')).toBe('abcdefgh');
  });

  it('turns a lone surrogate and the non-characters into U+FFFD, which an address can carry', () => {
    const cleaned = plain('x\ud800y\udc00z\ufffe\uffff');
    expect(cleaned).toBe('x\ufffdy\ufffdz\ufffd\ufffd');
    expect(() => encodeURIComponent(cleaned)).not.toThrow();
  });

  it('keeps joiners, which emoji and some scripts need', () => {
    const family = '\u{1f468}\u200d\u{1f469}\u200d\u{1f467}';
    expect(plain(family)).toBe(family);
  });

  it('keeps no more than a line of any card could hold, however long the text is', () => {
    expect(plain('x'.repeat(5_000_000))).toHaveLength(PLAIN_MAX);
  });

  it('cuts first and cleans after, so a cut through a pair leaves no lone surrogate', () => {
    const cut = plain(`${'a'.repeat(PLAIN_MAX - 1)}\u{1f680}`);
    expect(() => encodeURIComponent(cut)).not.toThrow();
  });
});
