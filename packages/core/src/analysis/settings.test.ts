import { describe, expect, it } from 'vitest';
import { type Corpus, corpusStream, DEFAULT_SOFT, mixCorpora } from '../corpus/index.js';
import { nodeCorpusLoader } from '../corpus/node-loader.js';
import { corporaRoot } from '../golden/paths.js';
import { compileLayout } from '../layout/compile.js';
import { bundledLayout } from '../layouts/index.js';
import { getPreset } from '../rules/presets.js';
import type { RuleSet } from '../rules/types.js';
import { analyze } from './analyze.js';
import {
  type AnalysisSettings,
  analysisKey,
  analysisPlan,
  analysisRun,
  DEFAULT_SETTINGS,
  forRanking,
  loadText,
  RANKING_SAMPLE,
  typedLayout,
} from './settings.js';

function settings(over: Partial<AnalysisSettings> = {}): AnalysisSettings {
  return { ...DEFAULT_SETTINGS, corpus: 'en-general', rules: getPreset('layouts_doc'), ...over };
}

function layout(id: string) {
  const l = bundledLayout(id);
  if (!l) throw new Error(`${id} is bundled`);
  return l;
}

function corpus(id: string, language: string, sample: string): Corpus {
  return { id, name: id, language, sample, symbols: sample.length, words: 0, custom: false };
}

describe('The Library ranks on the settings in its link, with the sample capped', () => {
  it.each([
    [1_000, 1_000],
    [100_000, 100_000],
    [300_000, RANKING_SAMPLE],
    [1_000_000, RANKING_SAMPLE],
  ])('a sample of %i is ranked on %i', (sample, ranked) => {
    expect(forRanking(settings({ sample })).sample).toBe(ranked);
  });

  it('changes nothing else', () => {
    const s = settings({ sample: 300_000, corpus2: 'pt-br-general', share: 70 });
    expect(forRanking(s)).toEqual({ ...s, sample: RANKING_SAMPLE });
  });
});

describe('The plan: what the engine is told', () => {
  it('names one corpus, whatever share is left over from an earlier mix', () => {
    expect(analysisPlan(settings({ share: 70 })).text).toBe('en-general');
  });

  it('names a mix by both corpora and their shares, as the mix itself is named', () => {
    const s = settings({ corpus2: 'pt-br-general', share: 70 });
    const mixed = mixCorpora([
      [corpus('en-general', 'en', 'one. two.'), 70],
      [corpus('pt-br-general', 'pt-BR', 'três. quatro.'), 30],
    ]);
    expect(analysisPlan(s).text).toBe(mixed.id);
  });

  it('counts space as the settings say, and leaves the rule set given alone', () => {
    const preset = getPreset('cyanophage');
    const rules: RuleSet = { ...preset, globals: { ...preset.globals, universe: 'no_space' } };
    const plan = analysisPlan(settings({ rules, universe: 'with_space' }));
    expect(plan.ruleSet.globals.universe).toBe('with_space');
    expect(rules.globals.universe).toBe('no_space');
    // One that counts space already as asked is used as it is.
    expect(analysisPlan(settings({ rules })).ruleSet).toBe(rules);
  });

  it.each([
    ['layouts_doc', 'reset'],
    ['cyanophage', 'reset'],
    ['keysolve', 'reset'],
  ])('takes cross-word from the rule set: %s → %s', (preset, crossWord) => {
    expect(analysisPlan(settings({ rules: getPreset(preset) })).crossWord).toBe(crossWord);
  });

  it('bridges words when the rule set does, and resets them when it says nothing', () => {
    const doc = getPreset('layouts_doc');
    const bridge: RuleSet = { ...doc, globals: { ...doc.globals, cross_word: 'bridge' } };
    const silent = { ...doc, globals: {} } as RuleSet;
    expect(analysisPlan(settings({ rules: bridge })).crossWord).toBe('bridge');
    expect(analysisPlan(settings({ rules: silent })).crossWord).toBe('reset');
  });

  it('lists each feature left out once, in the order they are listed', () => {
    const plan = analysisPlan(settings({ without: ['macros', 'adaptive', 'macros'] }));
    expect(plan.without).toEqual(['adaptive', 'macros']);
  });
});

describe('The layout as typed', () => {
  it('is the layout given when nothing is left out', () => {
    const compiled = compileLayout(layout('magic-romak'));
    expect(typedLayout(compiled, [])).toBe(compiled);
  });

  it('is typed without the features left out', () => {
    const compiled = compileLayout(layout('magic-romak'));
    const plain = typedLayout(compiled, ['macros', 'adaptive', 'repeat', 'combos']);
    expect(plain).not.toBe(compiled);
    expect(plain.combos.length).toBeLessThan(compiled.combos.length);
  });
});

describe('The identity of an analysis', () => {
  const romak = layout('magic-romak');

  it('is the same for the same layout and settings, whatever order the features are listed in', () => {
    const a = analysisKey(romak, settings({ without: ['combos', 'macros'] }));
    const b = analysisKey(romak, settings({ without: ['macros', 'combos'] }));
    expect(a).toEqual(b);
  });

  it('leaves out the colour a layer is drawn in, which types nothing', () => {
    const coloured = {
      ...romak,
      layers: romak.layers.map((l, i) => (i === 1 ? { ...l, color: 'red' as const } : l)),
    };
    expect(analysisKey(coloured, settings())).toEqual(analysisKey(romak, settings()));
  });

  it.each<[string, Partial<AnalysisSettings>]>([
    ['corpus', { corpus: 'pt-br-general' }],
    ['mix', { corpus2: 'pt-br-general' }],
    ['share', { corpus2: 'pt-br-general', share: 70 }],
    ['case', { caseMode: 'model' }],
    ['text class', { textClass: 'letters+digits' }],
    ['sample', { sample: 300_000 }],
    ['features left out', { without: ['combos'] }],
  ])('types differently for another %s', (_, over) => {
    expect(analysisKey(romak, settings(over)).typing).not.toBe(
      analysisKey(romak, settings()).typing,
    );
  });

  it('types the same presses under other rules, or with space counted, and scores them apart', () => {
    const doc = analysisKey(romak, settings());
    const cyan = analysisKey(romak, settings({ rules: getPreset('cyanophage') }));
    const spaced = analysisKey(romak, settings({ universe: 'with_space' }));
    expect(cyan.typing).toBe(doc.typing);
    expect(spaced.typing).toBe(doc.typing);
    expect(cyan.key).not.toBe(doc.key);
    expect(spaced.key).not.toBe(doc.key);
  });

  it('types differently when the rules bridge words', () => {
    const doc = getPreset('layouts_doc');
    const bridge: RuleSet = { ...doc, globals: { ...doc.globals, cross_word: 'bridge' } };
    expect(analysisKey(romak, settings({ rules: bridge })).typing).not.toBe(
      analysisKey(romak, settings()).typing,
    );
  });
});

describe('The text', () => {
  const texts: Record<string, Corpus> = {
    'en-general': corpus('en-general', 'en', 'One two. Three four.'),
    'es-general': corpus('es-general', 'es', '¿Uno dos? Tres cuatro.'),
  };
  const load = async (id: string) => {
    const t = texts[id];
    if (!t) throw new Error(`no ${id}`);
    return t;
  };

  it('is the corpus alone, or the mix of both', async () => {
    expect(await loadText(settings(), load)).toBe(texts['en-general']);
    const mixed = await loadText(settings({ corpus2: 'es-general', share: 70 }), load);
    expect(mixed.id).toBe(analysisPlan(settings({ corpus2: 'es-general', share: 70 })).text);
    expect(mixed.language).toBe('en+es');
  });

  it("counts a mix's own punctuation as punctuation", async () => {
    const mixed = await loadText(settings({ corpus2: 'es-general' }), load);
    const { options } = analysisRun(settings(), mixed);
    expect(options.softSymbols).toEqual(expect.arrayContaining([...DEFAULT_SOFT, '¿']));
  });
});

describe('Analyzing on the settings gives the numbers analyzing by hand gave', () => {
  const loader = nodeCorpusLoader(corporaRoot());

  it.each([
    ['qwerty', 'layouts_doc', 'fold'],
    ['qwerty', 'cyanophage', 'model'],
    ['magic-romak', 'layouts_doc', 'model'],
    ['magic-romak', 'cyanophage', 'fold'],
  ] as const)('%s, %s, %s', async (id, preset, caseMode) => {
    const s = settings({ rules: getPreset(preset), caseMode, sample: 5_000 });
    const text = await loadText(s, (c) => loader.load(c));
    const run = analysisRun(s, text);
    const compiled = typedLayout(compileLayout(layout(id)), s.without);
    const ours = analyze(compiled, run.stream, run.options);

    const rules = getPreset(preset);
    const byHand = analyze(layout(id), corpusStream(text, caseMode, 'letters'), {
      caseMode,
      maxSymbols: 5_000,
      ruleSet: { ...rules, globals: { ...rules.globals, universe: 'no_space' } },
      softSymbols: [...DEFAULT_SOFT],
    });
    expect(ours.results).toEqual(byHand.results);
    expect(ours.stats).toEqual(byHand.stats);
  });
});
