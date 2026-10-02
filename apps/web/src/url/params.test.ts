import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAMS,
  ENGLISH_CORPUS,
  parseLayoutRef,
  parseParams,
  toQueryString,
  toSearch,
} from './params.js';

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
    // A saved id is a word; a link cannot name a path.
    expect(parseParams({ rules: 'saved:../../x' }).preset).toBe('layouts_doc');
  });

  it('reads a saved layout reference only when its id is one storage could have made', () => {
    expect(parseLayoutRef('saved:mine')).toEqual({ kind: 'saved', value: 'mine' });
    expect(parseLayoutRef('saved:../../../../user#')).toEqual({
      kind: 'bundled',
      value: 'saved:../../../../user#',
    });
    expect(parseLayoutRef('saved:index')).toEqual({ kind: 'bundled', value: 'saved:index' });
    expect(parseLayoutRef('inline:abc')).toEqual({ kind: 'inline', value: 'abc' });
    expect(parseLayoutRef('qwerty')).toEqual({ kind: 'bundled', value: 'qwerty' });
  });

  it('opens the corpus that replaced the one an older link names', () => {
    expect(parseParams({ corpus: 'en-work' }).corpus).toBe('en-conv');
    expect(parseParams({ corpus: 'pt-br-work', corpus2: 'en-work' })).toMatchObject({
      corpus: 'pt-br-conv',
      corpus2: 'en-conv',
    });
    expect(parseParams({ corpus: 'en-general' }).corpus).toBe('en-general');
  });

  it('takes a view’s own default corpus, but never over the one a link names', () => {
    expect(parseParams({}, ENGLISH_CORPUS).corpus).toBe('en-general');
    expect(parseParams({ corpus: 'pt-br-conv' }, ENGLISH_CORPUS).corpus).toBe('pt-br-conv');
    expect(parseParams({ corpus: 'pt-br-work' }, ENGLISH_CORPUS).corpus).toBe('pt-br-conv');
    // The link contract itself is unchanged.
    expect(parseParams({}).corpus).toBe(DEFAULT_PARAMS.corpus);
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
    expect(toSearch(DEFAULT_PARAMS, { corpus2: 'en-conv', mix: 30 })).toMatchObject({
      corpus2: 'en-conv',
      mix: '30',
    });
    // At the default share the value is implied, so it stays out of the link.
    expect(toSearch(DEFAULT_PARAMS, { corpus2: 'en-conv' }).mix).toBeUndefined();
  });

  it('produces links with keys in a stable order', () => {
    expect(toQueryString(DEFAULT_PARAMS, { layer: 2, caseMode: 'model' })).toBe(
      'case=model&corpus=pt-br-general&layer=2&layout=magic-romak',
    );
  });

  it('reads the features a layout is typed without, known ones only, in one order', () => {
    expect(parseParams({ off: 'macros,bogus,magic,macros' }).without).toEqual(['magic', 'macros']);
    expect(parseParams({ off: '' }).without).toEqual([]);
    expect(toSearch(DEFAULT_PARAMS, { without: ['magic', 'combos'] }).off).toBe('magic,combos');
    expect(toSearch(DEFAULT_PARAMS).off).toBeUndefined();
  });

  it('round-trips every field', () => {
    const params = {
      ...DEFAULT_PARAMS,
      layoutRef: 'saved:mine',
      corpus: 'en-conv',
      corpus2: 'pt-br-conv',
      mix: 70,
      preset: 'keysolve',
      caseMode: 'model' as const,
      universe: 'with_space' as const,
      layer: 3,
      heat: 'effort' as const,
      sample: 100_000,
      without: ['repeat' as const, 'combos' as const],
    };
    expect(parseParams(toSearch(params))).toEqual(params);
  });
});
