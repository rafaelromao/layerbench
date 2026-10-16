import { describe, expect, it } from 'vitest';
import {
  composeDeadKey,
  deadKeyCompositions,
  hasShift,
  parseKeycode,
  shiftSymbol,
  translateKeycode,
} from './locale.js';

describe('parsing a keycode', () => {
  it('reads nested modifier wrappers outermost first', () => {
    expect(parseKeycode('LS(LC(x))')).toEqual({ usage: 'X', mods: ['LSHIFT', 'LCTRL'] });
    expect(parseKeycode(' RA(COMMA) ')).toEqual({ usage: 'COMMA', mods: ['RALT'] });
    expect(parseKeycode('a')).toEqual({ usage: 'A', mods: [] });
  });

  it('finds shift on either side', () => {
    expect(hasShift(['LCTRL', 'RSHIFT'])).toBe(true);
    expect(hasShift(['LALT'])).toBe(false);
  });
});

describe('translating a keycode on a host layout', () => {
  it('types letters, digits and punctuation on a US host, shifted or not', () => {
    expect(translateKeycode('us', 'A')).toEqual({ symbol: 'a' });
    expect(translateKeycode('us', 'LS(A)')).toEqual({ symbol: 'A' });
    expect(translateKeycode('us', 'N1', ['LSHIFT'])).toEqual({ symbol: '!' });
    expect(translateKeycode('us', 'SEMI')).toEqual({ symbol: ';' });
    expect(translateKeycode('us', 'NOPE')).toBeNull();
  });

  it('treats the symbol names as the shifted key they are', () => {
    expect(translateKeycode('us', 'EXCL')).toEqual({ symbol: '!' });
    expect(translateKeycode('us', 'COLON')).toEqual({ symbol: ':' });
    expect(translateKeycode('us', 'LT')).toEqual({ symbol: '<' });
    expect(translateKeycode('us', 'APOS')).toEqual({ symbol: "'" });
  });

  it('sets a dead key on US international and plain text on US', () => {
    expect(translateKeycode('us-intl', 'SQT')).toEqual({ symbol: '', deadKey: '´' });
    expect(translateKeycode('us-intl', 'LS(SQT)')).toEqual({ symbol: '', deadKey: '¨' });
    expect(translateKeycode('us-intl', 'N6')).toEqual({ symbol: '6' });
    expect(translateKeycode('us-intl', 'CARET')).toEqual({ symbol: '', deadKey: '^' });
    expect(translateKeycode('us-intl', 'RA(COMMA)')).toEqual({ symbol: 'ç' });
    expect(translateKeycode('us-intl', 'RA(LS(COMMA))')).toEqual({ symbol: 'Ç' });
    expect(translateKeycode('us', 'SQT')).toEqual({ symbol: "'" });
  });

  it('follows the ABNT2 layout', () => {
    expect(translateKeycode('abnt2', 'SEMI')).toEqual({ symbol: 'ç' });
    expect(translateKeycode('abnt2', 'LS(SEMI)')).toEqual({ symbol: 'Ç' });
    expect(translateKeycode('abnt2', 'LBKT')).toEqual({ symbol: '', deadKey: '´' });
    expect(translateKeycode('abnt2', 'LS(LBKT)')).toEqual({ symbol: '', deadKey: '`' });
    expect(translateKeycode('abnt2', 'N6')).toEqual({ symbol: '6' });
    expect(translateKeycode('abnt2', 'LS(N6)')).toEqual({ symbol: '', deadKey: '¨' });
    expect(translateKeycode('abnt2', 'RA(Q)')).toEqual({ symbol: '/' });
    expect(translateKeycode('abnt2', 'RA(LS(Q))')).toEqual({ symbol: '?' });
    expect(translateKeycode('abnt2', 'RA(W)')).toEqual({ symbol: '?' });
    expect(translateKeycode('abnt2', 'A')).toEqual({ symbol: 'a' });
  });
});

describe('dead keys', () => {
  it('composes with the next letter', () => {
    expect(composeDeadKey('´', 'a')).toBe('á');
    expect(composeDeadKey('compose', 's')).toBe('ß');
  });

  it('leaves the marker, then the letter, when the two make nothing', () => {
    expect(composeDeadKey('´', 'z')).toBe("'z");
    expect(composeDeadKey('`', 'z')).toBe('`z');
    expect(composeDeadKey('compose', 'z')).toBe('z');
    expect(composeDeadKey('?', 'z')).toBe('?z');
  });

  it('types the marker alone before a space', () => {
    expect(composeDeadKey('´', ' ')).toBe("'");
    expect(composeDeadKey('compose', ' ')).toBe('');
    expect(composeDeadKey('?', ' ')).toBe('?');
  });

  it('lists what a dead key composes with', () => {
    expect(deadKeyCompositions('~')).toContainEqual(['n', 'ñ']);
    expect(deadKeyCompositions('nothing')).toEqual([]);
  });

  it('shifts a symbol, or takes the shifted form it is given', () => {
    expect(shiftSymbol('a')).toBe('A');
    expect(shiftSymbol('1', '!')).toBe('!');
  });
});
