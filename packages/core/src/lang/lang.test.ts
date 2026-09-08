import { describe, expect, it } from 'vitest';
import { DEFAULT_SOFT, normalizeText } from '../corpus/normalize.js';
import { compileLayout } from '../layout/compile.js';
import { bundledLayout } from '../layouts/index.js';
import { simulate } from '../sim/resolver.js';
import { layoutLanguageCoverage, producibleSymbols } from './coverage.js';
import { languageKeep, languageProfile, languageSoft } from './profiles.js';

describe('language profiles', () => {
  it('matches an exact tag, then falls back to the base language', () => {
    expect(languageProfile('pt-BR')?.name).toBe('Português (BR)');
    expect(languageProfile('pt-PT')?.tag).toBe('pt-BR');
    expect(languageProfile('es')?.required).toContain('ñ');
    expect(languageProfile('klingon')).toBeUndefined();
    expect(languageProfile(undefined)).toBeUndefined();
  });

  it('contributes each component language of a mixed corpus', () => {
    expect(languageKeep('es')).toEqual(['¿', '¡']);
    expect(languageKeep('en+es').sort()).toEqual(['¡', '¿']);
    expect(languageKeep('en')).toEqual([]);
  });

  /**
   * Keeping a mark in the stream without softening it would be worse than dropping it: an
   * unproducible symbol ends the word it is in, so every Spanish question would fragment the
   * n-grams *and* report `¿` beside the letters the layout genuinely cannot write.
   */
  it("treats a language's own punctuation the way it treats ? and !", () => {
    const es = normalizeText('¿Cómo estás? ¡Bien!', {
      caseMode: 'fold',
      keepAlso: languageKeep('es'),
    });
    expect(es).toBe('¿cómo estás? ¡bien!');

    const compiled = compileLayout(bundledLayout('qwerty')!);
    const hard = simulate(compiled, es, { caseMode: 'fold', crossWord: 'reset' });
    expect([...hard.coverage.unproducible.keys()]).toEqual(expect.arrayContaining(['¿', '¡']));

    const soft = simulate(compiled, es, {
      caseMode: 'fold',
      crossWord: 'reset',
      softSymbols: [...DEFAULT_SOFT, ...languageSoft('es')],
    });
    // Still unwritten, but reported as punctuation this board lacks rather than a missing letter —
    // joining `?` and `!`, which Qwerty also cannot reach without a modifier in fold mode.
    expect([...soft.coverage.unproducible.keys()]).toEqual(['ó', 'á']);
    expect([...soft.coverage.softDropped.keys()].sort()).toEqual(['!', '?', '¡', '¿']);
  });
});

describe('layout coverage', () => {
  const magic = compileLayout(bundledLayout('magic-romak')!);
  const qwerty = compileLayout(bundledLayout('qwerty')!);

  it('finds every accent Magic Romak can type', () => {
    const p = producibleSymbols(magic);
    for (const c of ['á', 'ã', 'ç', 'é', 'í', 'ó', 'õ', 'ú', 'â', 'ê', 'ô', 'à']) {
      expect(p.has(c), c).toBe(true);
    }
  });

  it('reports Portuguese as fully covered by Magic Romak and not by Qwerty', () => {
    expect(layoutLanguageCoverage(magic, 'pt-BR')?.missingRequired).toEqual([]);
    expect(layoutLanguageCoverage(qwerty, 'pt-BR')?.missingRequired.length).toBeGreaterThan(0);
  });

  it('names the characters Spanish, French and Italian still need', () => {
    // Magic Romak carries the Portuguese set: acute, tilde and circumflex everywhere, but grave
    // only on `à`. Italian needs grave on the other vowels, so those are exactly what is missing.
    expect(layoutLanguageCoverage(magic, 'it')?.missingRequired).toEqual(['è', 'ì', 'î', 'ò', 'ù']);
    expect(layoutLanguageCoverage(magic, 'es')?.missingRequired).toEqual(['ñ', 'ü']);
    expect(layoutLanguageCoverage(magic, 'fr')?.missingRequired).toEqual([
      'è',
      'ë',
      'î',
      'ï',
      'ù',
      'û',
      'ü',
      'ÿ',
      'œ',
    ]);
    expect(layoutLanguageCoverage(magic, 'en')?.missingRequired).toEqual([]);
  });

  it('has nothing to say about a language it does not know', () => {
    expect(layoutLanguageCoverage(magic, 'klingon')).toBeUndefined();
  });
});

describe('text classes', () => {
  const raw = 'Ligue 2 vezes: "olá!" — custa $5 (50%).';

  it('drops digits and symbols by default, as it always has', () => {
    expect(normalizeText(raw, { caseMode: 'fold' })).toBe('ligue vezes olá! - custa .');
  });

  it('keeps digits on request', () => {
    expect(normalizeText(raw, { caseMode: 'fold', textClass: 'letters+digits' })).toBe(
      'ligue 2 vezes olá! - custa 5 50.',
    );
  });

  it('keeps the symbol layer punctuation, and folds curly quotes onto the straight one', () => {
    expect(normalizeText(raw, { caseMode: 'fold', textClass: 'letters+digits+symbols' })).toBe(
      'ligue 2 vezes: "olá!" - custa $5 (50%).',
    );
  });

  it("keeps a language's own punctuation when asked", () => {
    const es = '¿Cómo estás? ¡Bien!';
    expect(normalizeText(es, { caseMode: 'fold' })).toBe('cómo estás? bien!');
    expect(normalizeText(es, { caseMode: 'fold', keepAlso: ['¿', '¡'] })).toBe(
      '¿cómo estás? ¡bien!',
    );
  });
});
