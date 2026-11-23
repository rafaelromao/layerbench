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
      ['custom-0123456789ab', null],
      ['en-general', 'mix-en-general:60+pt-general:40'],
      ['en-general', 'not-shipped'],
    ] as const) {
      expect(portableCorpusError(first, second, shipped)).toMatch(/cannot be shared/i);
    }
  });

  it('refuses transient custom corpus IDs even when their language is a shipped language', () => {
    const listedDuringThisSession: CorpusManifest[] = [
      ...shipped,
      {
        id: 'custom-0123456789ab',
        name: 'Pasted English',
        language: 'en',
        license: 'user-provided',
        symbols: 0,
        words: 100,
      },
      {
        id: 'mix-custom-0123456789ab:60+en-general:40',
        name: 'Private mix',
        language: 'en',
        license: 'see components',
        symbols: 0,
        words: 100,
      },
    ];

    expect(portableCorpusError('custom-0123456789ab', null, listedDuringThisSession)).toMatch(
      /custom corpus text stays on this device/i,
    );
    expect(
      portableCorpusError(
        'en-general',
        'mix-custom-0123456789ab:60+en-general:40',
        listedDuringThisSession,
      ),
    ).toMatch(/custom corpus text stays on this device/i);
  });
});
