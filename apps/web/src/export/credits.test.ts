import { describe, expect, it } from 'vitest';
import { creditOf, EDITOR_MAX, editorName, imageFileName, loginName, sourceOf } from './credits.js';
import { PLAIN_MAX } from './plain-text.js';

describe('who made the edits', () => {
  it('writes a login as a mention, and nothing for no one signed in', () => {
    expect(loginName('rafaelromao')).toBe('@rafaelromao');
    expect(loginName(null)).toBe('');
  });

  it('keeps one trimmed line, no longer than a line of the card', () => {
    expect(editorName('  Ana \n  María  ')).toBe('Ana María');
    expect(editorName('   ')).toBe('');
    const long = editorName('x'.repeat(EDITOR_MAX + 20));
    expect([...long]).toHaveLength(EDITOR_MAX);
  });

  it('does not cut a character in half', () => {
    const emoji = '😀'.repeat(EDITOR_MAX + 5);
    expect([...editorName(emoji)]).toHaveLength(EDITOR_MAX);
  });
});

describe('where a layout comes from', () => {
  it('drops the scheme, www, the query and the closing slash', () => {
    expect(sourceOf('https://github.com/rafaelromao/keyboards')).toBe(
      'github.com/rafaelromao/keyboards',
    );
    expect(sourceOf('https://www.example.com/')).toBe('example.com');
    expect(sourceOf('http://example.com/a/b/?x=1#top')).toBe('example.com/a/b');
  });

  it('is nothing for no link, or one that is not an address', () => {
    expect(sourceOf(undefined)).toBeNull();
    expect(sourceOf('')).toBeNull();
    expect(sourceOf('not a link')).toBeNull();
    expect(sourceOf('javascript:alert(1)')).toBeNull();
  });
});

describe('the credit of a layout', () => {
  const romak = { name: 'Romak', author: 'Rafael Romão', link: 'https://example.com/romak/' };

  it('names the layout, its author and its source', () => {
    expect(creditOf(romak, { unsaved: false, editor: '@ana' })).toEqual({
      name: 'Romak',
      byline: 'by Rafael Romão',
      source: 'example.com/romak',
      edits: null,
    });
  });

  it('says nothing of edits for a version that is saved, whoever is sharing it', () => {
    expect(creditOf(romak, { unsaved: false, editor: '@ana' }).edits).toBeNull();
  });

  it('says who made the edits of a version nobody has saved', () => {
    expect(creditOf(romak, { unsaved: true, editor: '@ana' }).edits).toBe('Unsaved edits by @ana');
  });

  it('still says the edits are unsaved when no one is named', () => {
    expect(creditOf(romak, { unsaved: true, editor: '' }).edits).toBe('Unsaved edits');
  });

  it('has no byline for a layout with no author, or only blanks', () => {
    expect(creditOf({ name: 'Mine' }, { unsaved: false, editor: '' }).byline).toBeNull();
    expect(creditOf({ name: 'Mine', author: '  ' }, { unsaved: false, editor: '' }).byline).toBe(
      null,
    );
  });
});

describe('text from a layout that is not plain', () => {
  it('is one clean line in the credit', () => {
    const credit = creditOf(
      { name: 'Ro\u0000mak\u202e', author: ' An\na\u2066 ', link: 'https://example.com/a\u0007b' },
      { unsaved: true, editor: '@a\u202eb' },
    );
    expect(credit.name).toBe('Ro mak');
    expect(credit.byline).toBe('by An a');
    expect(credit.edits).toBe('Unsaved edits by @ab');
    expect(credit.source).not.toMatch(/\p{Cc}/u);
  });

  it('is cleaned in the editor’s name too', () => {
    expect(editorName('Ana\u202e\u0000 Bia')).toBe('Ana Bia');
  });
});

describe('a name as long as a link can carry', () => {
  it('is bounded in the credit, whatever field it is in', () => {
    const huge = 'N'.repeat(2_000_000);
    const credit = creditOf(
      { name: huge, author: huge, link: `https://example.com/${huge}` },
      { unsaved: true, editor: huge },
    );
    for (const text of [credit.name, credit.byline, credit.source, credit.edits]) {
      expect((text ?? '').length).toBeLessThanOrEqual(PLAIN_MAX + 20);
    }
  });

  it('reads a link whose path is a long run of slashes in time that does not grow with the run', () => {
    // A regular expression for the slashes at the end of a path tries each slash in turn on a path
    // like this one: 100,000 of them took four seconds, and a link can carry a million.
    for (const slashes of [100_000, 1_000_000]) {
      const started = performance.now();
      const credit = creditOf(
        { name: 'Romak', link: `https://example.com/docs/${'/'.repeat(slashes)}a` },
        { unsaved: false, editor: '' },
      );
      expect(performance.now() - started).toBeLessThan(1500);
      expect(credit.source?.startsWith('example.com/docs')).toBe(true);
    }
  });

  it('still takes the slashes off the end of an ordinary path', () => {
    expect(sourceOf('https://example.com/a/b///')).toBe('example.com/a/b');
    expect(sourceOf('https://example.com////')).toBe('example.com');
  });

  it('makes a file name from the start of it, in no time', () => {
    const started = performance.now();
    const name = imageFileName(['N'.repeat(5_000_000), 'M'.repeat(5_000_000)]);
    expect(performance.now() - started).toBeLessThan(1500);
    expect(name.length).toBeLessThan(120);
  });
});

describe('the image file name', () => {
  it('is the layout name in lowercase words', () => {
    expect(imageFileName(['Magic Romak'])).toBe('layerbench-magic-romak.png');
  });

  it('puts two layouts side by side', () => {
    expect(imageFileName(['Romak', 'QWERTY'])).toBe('layerbench-romak-vs-qwerty.png');
  });

  it('drops accents and what no file name should hold', () => {
    expect(imageFileName(['Édición / ñ?'])).toBe('layerbench-edicion-n.png');
  });

  it('falls back when a name has no letters at all', () => {
    expect(imageFileName(['???'])).toBe('layerbench-layout.png');
    expect(imageFileName([])).toBe('layerbench-layout.png');
  });
});
