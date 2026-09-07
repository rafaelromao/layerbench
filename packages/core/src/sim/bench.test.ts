import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyze } from '../analysis/analyze.js';
import { relabelEligible, relabelSwap } from '../analysis/relabel.js';
import { normalizeText } from '../corpus/normalize.js';
import { compileLayout } from '../layout/compile.js';
import { swapKeys } from '../layout/ops.js';
import { bundledLayout } from '../layouts/index.js';
import { layoutsDoc } from '../rules/presets.js';

const RUN = process.env.BENCH === '1';

function rawCorpus(): string {
  const pt = readFileSync(new URL('../../../corpora/raw/corpus_pt.txt', import.meta.url), 'utf8');
  const en = readFileSync(new URL('../../../corpora/raw/corpus_en.txt', import.meta.url), 'utf8');
  return `${pt} ${en}`;
}

/**
 * Performance budget for the worker: an edit must feel immediate and a full corpus must finish
 * while the user watches a progress bar. Run with `pnpm bench`.
 */
describe.skipIf(!RUN)('performance budget (BENCH=1)', () => {
  const ruleSet = layoutsDoc();
  const layout = bundledLayout('magic-romak')!;
  const compiled = compileLayout(layout);
  const stream = normalizeText(rawCorpus(), { caseMode: 'fold' });

  it('analyzes 300k symbols within 1.5 s', () => {
    const t = performance.now();
    const r = analyze(compiled, stream, { caseMode: 'fold', maxSymbols: 300_000, ruleSet });
    const ms = performance.now() - t;
    console.log(
      `300k: ${ms.toFixed(0)}ms keystrokes=${r.stats.keystrokes} logicalKeys=${r.simulation.registry.all().length} bigrams=${r.simulation.noSpace.bigram.size}`,
    );
    expect(ms).toBeLessThan(1500);
  });

  it('analyzes 1M symbols within 5 s', () => {
    const t = performance.now();
    const r = analyze(compiled, stream, { caseMode: 'fold', maxSymbols: 1_000_000, ruleSet });
    const ms = performance.now() - t;
    console.log(`1M: ${ms.toFixed(0)}ms symbols=${r.stats.symbols}`);
    expect(ms).toBeLessThan(5000);
  });

  it('re-scores a swap within 50 ms', () => {
    const qwerty = bundledLayout('qwerty')!;
    const c0 = compileLayout(qwerty);
    const base = analyze(c0, stream, { caseMode: 'fold', maxSymbols: 300_000, ruleSet });
    const posA = c0.keyIndex.get('LTM')!;
    const posB = c0.keyIndex.get('RHI')!;
    expect(relabelEligible(c0, 0, posA, posB)).toBe(true);
    const c1 = compileLayout(swapKeys(qwerty, 0, 'LTM', 'RHI'));
    const t = performance.now();
    relabelSwap(base, c1, 0, posA, posB, ruleSet);
    const ms = performance.now() - t;
    console.log(`relabel: ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(50);
  });
});
