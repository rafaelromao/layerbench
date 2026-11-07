import { describe, expect, it } from 'vitest';
import { hasProse, nameFilter } from './names.js';

const DICTIONARY =
  'the model use ask code is you see current president france was reads files'.split(' ');

describe('names a text never writes in lower case', () => {
  const lines = [
    'The model reads the Model section first.',
    'Use the Claude agent. Claude reads files.',
    'Ask Claude to explain Claude Code.',
    'Claude can run Claude tools, and Claude Code too.',
    'Is Claude here? Claude is here.',
    'Install Claude Code today.',
    'Update Claude Code today.',
    'Run Claude Code today.',
    'Claude Code is here.',
    'Claude Code is there.',
    'You write the code, and the code runs.',
    'Claude is on `Macron` and https://example.test/Macron only.',
    'The current President of France is Emmanuel Macron.',
    'Emmanuel Macron was elected twice.',
  ];

  it('are found by how rarely they come, and not by their shape', () => {
    // `Claude` is in five lines; `Model` and `President` are words the text also writes in lower case.
    const hasName = nameFilter([...lines, 'the president and the model'], DICTIONARY, 5);
    expect(hasName('The current President of France is Emmanuel Macron.')).toBe(true);
    expect(hasName('Emmanuel Macron was elected twice.')).toBe(true);
    expect(hasName('Claude Code is here.')).toBe(false);
    expect(hasName('The Model section is read first.')).toBe(false);
  });

  it('can be made of ordinary words, so a pair that comes in few lines is one', () => {
    const pool = ['Ask Bill Gates about it.', ...Array(5).fill('Use Active Record here.')];
    const hasName = nameFilter(
      pool,
      [...DICTIONARY, 'bill', 'gates', 'active', 'record', 'about', 'here'],
      5,
    );
    expect(hasName('Ask Bill Gates about it.')).toBe(true);
    expect(hasName('Use Active Record here.')).toBe(false);
  });

  it('count a link or code span as no name', () => {
    const hasName = nameFilter(lines, DICTIONARY, 5);
    expect(hasName('See `Macron` and https://example.test/Macron')).toBe(false);
  });

  it('take the words of a dictionary as words, and camel case as none', () => {
    const pool = ['France is big', 'FooBar and fooBar, SomeName', 'Then Zaphod spoke'];
    const hasName = nameFilter(pool, ['france', 'president', 'big'], 5);
    expect(hasName('France is big')).toBe(false);
    expect(hasName('FooBar and fooBar, SomeName')).toBe(false);
    expect(hasName('Then Zaphod spoke')).toBe(true);
  });

  it('can be made of ordinary words, so a pair that comes in few lines is one', () => {
    const pool = ['Ask Bill Gates about it.', ...Array(5).fill('Use Active Record here.')];
    const hasName = nameFilter(
      pool,
      [...DICTIONARY, 'bill', 'gates', 'active', 'record', 'about', 'here'],
      5,
    );
    expect(hasName('Ask Bill Gates about it.')).toBe(true);
    expect(hasName('Use Active Record here.')).toBe(false);
  });

  it('count a link or code span as no name', () => {
    const hasName = nameFilter(lines, DICTIONARY, 5);
    expect(hasName('See `Macron` and https://example.test/Macron')).toBe(false);
  });
});

describe('prose inside code', () => {
  it('is told from code by four plain words in a row', () => {
    expect(hasProse('moons ago. They have been tweaked slightly by both someone')).toBe(true);
    expect(hasProse('usage: tool [options] <file>')).toBe(false);
    expect(hasProse('return new Foo(a, b);')).toBe(false);
    expect(hasProse('"Install Flask with the pip"')).toBe(true);
  });
});
