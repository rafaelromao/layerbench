import type { CorpusManifest } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { portableCorpusError } from './corpus-share.js';

const shipped: CorpusManifest[] = [
  { id: 'en-general', name: 'English', language: 'en', license: 'CC0', symbols: 0, words: 100 },
  { id: 'pt-general', name: 'Portuguese', language: 'pt', license: 'CC0', symbols: 0, words: 100 },
  {
    id: 'custom:notes',
    name: 'Notes',
    language: 'custom',
    license: 'private',
    symbols: 0,
    words: 10,
  },
];

describe('portable corpus selection', () => {
  it('allows shipped corpora and shipped mixes only', () => {
    expect(portableCorpusError('en-general', 'pt-general', shipped)).toBeNull();
    expect(portableCorpusError('en-general', null, shipped)).toBeNull();
  });

  it('refuses custom or unknown corpora in either slot without including their text', () => {
    for (const [first, second] of [
      ['custom:notes', null],
      ['en-general', 'custom:notes'],
      ['transient:notes', null],
      ['en-general', 'not-shipped'],
    ] as const) {
      expect(portableCorpusError(first, second, shipped)).toMatch(/cannot be shared/i);
    }
  });
});
