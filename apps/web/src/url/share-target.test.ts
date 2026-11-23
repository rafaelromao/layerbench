import { describe, expect, it } from 'vitest';
import { buildPortableTarget, parsePortableSearch, parsePortableTarget } from './share-target.js';

const ORIGIN = 'https://layerbench.example';

describe('portable share targets', () => {
  it('puts inline layout data in the fragment and round-trips canonical Analyze state', () => {
    const href = buildPortableTarget({
      baseHref: '/app/analyze',
      origin: ORIGIN,
      route: 'analyze',
      search: {
        layout: 'inline:layout-blob',
        corpus: 'en-general',
        corpus2: 'pt-br-general',
        mix: '65',
        rules: 'cyanophage',
        case: 'model',
        text: 'sym',
        space: '1',
        heat: 'effort',
        sample: '10000',
        off: 'adaptive,combos',
      },
    });

    expect(href).toBe(
      `${ORIGIN}/app/analyze?case=model&corpus=en-general&corpus2=pt-br-general&heat=effort&mix=65&off=adaptive%2Ccombos&rules=cyanophage&sample=10000&share=1&space=1&text=sym#layout=inline%3Alayout-blob`,
    );
    const parsed = parsePortableTarget(href, ORIGIN);
    expect(parsed).toMatchObject({
      ok: true,
      route: 'analyze',
      search: {
        layout: 'inline:layout-blob',
        corpus: 'en-general',
        corpus2: 'pt-br-general',
        mix: '65',
        rules: 'cyanophage',
        case: 'model',
        text: 'sym',
        space: '1',
        heat: 'effort',
        sample: '10000',
        off: 'adaptive,combos',
        share: '1',
      },
    });
  });

  it('keeps two large Compare layout snapshots out of the request URL', () => {
    const href = buildPortableTarget({
      baseHref: '/app/compare',
      origin: ORIGIN,
      route: 'compare',
      search: {
        layout: `inline:${'a'.repeat(20_000)}`,
        b: `inline:${'b'.repeat(20_000)}`,
        corpus: 'en-general',
        sample: '10000',
        layerA: '2',
        layerB: '3',
      },
    });
    const url = new URL(href);
    expect((url.pathname + url.search).length).toBeLessThan(1024);
    expect(url.search).not.toContain('inline');
    expect(url.hash).toContain('layout=inline%3A');
    expect(url.hash).toContain('b=inline%3A');
    expect(parsePortableTarget(href, ORIGIN)).toMatchObject({
      ok: true,
      route: 'compare',
      search: { layerA: '2', layerB: '3' },
    });
  });

  it('rejects another origin, unsupported routes, unknown state and noncanonical values', () => {
    const href = buildPortableTarget({
      baseHref: '/app/analyze',
      origin: ORIGIN,
      route: 'analyze',
      search: { layout: 'qwerty', corpus: 'en-general' },
    });
    const cases = [
      ['https://other.example/analyze?corpus=en-general&layout=qwerty&share=1', /LayerBench site/i],
      [`${ORIGIN}/app/library?corpus=en-general&layout=qwerty&share=1`, /Analyze and Compare/i],
      [href.replace('share=1', 'share=2'), /version/i],
      [`${href}&debug=1`, /unknown/i],
      [`${href}&layer=99`, /canonical/i],
    ] as const;
    for (const [candidate, reason] of cases)
      expect(parsePortableTarget(candidate, ORIGIN)).toMatchObject({
        ok: false,
        error: expect.stringMatching(reason),
      });
  });

  it('requires a custom rule-set snapshot and does not accept one for a preset', () => {
    expect(() =>
      buildPortableTarget({
        baseHref: '/app/analyze',
        origin: ORIGIN,
        route: 'analyze',
        search: { layout: 'qwerty', corpus: 'en-general', rules: 'custom:strict' },
      }),
    ).toThrow(/custom rule.*snapshot/i);

    expect(() =>
      buildPortableTarget({
        baseHref: '/app/analyze',
        origin: ORIGIN,
        route: 'analyze',
        search: { layout: 'qwerty', corpus: 'en-general', rules: 'cyanophage' },
        rulesSnapshot: 'v1.encoded',
      }),
    ).toThrow(/preset/i);
  });

  it('does not let portable targets resolve custom layouts from sender storage', () => {
    expect(
      parsePortableTarget(
        `${ORIGIN}/app/analyze?corpus=en-general&layout=custom%3Amine&share=1`,
        ORIGIN,
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/custom layouts must be included as snapshots/i),
    });
  });

  it('leaves legacy URLs alone but refuses invalid portable search state', () => {
    expect(parsePortableSearch('analyze', { layout: 'qwerty', corpus: 'en-general' })).toBeNull();
    expect(
      parsePortableSearch('analyze', { layout: 'qwerty', corpus: 'en-general', share: '2' }),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/unsupported version/i),
    });
    expect(
      parsePortableSearch('analyze', {
        layout: 'qwerty',
        corpus: 'en-general',
        share: '1',
        debug: '1',
      }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/unknown state/i) });
  });
});
