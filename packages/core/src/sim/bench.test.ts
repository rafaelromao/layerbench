import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeText } from '../corpus/normalize.js';
import { compileLayout } from '../layout/compile.js';
import { magicRomak, romak34 } from '../layouts/romak.js';
import { simulate } from './resolver.js';

const RUN = process.env.BENCH === '1';

describe.skipIf(!RUN)('benchmark (BENCH=1)', () => {
  it('simulates the 2 MB vendored corpora within budget', () => {
    const pt = readFileSync(new URL('../../../corpora/raw/corpus_pt.txt', import.meta.url), 'utf8');
    const en = readFileSync(new URL('../../../corpora/raw/corpus_en.txt', import.meta.url), 'utf8');
    for (const [name, layout] of [
      ['magicRomak', magicRomak],
      ['romak34', romak34],
    ] as const) {
      const compiled = compileLayout(layout);
      let t = performance.now();
      const stream = normalizeText(`${pt} ${en}`, { caseMode: 'fold' });
      const tNorm = performance.now() - t;
      t = performance.now();
      const r = simulate(compiled, stream, { caseMode: 'fold', crossWord: 'reset' });
      const tSim = performance.now() - t;
      console.log(
        `${name}: symbols=${stream.length} normalize=${tNorm.toFixed(0)}ms simulate=${tSim.toFixed(0)}ms keystrokes=${r.tables.stats.keystrokes} words=${r.tables.stats.words} logicalKeys=${r.tables.registry.keys.length} bigrams=${r.tables.noSpace.bigram.size} trigrams=${r.tables.noSpace.trigram.size} unproducible=${JSON.stringify([...r.coverage.unproducible.entries()].slice(0, 5))}`,
      );
      expect(tSim).toBeLessThan(6000);
    }
  });
});
