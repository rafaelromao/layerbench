import { describe, expect, it } from 'vitest';
import { FIXTURE_EN, FIXTURE_PT } from '../fixtures/index.js';
import { corporaRoot } from '../golden/paths.js';
import { slug } from '../storage/ids.js';
import {
  corpusFromDoc,
  corpusSampleFacts,
  corpusStream,
  corpusToDoc,
  customCorpus,
  mixCorpora,
} from './corpus.js';
import { nodeCorpusLoader } from './node-loader.js';
import { corpusFacts, normalizeText, words } from './normalize.js';

describe('normalize', () => {
  it('folds case, unifies quotes, drops digits and unknown symbols, collapses whitespace', () => {
    const input = 'Olá,  Mundo! It’s 2026 — “quoted” text.\nNext line';
    expect(normalizeText(input, { caseMode: 'fold' })).toBe(
      "olá, mundo! it's - quoted text. next line",
    );
    expect(normalizeText('Olá Mundo', { caseMode: 'model' })).toBe('Olá Mundo');
  });

  it('keeps French « » as French marks, and folds them as quotes elsewhere', () => {
    const text = 'Il a dit « oui ».';
    const symbols = { caseMode: 'model', textClass: 'letters+digits+symbols' } as const;
    expect(normalizeText(text, { ...symbols, keepAlso: ['«', '»'] })).toBe('Il a dit « oui ».');
    expect(normalizeText(text, symbols)).toBe('Il a dit " oui ".');
    expect(normalizeText(text, { caseMode: 'model' })).toBe('Il a dit oui .');
  });

  it('keeps currencies, degrees, sections and ordinals with the symbols, not the letters', () => {
    const text = 'O 1º lugar, a 2ª vez: 20 °C, € 5, £ 3, § 4.';
    expect(normalizeText(text, { caseMode: 'model', textClass: 'letters+digits+symbols' })).toBe(
      'O 1º lugar, a 2ª vez: 20 °C, € 5, £ 3, § 4.',
    );
    // As letters, the ordinals go with the digits they follow, rather than as letters no key has.
    expect(normalizeText(text, { caseMode: 'model' })).toBe('O lugar, a vez C, , , .');
  });

  it('reads a spacing acute as the apostrophe it stands for', () => {
    expect(normalizeText('copo d´água', { caseMode: 'fold' })).toBe("copo d'água");
  });

  it('counts symbols, words and n-grams', () => {
    const f = corpusFacts('ab ab c');
    expect(f.symbols).toBe(5);
    expect(f.words).toBe(3);
    expect(f.unigram.get('a')).toBe(2);
    expect(f.bigram.get('ab')).toBe(2);
    expect(f.wordFreq.get('ab')).toBe(2);
  });

  it('splits words on single spaces', () => {
    expect(words('one two  three')).toEqual(['one', 'two', 'three']);
  });
});

describe('corpora', () => {
  it('builds a custom corpus with a content-derived id', () => {
    const c = customCorpus('one two three four five', { name: 'Test', language: 'en' });
    expect(c.custom).toBe(true);
    expect(c.id.startsWith('custom-')).toBe(true);
    expect(c.words).toBe(5);
    expect(customCorpus('one two three four five').id).toBe(c.id);
    expect(customCorpus('different text entirely here now').id).not.toBe(c.id);
  });

  it('round-trips through a storage document', () => {
    const c = customCorpus(FIXTURE_EN.slice(0, 400), { name: 'Doc', language: 'en' });
    const back = corpusFromDoc('saved', corpusToDoc(c));
    expect(back.sample).toBe(c.sample);
    expect(back.words).toBe(c.words);
    expect(back.name).toBe('Doc');
  });

  it('works out the counts of a document kept without them, as a text in a repository is', () => {
    const c = customCorpus(FIXTURE_EN.slice(0, 400), { name: 'Doc', language: 'en' });
    const { symbols: _symbols, words: _words, ...kept } = corpusToDoc(c);
    const back = corpusFromDoc('saved', kept);
    expect(back.words).toBe(c.words);
    expect(back.symbols).toBe(c.symbols);
  });

  it('interleaves sentences when mixing corpora', () => {
    const en = customCorpus(FIXTURE_EN, { name: 'EN', language: 'en' });
    const pt = customCorpus(FIXTURE_PT, { name: 'PT', language: 'pt-BR' });
    const mixed = mixCorpora(
      [
        [en, 1],
        [pt, 1],
      ],
      20_000,
    );
    expect(mixed.sample.length).toBeGreaterThan(5_000);
    expect(mixed.sample).toContain('ã');
    expect(mixed.language).toBe('en+pt-BR');
    expect(mixed.id.startsWith('mix-')).toBe(true);
  });
});

describe('document ids', () => {
  it('normalizes names into slugs', () => {
    expect(slug('Romak 24')).toBe('romak-24');
    expect(slug('Magic Romak!')).toBe('magic-romak');
    expect(slug('Português ção')).toBe('portugues-cao');
    expect(slug('!!!').startsWith('item-')).toBe(true);
  });
});

describe('shipped corpora', () => {
  const loader = nodeCorpusLoader(corporaRoot());

  it('are listed with their manifests', async () => {
    const list = await loader.list();
    // One corpus per language, of those whose text has been downloaded (packages/corpora/README.md).
    const ids = list.map((m) => m.id);
    expect(ids).toContain('en-general');
    expect(ids).toContain('pt-br-general');
    expect(ids.every((id) => /^(en|pt-br|es|fr|it)-general$/.test(id))).toBe(true);
    const ptGeneral = list.find((m) => m.id === 'pt-br-general')!;
    expect(ptGeneral.language).toBe('pt-BR');
    expect(ptGeneral.license).toContain('CC BY');
    expect(ptGeneral.words).toBeGreaterThan(100_000);
  });

  it('load with a usable stream', async () => {
    const c = await loader.load('pt-br-general');
    const folded = corpusStream(c, 'fold');
    expect(folded.length).toBeGreaterThan(100_000);
    expect(folded).toContain('ã');
    expect(folded).toBe(folded.toLowerCase());
    const facts = corpusSampleFacts(c);
    expect(facts.symbols).toBeGreaterThan(10_000);
    expect((facts.unigram.get('a') ?? 0) > 0).toBe(true);
  });

  it('mixes two shipped corpora proportionally', async () => {
    const en = await loader.load('en-general');
    const pt = await loader.load('pt-br-general');
    const mixed = mixCorpora(
      [
        [en, 1],
        [pt, 1],
      ],
      200_000,
    );
    expect(mixed.sample.length).toBeGreaterThan(150_000);
    expect(mixed.sample).toContain('ã');
    expect(mixed.sample).toContain(' the ');
  });
});
