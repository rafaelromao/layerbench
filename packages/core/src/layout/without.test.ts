import { describe, expect, it } from 'vitest';
import { normalizeText } from '../corpus/normalize.js';
import { FIXTURE_EN, FIXTURE_PT } from '../fixtures/index.js';
import { layoutLanguageCoverage } from '../lang/coverage.js';
import { bundledLayout } from '../layouts/index.js';
import { magicRomak } from '../layouts/romak.js';
import { enumerateProducers } from '../sim/producers.js';
import { simulate } from '../sim/resolver.js';
import { compileLayout, inlineBehaviors } from './compile.js';
import { toCanonicalJson } from './json.js';
import { safeParseLayout } from './schema.js';
import type { Layout } from './types.js';
import { type FeatureKind, withoutFeatures } from './without.js';

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

  it('types exactly as before once its behaviours are inlined', () => {
    const before = simulate(compileLayout(magicRomak), text, OPTS).tables;
    const after = simulate(compileLayout(inlineBehaviors(magicRomak)), text, OPTS).tables;
    expect(after.stats).toEqual(before.stats);
    expect(after.noSpace.totals).toEqual(before.noSpace.totals);
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
      'pt-BR',
    );
    expect(coverage?.missingRequired).toEqual([]);
  });

  it('types without combos what it can, and leaves out what only a combo types', () => {
    const after = kinds(['combos']);
    expect([...after.values()].flat()).not.toContain('combo');
    // Magic Romak's à is a combo on Alpha 2; without it, the grave dead key and a still type it.
    expect(after.get('à')).toEqual(['deadkey']);
    const coverage = layoutLanguageCoverage(
      compileLayout(withoutFeatures(magicRomak, ['combos'])),
      'pt-BR',
    );
    expect(coverage?.missingRequired).toEqual([]);
  });

  it('keeps a combo that only turns a layer on: the way to Dead keys stays, and the accents with it', () => {
    const qwerty = bundledLayout('qwerty') as Layout;
    const without = withoutFeatures(qwerty, ['combos']);
    expect(without.combos?.map((c) => c.id)).toEqual(['dead-keys']);
    const coverage = layoutLanguageCoverage(compileLayout(without), 'pt-BR');
    expect(coverage?.missingRequired).toEqual([]);
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
});
