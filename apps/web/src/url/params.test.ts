import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, parseParams, toQueryString, toSearch } from './params.js';

describe('analysis parameters', () => {
  it('falls back to defaults for an empty query', () => {
    expect(parseParams({})).toEqual(DEFAULT_PARAMS);
  });

  it('accepts the short layout alias', () => {
    expect(parseParams({ l: 'qwerty' }).layoutRef).toBe('qwerty');
    // The long form wins when both are present.
    expect(parseParams({ layout: 'dvorak', l: 'qwerty' }).layoutRef).toBe('dvorak');
  });

  it('clamps numbers and rejects unknown values', () => {
    expect(parseParams({ mix: '200' }).mix).toBe(100);
    expect(parseParams({ mix: '-5' }).mix).toBe(0);
    expect(parseParams({ mix: 'abc' }).mix).toBe(50);
    expect(parseParams({ layer: '99' }).layer).toBe(31);
    expect(parseParams({ sample: '1' }).sample).toBe(10_000);
    expect(parseParams({ sample: '9999999' }).sample).toBe(5_000_000);
    expect(parseParams({ heat: 'nonsense' }).heat).toBe('usage');
    expect(parseParams({ rules: 'nonsense' }).preset).toBe('layouts_doc');
    expect(parseParams({ rules: 'saved:mine' }).preset).toBe('saved:mine');
    expect(parseParams({ rules: 'cyanophage' }).preset).toBe('cyanophage');
  });

  it('reads the toggles', () => {
    expect(parseParams({ case: 'model' }).caseMode).toBe('model');
    expect(parseParams({ case: 'other' }).caseMode).toBe('fold');
    expect(parseParams({ space: '1' }).universe).toBe('with_space');
    expect(parseParams({ space: '0' }).universe).toBe('no_space');
    expect(parseParams({ corpus2: '' }).corpus2).toBeNull();
  });

  it('writes only what differs from the defaults', () => {
    expect(toSearch(DEFAULT_PARAMS)).toEqual({
      layout: 'magic-romak',
      corpus: 'pt-br-general',
    });
    expect(toSearch(DEFAULT_PARAMS, { layer: 2, heat: 'sfb' })).toEqual({
      layout: 'magic-romak',
      corpus: 'pt-br-general',
      layer: '2',
      heat: 'sfb',
    });
  });

  it('drops the mix share when there is no second corpus', () => {
    expect(toSearch(DEFAULT_PARAMS, { mix: 30 }).mix).toBeUndefined();
    expect(toSearch(DEFAULT_PARAMS, { corpus2: 'en-work', mix: 30 })).toMatchObject({
      corpus2: 'en-work',
      mix: '30',
    });
    // At the default share the value is implied, so it stays out of the link.
    expect(toSearch(DEFAULT_PARAMS, { corpus2: 'en-work' }).mix).toBeUndefined();
  });

  it('produces links with keys in a stable order', () => {
    expect(toQueryString(DEFAULT_PARAMS, { layer: 2, caseMode: 'model' })).toBe(
      'case=model&corpus=pt-br-general&layer=2&layout=magic-romak',
    );
  });

  it('round-trips every field', () => {
    const params = {
      ...DEFAULT_PARAMS,
      layoutRef: 'saved:mine',
      corpus: 'en-work',
      corpus2: 'pt-br-work',
      mix: 70,
      preset: 'keysolve',
      caseMode: 'model' as const,
      universe: 'with_space' as const,
      layer: 3,
      heat: 'effort' as const,
      sample: 100_000,
    };
    expect(parseParams(toSearch(params))).toEqual(params);
  });
});
