import { bundledLayout, getPreset } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { encodeInline, MAX_INLINE_BYTES } from './inline.js';
import { encodeRuleSnapshot, MAX_RULE_SNAPSHOT_BYTES } from './rule-snapshot.js';
import {
  buildPortableTarget,
  parsePortableSearch,
  parsePortableTarget,
  portableSearchTooLong,
} from './share-target.js';

const ORIGIN = 'https://layerbench.example';

describe('portable share targets', () => {
  it('puts inline layout data in the fragment and round-trips canonical Analyze state', async () => {
    const inline = `inline:${await encodeInline(bundledLayout('qwerty')!)}`;
    const href = await buildPortableTarget({
      baseHref: '/analyze',
      origin: ORIGIN,
      route: 'analyze',
      search: {
        layout: inline,
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
      `${ORIGIN}/analyze?case=model&corpus=en-general&corpus2=pt-br-general&heat=effort&mix=65&off=adaptive%2Ccombos&rules=cyanophage&sample=10000&share=1&space=1&text=sym#layout=${encodeURIComponent(inline)}`,
    );
    const parsed = parsePortableTarget(href, ORIGIN);
    expect(parsed).toMatchObject({
      ok: true,
      route: 'analyze',
      search: {
        layout: inline,
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

  it('keeps two large Compare layout snapshots out of the request URL', async () => {
    const inlineA = `inline:${await encodeInline(bundledLayout('qwerty')!)}`;
    const inlineB = `inline:${await encodeInline(bundledLayout('colemak')!)}`;
    const href = await buildPortableTarget({
      baseHref: '/compare',
      origin: ORIGIN,
      route: 'compare',
      search: {
        layout: inlineA,
        b: inlineB,
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

  it('rejects a full share URL that exceeds the browser navigation limit', async () => {
    const rulesSnapshot = encodeRuleSnapshot({
      description: 'x'.repeat(1_650_000),
      globals: {},
      rules: [],
    });
    const target = new URL('/analyze', ORIGIN);
    target.search = new URLSearchParams({
      corpus: 'en-general',
      layout: 'qwerty',
      rules: 'custom:large',
      share: '1',
    }).toString();
    target.hash = new URLSearchParams({ rulesSnapshot }).toString();

    expect(target.href.length).toBeGreaterThan(2_097_152);
    expect(parsePortableTarget(target.href, ORIGIN)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/too long.*browser.*shorten.*smaller/i),
    });
    await expect(
      buildPortableTarget({
        baseHref: '/analyze',
        origin: ORIGIN,
        route: 'analyze',
        search: {
          layout: 'qwerty',
          corpus: 'en-general',
          rules: 'custom:large',
        },
        rulesSnapshot,
      }),
    ).rejects.toThrow(/too long.*browser.*shorten.*smaller/i);
  });

  it('refuses snapshots above the inflated inline-layout limit on either Compare side', async () => {
    const oversized = `inline:${await encodeInline({
      ...bundledLayout('qwerty')!,
      description: 'x'.repeat(MAX_INLINE_BYTES + 1),
    })}`;

    for (const search of [
      { layout: oversized, b: 'colemak', corpus: 'en-general' },
      { layout: 'qwerty', b: oversized, corpus: 'en-general' },
    ]) {
      await expect(
        Promise.resolve().then(() =>
          buildPortableTarget({
            baseHref: '/compare',
            origin: ORIGIN,
            route: 'compare',
            search,
          }),
        ),
      ).rejects.toThrow(/snapshot exceeds the 2 MB limit/i);
    }
  });

  it('rejects another origin, unsupported routes, unknown state and noncanonical values', async () => {
    const href = await buildPortableTarget({
      baseHref: '/analyze',
      origin: ORIGIN,
      route: 'analyze',
      search: { layout: 'qwerty', corpus: 'en-general' },
    });
    const cases = [
      ['https://other.example/analyze?corpus=en-general&layout=qwerty&share=1', /LayerBench site/i],
      [`${ORIGIN}/library?corpus=en-general&layout=qwerty&share=1`, /Analyze and Compare/i],
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

  it('accepts directory URLs for the two deployed share routes', async () => {
    const analyze = await buildPortableTarget({
      baseHref: '/analyze',
      origin: ORIGIN,
      route: 'analyze',
      search: { layout: 'qwerty', corpus: 'en-general' },
    });
    const compare = await buildPortableTarget({
      baseHref: '/compare',
      origin: ORIGIN,
      route: 'compare',
      search: { layout: 'qwerty', b: 'colemak', corpus: 'en-general' },
    });

    expect(parsePortableTarget(analyze.replace('/analyze?', '/analyze/?'), ORIGIN)).toMatchObject({
      ok: true,
      route: 'analyze',
    });
    expect(parsePortableTarget(compare.replace('/compare?', '/compare/?'), ORIGIN)).toMatchObject({
      ok: true,
      route: 'compare',
    });
  });

  it('leaves room for the deployed directory redirect at the URL limit', async () => {
    const rule = { ...getPreset('cyanophage'), id: 'strict', name: 'Shared Strict' };
    const target = {
      baseHref: '/analyze',
      origin: ORIGIN,
      route: 'analyze' as const,
      search: { layout: 'qwerty', corpus: 'en-general', rules: 'custom:strict' },
    };
    const snapshot = (size: number) =>
      encodeRuleSnapshot({ ...rule, description: 'x'.repeat(size) });
    const baseline = await buildPortableTarget({ ...target, rulesSnapshot: snapshot(1) });
    const initial = snapshot(Math.floor(((2_097_150 - baseline.length) * 3) / 4) + 1);
    const length = baseline.length - snapshot(1).length + initial.length;
    const origin = ORIGIN.replace('://', `://${'x'.repeat(2_097_151 - length)}`);
    const search = { ...target.search, share: '1', rulesSnapshot: initial };
    expect(portableSearchTooLong('analyze', search, origin)).toBe(true);
    expect(portableSearchTooLong('analyze', search, origin.replace('://x', '://'))).toBe(false);
    await expect(
      buildPortableTarget({ ...target, origin, rulesSnapshot: initial }),
    ).rejects.toThrow(/too long for browsers to open/i);
  });

  it('budgets the directory request for both copied and in-app links', async () => {
    const search = { layout: 'qwerty', corpus: 'en-general', rules: 'custom:x', share: '1' };
    const request = new URL('/analyze', ORIGIN);
    request.search = new URLSearchParams({
      corpus: search.corpus,
      layout: search.layout,
      rules: search.rules,
      share: search.share,
    }).toString();
    const id = 'x'.repeat(7899 - (request.pathname + request.search).length);
    const rulesSnapshot = encodeRuleSnapshot({ ...getPreset('cyanophage'), id });
    const state = { ...search, rules: `custom:${id}`, rulesSnapshot };
    const target = {
      route: 'analyze' as const,
      baseHref: '/analyze',
      origin: ORIGIN,
      search: { ...search, rules: state.rules },
      rulesSnapshot,
    };
    const href = await buildPortableTarget(target);
    expect(parsePortableTarget(href.replace('/analyze?', '/analyze/?'), ORIGIN)).toMatchObject({
      ok: true,
    });
    const tooLong = { ...state, layout: 'qwertyx' };
    expect(portableSearchTooLong('analyze', tooLong, ORIGIN)).toBe(true);
    await expect(
      buildPortableTarget({ ...target, search: { ...target.search, layout: tooLong.layout } }),
    ).rejects.toThrow(/request is too large/i);
  });

  it('validates the original route and keeps query-only state out of the fragment', async () => {
    const misplaced = `${ORIGIN}/analyze?corpus=en-general&layout=qwerty&share=1#corpus2=pt-general`;
    const effectiveSearch = {
      corpus: 'en-general',
      corpus2: 'pt-general',
      layout: 'qwerty',
      share: '1',
    };

    expect(parsePortableTarget(misplaced, ORIGIN)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/unsupported snapshot/i),
    });
    expect(parsePortableSearch('analyze', effectiveSearch, misplaced)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/unsupported snapshot/i),
    });
    expect(
      parsePortableTarget(
        `${ORIGIN}/elsewhere/analyze?corpus=en-general&layout=qwerty&share=1`,
        ORIGIN,
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Analyze and Compare/i),
    });
    await expect(
      buildPortableTarget({
        baseHref: '/elsewhere/analyze',
        origin: ORIGIN,
        route: 'analyze',
        search: { layout: 'qwerty', corpus: 'en-general' },
      }),
    ).rejects.toThrow(/supported route/i);
  });

  it('requires a custom rule-set snapshot and does not accept one for a preset', async () => {
    await expect(
      buildPortableTarget({
        baseHref: '/analyze',
        origin: ORIGIN,
        route: 'analyze',
        search: { layout: 'qwerty', corpus: 'en-general', rules: 'custom:strict' },
      }),
    ).rejects.toThrow(/custom rule.*snapshot/i);

    await expect(
      buildPortableTarget({
        baseHref: '/analyze',
        origin: ORIGIN,
        route: 'analyze',
        search: { layout: 'qwerty', corpus: 'en-general', rules: 'cyanophage' },
        rulesSnapshot: 'v1.encoded',
      }),
    ).rejects.toThrow(/preset/i);
  });

  it('refuses transient and unknown corpus IDs in either portable target slot', async () => {
    for (const target of [
      {
        route: 'analyze' as const,
        baseHref: '/analyze',
        search: { layout: 'qwerty', corpus: 'custom-0123456789ab' },
      },
      {
        route: 'compare' as const,
        baseHref: '/compare',
        search: {
          layout: 'qwerty',
          b: 'colemak',
          corpus: 'en-general',
          corpus2: 'not-shipped',
        },
      },
    ]) {
      await expect(
        buildPortableTarget({
          ...target,
          origin: ORIGIN,
        }),
      ).rejects.toThrow(/corpus.*(?:shipped|device)|cannot be shared/i);
      expect(parsePortableSearch(target.route, { ...target.search, share: '1' })?.ok).toBe(false);
      const address = new URL(target.baseHref, ORIGIN);
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(target.search)) {
        if (value !== undefined) query.set(key, value);
      }
      query.set('share', '1');
      query.sort();
      address.search = query.toString();
      expect(parsePortableTarget(address.href, ORIGIN).ok).toBe(false);
    }
  });

  it('rejects malformed, invalid, and over-budget custom rule snapshots before building a target', async () => {
    const tooLarge = `v1.${'A'.repeat(Math.ceil(((MAX_RULE_SNAPSHOT_BYTES + 1) * 4) / 3))}`;
    const cases = [
      ['v1.***', /invalid custom rule-set snapshot/i],
      ['v1.e30', /invalid custom rule-set snapshot/i],
      [tooLarge, /too large to share/i],
    ] as const;

    for (const [rulesSnapshot, reason] of cases) {
      const target = new URL('/analyze', ORIGIN);
      target.search = new URLSearchParams({
        corpus: 'en-general',
        layout: 'qwerty',
        rules: 'custom:strict',
        share: '1',
      }).toString();
      target.hash = new URLSearchParams({ rulesSnapshot }).toString();
      expect(parsePortableTarget(target.href, ORIGIN)).toMatchObject({
        ok: false,
        error: expect.stringMatching(reason),
      });

      await expect(
        buildPortableTarget({
          baseHref: '/analyze',
          origin: ORIGIN,
          route: 'analyze',
          search: {
            layout: 'qwerty',
            corpus: 'en-general',
            rules: 'custom:strict',
          },
          rulesSnapshot,
        }),
      ).rejects.toThrow(reason);
    }
  });

  it('does not let portable targets resolve custom layouts from sender storage', () => {
    expect(
      parsePortableTarget(
        `${ORIGIN}/analyze?corpus=en-general&layout=custom%3Amine&share=1`,
        ORIGIN,
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/custom layouts must be included as snapshots/i),
    });

    expect(
      parsePortableTarget(
        `${ORIGIN}/analyze?corpus=en-general&layout=local-layout&share=1`,
        ORIGIN,
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/bundled|community|snapshot/i),
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
