import { type AnalysisSettings, DEFAULT_SETTINGS } from '@layerbench/core';
import { describe, expect, it, vi } from 'vitest';
import { rankingKey, recall, rememberSummary } from './ranking-memory.js';
import type { LayoutSummary } from './use-summaries.js';

const SUMMARY: LayoutSummary = { effort: 12.5, sfb: 1.2, skipped: 0, missing: [] };

describe('the last ranking, kept in this browser', () => {
  it('gives back each layout’s numbers, on the same choices only', () => {
    rememberSummary('en', 'b:qwerty', SUMMARY);
    rememberSummary('en', 'c:mine', { ...SUMMARY, effort: null });

    const en = recall('en');
    expect(en.summaries.get('b:qwerty')).toEqual(SUMMARY);
    expect(en.summaries.get('c:mine')?.effort).toBeNull();

    expect(recall('pt').summaries.size).toBe(0);
  });

  it('drops what is kept under the `s:` key of a custom layout', () => {
    localStorage.setItem(
      'layerbench:ranking',
      JSON.stringify({
        old: {
          summaries: { 's:mine': SUMMARY, 'b:qwerty': SUMMARY },
          behind: ['s:mine', 'b:dvorak'],
        },
      }),
    );
    const old = recall('old');
    expect([...old.summaries.keys()]).toEqual(['b:qwerty']);
  });

  it('keeps only the scores of a stored ranking, whatever else it holds', () => {
    localStorage.setItem(
      'layerbench:ranking',
      JSON.stringify({ en: { summaries: { 'b:qwerty': SUMMARY }, behind: ['b:qwerty'] } }),
    );
    rememberSummary('en', 'b:colemak', SUMMARY);
    expect(JSON.parse(localStorage.getItem('layerbench:ranking') ?? '{}').en).toEqual({
      summaries: { 'b:qwerty': SUMMARY, 'b:colemak': SUMMARY },
    });
  });

  it('keeps only the rankings written last', () => {
    for (let i = 0; i < 11; i++) rememberSummary(`choice ${i}`, 'b:qwerty', SUMMARY);
    expect(recall('choice 0').summaries.size).toBe(0);
    expect(recall('choice 1').summaries.size).toBe(1);
    expect(recall('choice 10').summaries.size).toBe(1);

    // Writing to one again makes it the newest, so it outlasts the others.
    rememberSummary('choice 1', 'b:colemak', SUMMARY);
    rememberSummary('choice 11', 'b:qwerty', SUMMARY);
    expect(recall('choice 1').summaries.size).toBe(2);
    expect(recall('choice 2').summaries.size).toBe(0);
  });

  it('ignores what it cannot read', () => {
    localStorage.setItem('layerbench:ranking', 'not json');
    expect(recall('en').summaries.size).toBe(0);

    localStorage.setItem(
      'layerbench:ranking',
      JSON.stringify({
        en: { summaries: { 'b:qwerty': SUMMARY, 'b:colemak': { effort: 'high' } } },
        pt: 'nothing',
      }),
    );
    expect([...recall('en').summaries.keys()]).toEqual(['b:qwerty']);
    expect(recall('pt').summaries.size).toBe(0);
    // And writes over it rather than failing.
    rememberSummary('pt', 'b:qwerty', SUMMARY);
    expect(recall('pt').summaries.size).toBe(1);
  });

  it('drops the store of scores kept by what was analyzed', async () => {
    localStorage.setItem('layerbench:summaries', JSON.stringify({ abc123: SUMMARY }));
    vi.resetModules();
    await import('./ranking-memory.js');
    expect(localStorage.getItem('layerbench:summaries')).toBeNull();
  });
});

describe('what a ranking is kept by', () => {
  const ranking: AnalysisSettings<string> = {
    ...DEFAULT_SETTINGS,
    corpus: 'en-general',
    rules: 'layouts_doc',
  };

  it('is the same for the same settings, however they were put together', () => {
    expect(rankingKey({ ...ranking })).toBe(rankingKey(ranking));
  });

  it.each<[string, Partial<AnalysisSettings<string>>]>([
    ['text', { corpus: 'pt-br-general' }],
    ['mix', { corpus2: 'pt-br-general' }],
    ['share of a mix', { corpus2: 'pt-br-general', share: 70 }],
    ['case', { caseMode: 'model' }],
    ['what counts', { textClass: 'letters+digits' }],
    ['sample', { sample: 10_000 }],
    ['features left out', { without: ['macros'] }],
    ['rules', { rules: 'cyanophage' }],
    ['space', { universe: 'with_space' }],
  ])('tells another %s apart', (_, change) => {
    expect(rankingKey({ ...ranking, ...change })).not.toBe(rankingKey(ranking));
  });
});
