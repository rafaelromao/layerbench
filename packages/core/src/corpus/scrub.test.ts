import { describe, expect, it } from 'vitest';
import { scrubContacts } from './scrub.js';

describe('scrubbing contact details', () => {
  it('replaces an e-mail address with one of the same shape', () => {
    const out = scrubContacts('Write to jane.doe99@example.co.uk today.');
    expect(out).not.toContain('jane');
    expect(out).not.toContain('example');
    expect(out).toMatch(/^Write to [a-z]{4}\.[a-z]{3}\d\d@[a-z]{7}\.[a-z]{2}\.[a-z]{2} today\.$/);
  });

  it('replaces phone numbers in the forms news text quotes them', () => {
    const inputs = [
      'Ligue (11) 3333-4444 ou 0800 123 4567.',
      'Call +55 11 99999-9999 now.',
      'Tel: 555-1234.',
    ];
    for (const input of inputs) {
      const out = scrubContacts(input);
      expect(out).toHaveLength(input.length);
      expect(out.replace(/\d/g, '#')).toBe(input.replace(/\d/g, '#'));
      expect(out).not.toBe(input);
    }
  });

  it('leaves years, prices and small counts alone', () => {
    const text = 'In 2023 some 30,000 people paid R$ 1.200 each, 12 of them twice.';
    expect(scrubContacts(text)).toBe(text);
  });

  it('keeps case and punctuation, so the sample reads the same to the analysis', () => {
    const out = scrubContacts('Contact John.Smith@News.Org');
    expect(out).toMatch(/^Contact [A-Z][a-z]{3}\.[A-Z][a-z]{4}@[A-Z][a-z]{3}\.[A-Z][a-z]{2}$/);
  });

  it('is the same every time', () => {
    const text = 'a@b.com and 555-123-4567';
    expect(scrubContacts(text)).toBe(scrubContacts(text));
  });
});
