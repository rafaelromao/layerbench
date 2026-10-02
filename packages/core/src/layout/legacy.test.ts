import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { goldenPath } from '../golden/paths.js';
import { buildGoldenReport, type GoldenCase, type GoldenReport } from '../golden/report.js';
import { magicRomak } from '../layouts/romak.js';
import { Machine } from '../sim/machine.js';
import { enumerateProducers } from '../sim/producers.js';
import { compileLayout } from './compile.js';
import { toCanonicalJson } from './json.js';
import { type LegacyLayout, upgradeLegacyFeatures } from './legacy.js';
import { parseLayout, safeParseLayout } from './schema.js';
import type { Binding, Layout } from './types.js';

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });
const bytes = (l: Layout) => JSON.stringify(toCanonicalJson(l));

/** Magic Romak as it was stored while its magic keys and alt repeat were features. */
const FEATURE_ERA: unknown = JSON.parse(
  readFileSync(goldenPath('legacy/magic-romak-features.json'), 'utf8'),
);

/** A small board, so where each feature lands is easy to read. */
function mini(extra: Partial<LegacyLayout> = {}): LegacyLayout {
  return {
    format: 'layoutmaster/layout@1',
    name: 'Mini',
    hostLocale: 'symbols',
    geometry: { preset: '3x5+2' },
    keys: { space: 'L0' },
    layers: [
      {
        id: 'base',
        bindings: {
          LHI: kp('u'),
          RHI: { kind: 'macro', symbols: 'u', tag: 't' },
          LHM: kp('h'),
          LHR: { kind: 'hold_tap', tap: kp('a'), hold: { kind: 'mod', mod: 'LGUI' } },
          LBI: { kind: 'lt', layer: 'base', tap: kp('b') },
          LBM: {
            kind: 'mod_morph',
            mods: ['LSHIFT'],
            default: kp('c'),
            morphed: kp('C'),
          },
          L1: { kind: 'key_repeat' },
          L0: kp(' '),
        },
      },
    ],
    ...extra,
  };
}

/** What a run of key taps types, pressed one after another on the base layer. */
function typed(layout: Layout, keys: string[]): string {
  const c = compileLayout(layout);
  const m = new Machine(c);
  return keys
    .flatMap((k) => m.perform({ type: 'tap', pos: c.keyIndex.get(k) as number }))
    .map((e) => e.symbols)
    .join('');
}

describe('documents from when magic keys were features', () => {
  it('open as Magic Romak is now, to the byte', () => {
    const parsed = safeParseLayout(FEATURE_ERA);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(bytes(parsed.layout)).toBe(bytes(magicRomak));
    expect(parsed.layout.features).toEqual({
      sentenceCase: { enabled: true },
      capsWord: { enabled: true, continueList: ['_', 'Backspace'] },
    });
    expect(parsed.layout.behaviors).toBeUndefined();
  });

  it('open from the share link of that time too', () => {
    const blob = readFileSync(goldenPath('inline-magic-romak-features.txt'), 'utf8').trim();
    const json = JSON.parse(inflateSync(Buffer.from(blob, 'base64url')).toString('utf8'));
    expect(bytes(parseLayout(json))).toBe(bytes(magicRomak));
  });

  // The reports pin every number Magic Romak types to. The feature-era document, converted, must
  // land on each of them: only the alt repeat's producer ids are allowed to differ.
  it.each<GoldenCase>([
    {
      layout: 'magic-romak',
      corpus: 'fixture_enpt',
      preset: 'layouts_doc',
      caseMode: 'fold',
      universe: 'with_space',
    },
    {
      layout: 'magic-romak',
      corpus: 'fixture_en',
      preset: 'layouts_doc',
      caseMode: 'model',
      universe: 'no_space',
    },
  ])('types $corpus in $caseMode mode exactly as the checked-in report says', (c) => {
    const file = `${c.layout}__${c.corpus}__${c.preset}__${c.caseMode}__${c.universe}.json`;
    const want: GoldenReport = JSON.parse(readFileSync(goldenPath(file), 'utf8'));
    const got = buildGoldenReport(c, parseLayout(FEATURE_ERA));
    for (const k of [
      'stats',
      'totals',
      'registry',
      'unigram_no_space',
      'unigram_with_space',
      'travel',
      'runs',
      'words_count',
      'score',
    ] as const) {
      expect(got[k], k).toEqual(want[k]);
    }
    expect(got.results.map((r) => [r.id, r.value])).toEqual(
      want.results.map((r) => [r.id, r.value]),
    );
    for (const [word, e] of Object.entries(want.explain)) {
      expect(got.explain[word].steps, word).toEqual(e.steps);
      expect(got.explain[word].presses, word).toBe(e.presses);
    }
  });
});

describe('upgradeLegacyFeatures', () => {
  const magic = {
    id: 'magic',
    default: kp('h'),
    triggers: [{ afterAny: ['u'], binding: kp('v') }],
  };

  it('returns a document with nothing to convert as it is', () => {
    const doc = mini({ features: { sentenceCase: {} } });
    expect(upgradeLegacyFeatures(doc)).toBe(doc);
  });

  it('writes a magic key on the arm a tap reaches, keeping a hold or a morph', () => {
    const doc = mini({
      features: {
        adaptiveKeys: [
          {
            ...magic,
            at: [
              { layer: 'base', key: 'LHM' },
              { layer: 'base', key: 'LHR' },
              { layer: 'base', key: 'LBI' },
              { layer: 'base', key: 'LBM' },
            ],
          },
        ],
      },
    });
    const out = upgradeLegacyFeatures(doc).layers[0].bindings;
    const key: Binding = { kind: 'adaptive', default: kp('h'), triggers: magic.triggers };
    expect(out.LHM).toEqual(key);
    expect(out.LHR).toEqual({ kind: 'hold_tap', tap: key, hold: { kind: 'mod', mod: 'LGUI' } });
    expect(out.LBI).toEqual({ kind: 'lt', layer: 'base', tap: key });
    expect(out.LBM).toEqual({
      kind: 'mod_morph',
      mods: ['LSHIFT'],
      default: key,
      morphed: kp('C'),
    });
    expect(upgradeLegacyFeatures(doc).features).toBeUndefined();
  });

  it('leaves the key of a magic key that was switched off, and keeps it by name', () => {
    const out = upgradeLegacyFeatures(
      mini({
        features: {
          adaptiveKeys: [{ ...magic, enabled: false, at: [{ layer: 'base', key: 'LHM' }] }],
        },
      }),
    );
    expect(out.layers[0].bindings.LHM).toEqual(kp('h'));
    expect(out.behaviors?.magic).toEqual({
      kind: 'adaptive',
      default: kp('h'),
      triggers: magic.triggers,
    });
  });

  it('keeps a definition a combo still runs by name, and it types the same', () => {
    const doc = mini({
      features: { adaptiveKeys: [{ ...magic, at: [{ layer: 'base', key: 'LHM' }] }] },
      combos: [{ id: 'm', keys: ['LHI', 'LHM'], binding: { kind: 'ref', ref: 'magic' } }],
    });
    const c = compileLayout(upgradeLegacyFeatures(doc));
    expect(c.combos[0].binding).toEqual(c.layers[0].bindings[c.keyIndex.get('LHM') as number]);
  });

  it("keeps the document's own behaviour of the same name, and the key keeps the feature's", () => {
    const own = kp('z');
    const out = upgradeLegacyFeatures(
      mini({
        behaviors: { magic: own },
        features: { adaptiveKeys: [{ ...magic, at: [{ layer: 'base', key: 'LHM' }] }] },
      }),
    );
    expect(out.behaviors?.magic).toBe(own);
    expect(out.layers[0].bindings.LHM.kind).toBe('adaptive');
  });

  it('drops a placement on a layer that does not exist, so the document compiles', () => {
    const out = upgradeLegacyFeatures(
      mini({
        features: { adaptiveKeys: [{ ...magic, at: [{ layer: 'nope', key: 'LHM' }] }] },
      }),
    );
    expect(() => compileLayout(out)).not.toThrow();
    expect(out.behaviors?.magic).toBeDefined();
  });

  describe('an alt repeat with a second stage', () => {
    const doc = mini({
      features: {
        altRepeat: {
          at: [{ layer: 'base', key: 'L1' }],
          triggers: [{ afterAny: ['u'], binding: kp('x') }],
          secondStage: { afterTags: ['t'], triggers: [{ afterAny: ['u'], binding: kp('y') }] },
        },
      },
      typingPaths: {
        x: [{ producer: 'adaptive:base/L1#default#t0' }, { producer: 'direct:base/LHI' }],
        y: [{ producer: 'adaptive:base/L1#t0' }],
        u: [{ producer: 'repeat:base/L1#default#default' }],
      },
    });
    /** The same key written out by hand as it used to compile: the second stage around the first. */
    const nested = mini({
      layers: [
        {
          ...mini().layers[0],
          bindings: {
            ...mini().layers[0].bindings,
            L1: {
              kind: 'adaptive',
              default: {
                kind: 'adaptive',
                default: { kind: 'key_repeat' },
                triggers: [{ afterAny: ['u'], binding: kp('x') }],
              },
              triggers: [{ afterAny: ['u'], afterTags: ['t'], binding: kp('y') }],
            },
          },
        },
      ],
    });
    const out = upgradeLegacyFeatures(doc);

    it('becomes one list, the tagged branches first', () => {
      expect(out.layers[0].bindings.L1).toEqual({
        kind: 'adaptive',
        default: { kind: 'key_repeat' },
        triggers: [
          { afterAny: ['u'], afterTags: ['t'], binding: kp('y') },
          { afterAny: ['u'], binding: kp('x') },
        ],
      });
    });

    it('types what the two stages typed, after a tagged u and after a plain one', () => {
      for (const keys of [
        ['RHI', 'L1'],
        ['LHI', 'L1'],
        ['LHM', 'L1'],
      ]) {
        expect(typed(out as Layout, keys), keys.join(' ')).toBe(typed(nested as Layout, keys));
      }
      expect(typed(out, ['RHI', 'L1'])).toBe('uy');
      expect(typed(out, ['LHI', 'L1'])).toBe('ux');
      expect(typed(out, ['LHM', 'L1'])).toBe('hh');
    });

    it('renames the typing paths of the folded key, and only those', () => {
      expect(out.typingPaths).toEqual({
        x: [{ producer: 'adaptive:base/L1#t1' }, { producer: 'direct:base/LHI' }],
        y: [{ producer: 'adaptive:base/L1#t0' }],
        u: [{ producer: 'repeat:base/L1#default' }],
      });
      const ids = enumerateProducers(compileLayout(out), 'fold').byId;
      for (const id of ['adaptive:base/L1#t0', 'adaptive:base/L1#t1', 'repeat:base/L1#default']) {
        expect(ids.has(id), id).toBe(true);
      }
    });
  });
});
