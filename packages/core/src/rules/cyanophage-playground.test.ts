import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyze } from '../analysis/analyze.js';
import { analysisRun, DEFAULT_SETTINGS } from '../analysis/settings.js';
import { nodeCorpusLoader } from '../corpus/node-loader.js';
import { corporaRoot } from '../golden/paths.js';
import { importTextLayout } from '../layout/text.js';
import { cyanophage } from './presets.js';

/**
 * The engine held to cyanophage's playground without a browser: the numbers his page printed for
 * each layout, pinned in the e2e's fixture (`apps/web/e2e/cyanophage/fixture.json`), against what
 * the cyanophage-like rules give the same string on the same text, at the two decimals he prints.
 * The e2e (`apps/web/e2e/cyanophage.spec.ts`) checks the same through the app.
 */

interface Fixture {
  corpus: string;
  text: { sha256: string };
  layouts: { name: string; layout: string; shown: Record<string, string> }[];
}

const fixture: Fixture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../apps/web/e2e/cyanophage/fixture.json', import.meta.url)),
    'utf8',
  ),
);

describe('the cyanophage-like rules read what his playground reads', async () => {
  const text = await nodeCorpusLoader(corporaRoot()).load(fixture.corpus);
  // The whole text, letters only, case folded and space not counted: the app's own defaults.
  const { stream, options } = analysisRun(
    { ...DEFAULT_SETTINGS, corpus: fixture.corpus, sample: 1_000_000, rules: cyanophage() },
    text,
  );

  it('his numbers were read on the text the engine types', () => {
    // The e2e's text (`apps/web/e2e/cyanophage/text.ts`): this stream, with the letters his popup
    // turns into plain ones pasted as `#`. A different hash means LayerBench's text changed: read
    // his page again (docs/research/cyanophage-e2e.md) before the numbers can be compared.
    const pasted = stream.replace(/[äåáàâöóíüéèçæßğ]/g, '#');
    expect(createHash('sha256').update(pasted).digest('hex')).toBe(fixture.text.sha256);
  });

  for (const { name, layout, shown } of fixture.layouts) {
    it(name, { timeout: 120_000 }, () => {
      const report = analyze(importTextLayout(layout, 'ansi', name).layout, stream, options);
      const read = Object.fromEntries(
        Object.keys(shown).map((id) => [
          id,
          report.results.find((r) => r.id === id)?.value?.toFixed(2),
        ]),
      );
      expect(read).toEqual(shown);
    });
  }
});
