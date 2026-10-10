import {
  type AnalysisSettings,
  analysisKey,
  bundledLayout,
  compileLayout,
  DEFAULT_SETTINGS,
  getPreset,
  type RuleSet,
  toCanonicalJson,
  withoutFeatures,
} from '@layerbench/core';
import { nodeCorpusLoader } from '@layerbench/core/node';
import { describe, expect, it } from 'vitest';
import { testCorporaRoot } from '../test/render.js';
import { AnalysisCore } from './analysis-core.js';
import type { AnalyzeRequest, ReportDTO } from './protocol.js';

function settings(rules: RuleSet, over: Partial<AnalysisSettings> = {}): AnalysisSettings {
  return { ...DEFAULT_SETTINGS, corpus: 'en-general', sample: 5000, rules, ...over };
}

function request(
  rules: RuleSet,
  layoutId = 'qwerty',
  over: Partial<AnalysisSettings> = {},
): AnalyzeRequest {
  const layout = bundledLayout(layoutId);
  if (!layout) throw new Error(`${layoutId} is bundled`);
  return { layout: toCanonicalJson(layout), settings: settings(rules, over) };
}

const value = (report: ReportDTO, id: string) => report.results.find((r) => r.id === id)?.value;

describe('A report is scored by the rules it was asked for', () => {
  it('re-scores for another rule set instead of handing back the first one', async () => {
    const core = new AnalysisCore(nodeCorpusLoader(testCorporaRoot()));
    const doc = await core.analyze(request(getPreset('layouts_doc')));
    const cyan = await core.analyze(request(getPreset('cyanophage')));
    const keysolve = await core.analyze(request(getPreset('keysolve')));

    expect(cyan.key).not.toBe(doc.key);
    // cyanophage counts bigrams over keystrokes and draws lateral stretches by column pairs.
    expect(value(cyan, 'sfb')).not.toBe(value(doc, 'sfb'));
    expect(value(cyan, 'lsb')).not.toBe(value(doc, 'lsb'));
    // Keysolve differs from the Doc only in its scissors.
    expect(value(keysolve, 'sfb')).toBe(value(doc, 'sfb'));
    expect(value(keysolve, 'fsb')).not.toBe(value(doc, 'fsb'));
    // Effort is cyanophage's own grid under every preset.
    expect(value(cyan, 'effort')).toBe(value(doc, 'effort'));
  });

  it('counts space when asked to, and not otherwise', async () => {
    const core = new AnalysisCore(nodeCorpusLoader(testCorporaRoot()));
    const rules = getPreset('layouts_doc');
    const without = await core.analyze(request(rules));
    const withSpace = await core.analyze(request(rules, 'qwerty', { universe: 'with_space' }));
    expect(withSpace.globals.universe).toBe('with_space');
    expect(value(withSpace, 'sfb')).not.toBe(value(without, 'sfb'));
  });

  it('types a corpus once, whatever it is then scored by', async () => {
    const core = new AnalysisCore(nodeCorpusLoader(testCorporaRoot()));
    await core.analyze(request(getPreset('layouts_doc')));
    // Nothing needs typing for other rules: the report is there without an analysis.
    const peeked = core.peek(request(getPreset('cyanophage')));
    expect(peeked).not.toBeNull();
    const qwerty = bundledLayout('qwerty');
    if (!qwerty) throw new Error('qwerty is bundled');
    expect(peeked?.key).toBe(analysisKey(qwerty, settings(getPreset('cyanophage'))).key);
  });
});

describe('The engine works out what the settings ask for', () => {
  it('types the layout as written without the features left out, as if it were written so', async () => {
    const core = new AnalysisCore(nodeCorpusLoader(testCorporaRoot()));
    const rules = getPreset('layouts_doc');
    const off = ['macros', 'combos'] as const;
    const asked = await core.analyze(request(rules, 'magic-romak', { without: off }));
    const romak = bundledLayout('magic-romak');
    if (!romak) throw new Error('magic-romak is bundled');
    const plain = await core.analyze({
      layout: toCanonicalJson(withoutFeatures(romak, off)),
      settings: settings(rules),
    });
    expect(asked.results).toEqual(plain.results);
  });

  it('mixes two texts the first time they are asked for, and never lists the mix', async () => {
    const core = new AnalysisCore(nodeCorpusLoader(testCorporaRoot()));
    const listed = await core.listCorpora();
    const mixed = { corpus2: 'pt-br-general', share: 70 };
    const report = await core.analyze(request(getPreset('layouts_doc'), 'qwerty', mixed));
    const alone = await core.analyze(request(getPreset('layouts_doc')));
    expect(report.results).not.toEqual(alone.results);
    // Asked again, under other rules, it is not typed again.
    expect(core.peek(request(getPreset('cyanophage'), 'qwerty', mixed))).not.toBeNull();
    expect(await core.listCorpora()).toEqual(listed);
  });
});

describe('Heat is counted on the layer each key was pressed on', () => {
  it("never warms a key from another layer's presses", async () => {
    const core = new AnalysisCore(nodeCorpusLoader(testCorporaRoot()));
    const report = await core.analyze(request(getPreset('layouts_doc'), 'magic-romak'));
    const compiled = compileLayout(bundledLayout('magic-romak')!);
    let warm = 0;
    report.usageByLayer.forEach((counts, layer) => {
      compiled.keys.forEach((key, pos) => {
        if (!(counts[pos] > 0)) return;
        warm++;
        // What was pressed there is the key drawn there: never one that shows through or is empty.
        const kind = compiled.layers[layer].bindings[pos].kind;
        expect(['trans', 'none'], `${compiled.layers[layer].id}/${key.id}`).not.toContain(kind);
      });
    });
    expect(warm).toBeGreaterThan(0);
    // Every layer's presses add up to all of them.
    const all = report.usageAll.reduce((a, b) => a + b, 0);
    const byLayer = report.usageByLayer.flat().reduce((a, b) => a + b, 0);
    expect(byLayer).toBe(all);
  });
});

describe('A closer look at one key', () => {
  it("lists a kept report's key, and turns away one it does not keep", async () => {
    const core = new AnalysisCore(nodeCorpusLoader(testCorporaRoot()));
    const rules = getPreset('layouts_doc');
    const report = await core.analyze(request(rules, 'magic-romak'));
    const compiled = compileLayout(bundledLayout('magic-romak') as never);
    const r0 = compiled.keyIndex.get('R0') as number;
    const stats = core.keyStats({ reportKey: report.key, key: r0, layer: 0 });
    expect(stats?.key).toBe(r0);
    // The Alpha 2 thumb was pressed for keys on Alpha 2, and the shares add up.
    expect(stats?.next.length).toBeGreaterThan(0);
    expect(stats?.next.reduce((s, n) => s + n.share, 0)).toBeCloseTo(1, 9);
    expect(core.keyStats({ reportKey: 'gone', key: r0, layer: 0 })).toBeNull();
    expect(core.keyStats({ reportKey: `${report.key}~relabel`, key: r0, layer: 0 })).toBeNull();
    expect(core.keyStats({ reportKey: report.key, key: 999, layer: 0 })).toBeNull();
  });

  it('draws Effort by cost, so a free key stays cold and a tapped thumb is warm, and travel by distance', async () => {
    const core = new AnalysisCore(nodeCorpusLoader(testCorporaRoot()));
    const report = await core.analyze(request(getPreset('layouts_doc')));
    const effort = report.results.find((r) => r.id === 'effort');
    const travel = report.results.find((r) => r.id === 'finger_travel');
    const compiled = compileLayout(bundledLayout('qwerty') as never);
    const homeIndex = compiled.keyIndex.get('LHI') as number;
    expect(effort?.per_layer_key[0]?.[homeIndex] ?? 0).toBe(0);
    expect(Object.keys(travel?.per_key ?? {}).length).toBeGreaterThan(5);

    // Magic Romak's Alpha 2 thumb costs what it is tapped.
    const romak = await core.analyze(request(getPreset('layouts_doc'), 'magic-romak'));
    const r0 = compileLayout(bundledLayout('magic-romak') as never).keyIndex.get('R0') as number;
    const romakEffort = romak.results.find((r) => r.id === 'effort');
    expect(romakEffort?.per_layer_key[0]?.[r0] ?? 0).toBeGreaterThan(0);
  });
});
