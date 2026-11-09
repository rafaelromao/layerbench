import { describe, expect, it } from 'vitest';
import { normalizeText } from '../corpus/normalize.js';
import { FIXTURE_EN, FIXTURE_PT } from '../fixtures/index.js';
import { getGeometryPreset } from '../geometry/presets.js';
import { layoutLanguageCoverage } from '../lang/coverage.js';
import { bundledLayout, withNewLayoutDefaults } from '../layouts/index.js';
import { enumerateProducers } from '../sim/producers.js';
import { simulate } from '../sim/resolver.js';
import { compileLayout } from './compile.js';
import { toCanonicalJson } from './json.js';
import { safeParseLayout } from './schema.js';
import type { Layout } from './types.js';
import { type FeatureKind, withoutFeatures } from './without.js';

const magicRomak = bundledLayout('magic-romak')!;

const OPTS = { caseMode: 'fold', crossWord: 'reset' } as const;
const text = normalizeText(`${FIXTURE_EN} ${FIXTURE_PT}`, OPTS);

/** How each string can be typed on Magic Romak with some features switched off, by kind. */
function kinds(off: FeatureKind[]): Map<string, string[]> {
  const index = enumerateProducers(compileLayout(withoutFeatures(magicRomak, off)), 'fold');
  return new Map([...index.bySymbol].map(([s, ps]) => [s, ps.map((p) => p.kind)]));
}

describe('Ranking a layout without some of its features', () => {
  it('changes nothing when nothing is switched off', () => {
    expect(withoutFeatures(magicRomak, [])).toBe(magicRomak);
  });

  it('keeps the adaptive key as the letter it types by default', () => {
    const all = kinds([]);
    expect(all.get('v')).toContain('adaptive');
    const plain = kinds(['adaptive']);
    expect(plain.get('h')).not.toContain('adaptive');
    expect(plain.get('v')).not.toContain('adaptive');
    // Alt repeat is a plain repeat key now, and still offered.
    expect(plain.get('')).toContain('repeat');
  });

  it('drops the macros that type two letters, but not the ones that type one', () => {
    const before = kinds([]);
    // Magic Romak's own, on Alpha 2.
    expect(before.get('qu')).toEqual(['macro']);
    expect(before.get('ão')).toBeDefined();

    const after = kinds(['macros']);
    expect(after.has('qu')).toBe(false);
    expect(after.has('ão')).toBe(false);
    expect(after.has('ões')).toBe(false);
    // `q` and `u` are still keys of their own; accents are one letter each, sent as a macro.
    expect(after.get('q')).toBeDefined();
    for (const accent of ['á', 'é', 'í', 'ó', 'ú', 'â', 'ê', 'ô', 'ã', 'õ', 'ç']) {
      expect(after.get(accent), accent).toBeDefined();
    }
    const coverage = layoutLanguageCoverage(
      compileLayout(withoutFeatures(magicRomak, ['macros'])),
      'pt',
    );
    expect(coverage?.missingRequired).toEqual([]);
  });

  it('types without combos what it can, and leaves out what only a combo types', () => {
    const after = kinds(['combos']);
    expect([...after.values()].flat()).not.toContain('combo');
    // Magic Romak's à is a combo on Alpha 2, and its grave dead key another: it has no other way.
    expect(after.has('à')).toBe(false);
    const coverage = layoutLanguageCoverage(
      compileLayout(withoutFeatures(magicRomak, ['combos'])),
      'pt',
    );
    expect(coverage?.missingRequired).toEqual(['à']);
  });

  it('keeps a combo that only turns a layer on: the way to Accents stays, and the accents with it', () => {
    // A Special layout reaches Accents by a combo; the others, by a thumb.
    const nordrassil = bundledLayout('nordrassil') as Layout;
    const without = withoutFeatures(nordrassil, ['combos']);
    expect(without.combos?.map((c) => c.id)).toEqual(['accents']);
    const coverage = layoutLanguageCoverage(compileLayout(without), 'pt');
    expect(coverage?.missingRequired).toEqual([]);
  });

  it('keeps a combo whose every part only turns a layer on, through a tap-hold, a morph or an adaptive key', () => {
    const qwerty = withNewLayoutDefaults(
      bundledLayout('qwerty') as Layout,
      getGeometryPreset('3x5+2'),
    );
    const layer = qwerty.layers[1].id;
    const sl = { kind: 'sl' as const, layer };
    const combo = (
      id: string,
      keys: string[],
      binding: Layout['layers'][number]['bindings'][string],
    ) => ({
      id,
      keys,
      binding,
      layers: ['base'],
    });
    const layout: Layout = {
      ...qwerty,
      combos: [
        combo('held', ['RHI', 'RHM'], { kind: 'hold_tap', tap: sl, hold: { kind: 'mo', layer } }),
        combo('morph', ['RTI', 'RTM'], {
          kind: 'mod_morph',
          mods: ['LSHIFT'],
          default: sl,
          morphed: sl,
        }),
        combo('adaptive', ['RBI', 'RBM'], { kind: 'adaptive', default: sl, triggers: [] }),
        combo('types', ['LTI', 'LTM'], {
          kind: 'hold_tap',
          tap: sl,
          hold: { kind: 'kp', symbol: 'x' },
        }),
      ],
    };
    expect(withoutFeatures(layout, ['combos']).combos?.map((c) => c.id)).toEqual([
      'held',
      'morph',
      'adaptive',
    ]);
  });

  it('is still a document the engine reads back', () => {
    const all = withoutFeatures(magicRomak, ['adaptive', 'repeat', 'combos', 'macros']);
    const back = safeParseLayout(JSON.parse(JSON.stringify(toCanonicalJson(all))));
    expect(back.ok).toBe(true);
  });

  it('taps doubled letters twice without a repeat key', () => {
    const layout = withoutFeatures(magicRomak, ['repeat']);
    expect(kinds(['repeat']).has('')).toBe(false);
    expect(layout.repeatPolicy?.doubledLetters).toBe('tapTwice');
    const tables = simulate(compileLayout(layout), text, OPTS).tables;
    expect(tables.stats.repeat_presses).toBe(0);
  });

  it('drops a declared rule for doubled letters with the repeat key, and keeps the one for shift', () => {
    const both: Layout = {
      ...magicRomak,
      typingRules: {
        shift: [{ way: 'hold' }, { way: 'sk' }],
        doubledLetters: [{ way: 'repeatKey' }, { way: 'tapTwice' }],
      },
    };
    const layout = withoutFeatures(both, ['repeat']);
    expect(layout.typingRules).toEqual({ shift: both.typingRules?.shift });
    // With only that rule declared, nothing is left declared.
    const alone = withoutFeatures(
      { ...magicRomak, typingRules: { doubledLetters: both.typingRules?.doubledLetters } },
      ['repeat'],
    );
    expect(alone.typingRules).toBeUndefined();
    expect(compileLayout(alone).doubledWays).toBeNull();
    // The other features leave the rules as they are.
    expect(withoutFeatures(both, ['combos']).typingRules).toBe(both.typingRules);
  });
});
