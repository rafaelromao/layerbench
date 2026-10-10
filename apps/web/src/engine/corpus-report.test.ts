import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BUNDLED_LAYOUTS,
  type CorpusManifest,
  languageProfile,
  toCanonicalJson,
} from '@layerbench/core';
import { nodeCorpusLoader } from '@layerbench/core/node';
import { describe, it } from 'vitest';
import { formatValue } from '../components/format.js';
import { testCorporaRoot } from '../test/render.js';
import { AnalysisCore } from './analysis-core.js';
import { libraryRanking, summarize } from './use-summaries.js';

/**
 * Not a test: the summary a pull request that adds or changes a bundled text gets, for whoever
 * reviews it. The corpora workflow names the texts and the file to write:
 * `CORPUS_REPORT="id …" CORPUS_REPORT_FILE=report.md vitest run src/engine/corpus-report.test.ts`.
 * Each text is described as it will be served, with what it is made of, and with how the bundled
 * layouts fare on it, scored as the Library scores them.
 */
const IDS = (process.env.CORPUS_REPORT ?? '').split(/\s+/).filter(Boolean);
const FILE = process.env.CORPUS_REPORT_FILE ?? '';

/** Letters shown, most frequent first. */
const LETTERS_SHOWN = 12;
const LAYOUTS_SHOWN = 5;

function percent(n: number, of: number): string {
  return `${((n / of) * 100).toFixed(2)}%`;
}

/** How often each letter turns up, capitals counted as lower case. */
function letterCounts(sample: string): [string, number][] {
  const counts = new Map<string, number>();
  for (const c of sample.toLowerCase()) {
    if (/\p{L}/u.test(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

describe.skipIf(!FILE)('corpus report (CORPUS_REPORT_FILE)', () => {
  it('writes what a reviewer needs to know about each text', async () => {
    const loader = nodeCorpusLoader(testCorporaRoot());
    const core = new AnalysisCore(loader);
    const corpora = new Map((await loader.list()).map((m) => [m.id, m] as const));

    const lines = ['## Bundled texts in this pull request', ''];
    if (IDS.length === 0) lines.push('No text was added or changed.');
    for (const id of IDS) {
      const manifest: CorpusManifest | undefined = corpora.get(id);
      if (!manifest) {
        lines.push(
          `### \`${id}\``,
          '',
          'Not among the texts the app serves: see the checks above.',
          '',
        );
        continue;
      }
      const sample = readFileSync(resolve(testCorporaRoot(), id, 'sample.txt'), 'utf8');
      const kb = Math.round(new TextEncoder().encode(sample).length / 1000);
      const counts = letterCounts(sample);
      const letters = counts.reduce((sum, [, n]) => sum + n, 0);
      const profile = languageProfile(manifest.language);
      const alphabet = new Set([
        ...'abcdefghijklmnopqrstuvwxyz',
        ...(profile?.required ?? []),
        ...(profile?.optional ?? []),
      ]);
      const foreign = counts.filter(([c]) => !alphabet.has(c));
      const foreignCount = foreign.reduce((sum, [, n]) => sum + n, 0);

      lines.push(
        `### ${manifest.name} (\`${id}\`)`,
        '',
        manifest.description ?? '',
        '',
        `- Language: ${profile?.name ?? manifest.language} (\`${manifest.language}\`) · ` +
          `licence: ${manifest.license} · source: ${manifest.source}`,
        `- Served sample: ${kb} kB, ${manifest.words.toLocaleString('en-US')} words, ` +
          `${manifest.symbols.toLocaleString('en-US')} symbols`,
        `- Most frequent letters: ${counts
          .slice(0, LETTERS_SHOWN)
          .map(([c, n]) => `${c} ${percent(n, letters)}`)
          .join(', ')}`,
        foreign.length > 0
          ? `- Letters outside ${profile?.name ?? 'its language'}: ${percent(foreignCount, letters)} ` +
              `of the letters, ${foreign
                .slice(0, LETTERS_SHOWN)
                .map(([c]) => c)
                .join(' ')}${foreign.length > LETTERS_SHOWN ? ' …' : ''}`
          : `- No letter outside ${profile?.name ?? 'its language'}`,
        '',
      );

      const summaries = await Promise.all(
        BUNDLED_LAYOUTS.map(async (layout) => {
          const request = { layout: toCanonicalJson(layout), settings: libraryRanking(id) };
          return { layout, summary: summarize(await core.analyze(request)) };
        }),
      );
      const ranked = summaries
        .filter(({ summary }) => summary.effort !== null)
        .sort((a, b) => (a.summary.effort ?? 0) - (b.summary.effort ?? 0));
      const skipping = summaries.filter(({ summary }) => summary.skipped >= 1);
      lines.push(
        `The ${LAYOUTS_SHOWN} bundled layouts with the lowest Effort on it, as the Library ranks them:`,
        '',
        '| Layout | Effort | SFB | Skips |',
        '|---|---|---|---|',
        ...ranked
          .slice(0, LAYOUTS_SHOWN)
          .map(
            ({ layout, summary }) =>
              `| ${layout.name} | ${formatValue(summary.effort, 'effort')} | ${formatValue(
                summary.sfb,
                'percent',
              )} | ${summary.skipped.toFixed(2)}% |`,
          ),
        '',
        skipping.length > 0
          ? `${skipping.length} of ${summaries.length} bundled layouts skip 1% of its letters or more, ` +
              `for lack of ${[...new Set(skipping.flatMap(({ summary }) => summary.missing))]
                .slice(0, LETTERS_SHOWN)
                .join(' ')}.`
          : `Every bundled layout types at least 99% of its letters.`,
        '',
      );
    }
    writeFileSync(FILE, `${lines.join('\n')}\n`);
  }, 900_000);
});
