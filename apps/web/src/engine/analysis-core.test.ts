import {
  bundledLayout,
  compileLayout,
  getPreset,
  type RuleSet,
  toCanonicalJson,
} from '@layoutmaster/core';
import { nodeCorpusLoader } from '@layoutmaster/core/node';
import { describe, expect, it } from 'vitest';
import { withUniverse } from '../storage/rule-sets.js';
import { testCorporaRoot } from '../test/render.js';
import { AnalysisCore } from './analysis-core.js';
import type { AnalyzeRequest, ReportDTO } from './protocol.js';

function request(ruleSet: RuleSet, layoutId = 'qwerty'): AnalyzeRequest {
  const layout = bundledLayout(layoutId);
  if (!layout) throw new Error(`${layoutId} is bundled`);
  return {
    layout: toCanonicalJson(layout),
    corpusId: 'en-conv',
    caseMode: 'fold',
    textClass: 'letters',
    crossWord: 'reset',
    maxSymbols: 5000,
    ruleSet,
  };
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
    const without = await core.analyze(request(withUniverse(rules, 'no_space')));
    const withSpace = await core.analyze(request(withUniverse(rules, 'with_space')));
    expect(withSpace.globals.universe).toBe('with_space');
    expect(value(withSpace, 'sfb')).not.toBe(value(without, 'sfb'));
  });

  it('types a corpus once, whatever it is then scored by', async () => {
    const core = new AnalysisCore(nodeCorpusLoader(testCorporaRoot()));
    await core.analyze(request(getPreset('layouts_doc')));
    // Nothing needs typing for other rules: the report is there without an analysis.
    const peeked = core.peek(request(getPreset('cyanophage')));
    expect(peeked).not.toBeNull();
    expect(peeked?.key).toBe(core.keyFor(request(getPreset('cyanophage'))));
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
