import { describe, expect, it, vi } from 'vitest';
import { recall, rememberBehind, rememberSummary } from './ranking-memory.js';
import type { LayoutSummary } from './use-summaries.js';

const SUMMARY: LayoutSummary = { effort: 12.5, sfb: 1.2, skipped: 0, missing: [] };

describe('the last ranking, kept in this browser', () => {
  it('gives back each layout’s numbers and which went behind, on the same choices only', () => {
    rememberSummary('en', 'b:qwerty', SUMMARY);
    rememberSummary('en', 's:mine', { ...SUMMARY, effort: null });
    rememberBehind(
      'en',
      new Map([
        ['s:mine', true],
        ['b:qwerty', false],
      ]),
    );

    const en = recall('en');
    expect(en.summaries.get('b:qwerty')).toEqual(SUMMARY);
    expect(en.summaries.get('s:mine')?.effort).toBeNull();
    expect([...en.behind]).toEqual(['s:mine']);

    const pt = recall('pt');
    expect(pt.summaries.size).toBe(0);
    expect(pt.behind.size).toBe(0);
  });

  it('takes a layout out from behind once it is found to type the language', () => {
    rememberBehind('pt', new Map([['s:mine', true]]));
    rememberBehind('pt', new Map([['s:mine', false]]));
    expect(recall('pt').behind.size).toBe(0);
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
        en: { summaries: { 'b:qwerty': SUMMARY, 'b:colemak': { effort: 'high' } }, behind: [3] },
        pt: 'nothing',
      }),
    );
    expect([...recall('en').summaries.keys()]).toEqual(['b:qwerty']);
    expect(recall('en').behind.size).toBe(0);
    expect(recall('pt').summaries.size).toBe(0);
    // And writes over it rather than failing.
    rememberSummary('pt', 'b:qwerty', SUMMARY);
    expect(recall('pt').summaries.size).toBe(1);
  });

  it('drops the scores kept by what was analyzed, from before they were kept by layout', async () => {
    localStorage.setItem('layerbench:summaries', JSON.stringify({ abc123: SUMMARY }));
    vi.resetModules();
    await import('./ranking-memory.js');
    expect(localStorage.getItem('layerbench:summaries')).toBeNull();
  });
});
