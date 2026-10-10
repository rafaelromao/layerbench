import { writeFileSync } from 'node:fs';
import {
  BUNDLED_LAYOUTS,
  type CorpusManifest,
  GEOMETRY_PRESET_IDS,
  getGeometryPreset,
  type Layout,
  toCanonicalJson,
} from '@layerbench/core';
import { nodeCorpusLoader } from '@layerbench/core/node';
import { describe, it } from 'vitest';
import { formatValue } from '../components/format.js';
import { testCorporaRoot } from '../test/render.js';
import { encodeInline } from '../url/inline.js';
import { inlineRef, parseParams, selectionSearch } from '../url/params.js';
import { AnalysisCore } from './analysis-core.js';
import { type LayoutSummary, libraryRanking, summarize } from './use-summaries.js';

/**
 * Not a test: the summary a pull request that adds or changes a bundled layout gets, for whoever
 * reviews it. The layouts workflow names the layouts and the file to write:
 * `LAYOUT_REPORT="id …" LAYOUT_REPORT_FILE=report.md vitest run src/engine/layout-report.test.ts`.
 * Each layout is scored as the Library scores it, on the texts of its languages, ranked among the
 * layouts that come with the app, and linked so it can be opened before it is merged.
 */
const IDS = (process.env.LAYOUT_REPORT ?? '').split(/\s+/).filter(Boolean);
const FILE = process.env.LAYOUT_REPORT_FILE ?? '';
const APP = process.env.APP_ORIGIN || 'https://layerbench.github.io';

/** A text for each of the layout's languages; English news for a layout that names none. */
function textsFor(layout: Layout, corpora: CorpusManifest[]): CorpusManifest[] {
  const out: CorpusManifest[] = [];
  for (const tag of layout.languages?.length ? layout.languages : ['en']) {
    const mine = corpora.filter((c) => c.language === tag);
    const pick = mine.find((c) => c.id.endsWith('-general')) ?? mine[0];
    if (pick && !out.includes(pick)) out.push(pick);
  }
  return out.length > 0 ? out : corpora.filter((c) => c.id === 'en-general');
}

function board(layout: Layout): string {
  const preset = 'preset' in layout.geometry ? layout.geometry.preset : null;
  return preset && GEOMETRY_PRESET_IDS.includes(preset)
    ? getGeometryPreset(preset).name
    : 'a board of its own';
}

function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/** Where a number places among the others', lowest first, as "4th of 35". */
function place(mine: number | null, others: (number | null)[]): string {
  if (mine === null) return '';
  const below = others.filter((o) => o !== null && o < mine).length;
  return ` · ${ordinal(below + 1)} of ${others.length + 1}`;
}

describe.skipIf(!FILE)('layout report (LAYOUT_REPORT_FILE)', () => {
  it('writes what a reviewer needs to know about each layout', async () => {
    const loader = nodeCorpusLoader(testCorporaRoot());
    const core = new AnalysisCore(loader);
    const corpora = await loader.list();
    const scores = new Map<string, LayoutSummary>();
    const score = async (layout: Layout, corpusId: string): Promise<LayoutSummary> => {
      const key = `${corpusId}:${layout.id}`;
      let summary = scores.get(key);
      if (!summary) {
        const settings = libraryRanking(corpusId);
        summary = summarize(await core.analyze({ layout: toCanonicalJson(layout), settings }));
        scores.set(key, summary);
      }
      return summary;
    };

    const lines = ['## Bundled layouts in this pull request', ''];
    if (IDS.length === 0) lines.push('No layout document was added or changed.');
    for (const id of IDS) {
      const layout = BUNDLED_LAYOUTS.find((l) => l.id === id);
      if (!layout) {
        lines.push(`### \`${id}\``, '', 'Not among the bundled layouts: see the checks above.', '');
        continue;
      }
      const texts = textsFor(layout, corpora);
      // It opens on what the Library ranks on, so the numbers there are the ones below.
      const ranking = parseParams({ corpus: texts[0].id }, texts[0].id);
      const link = `${APP}/analyze?${new URLSearchParams(
        selectionSearch(ranking) as Record<string, string>,
      )}#${new URLSearchParams({ layout: inlineRef(await encodeInline(layout)) })}`;
      const others = BUNDLED_LAYOUTS.filter((l) => l.id !== id);
      lines.push(
        `### ${layout.name} (\`${id}\`), by ${layout.author}`,
        '',
        layout.description ?? '',
        '',
        `- ${board(layout)}; ${layout.layers.length} layer${layout.layers.length === 1 ? '' : 's'}` +
          `${layout.combos?.length ? `, ${layout.combos.length} combos` : ''}; ` +
          `languages: ${layout.languages?.join(', ') || 'none given'}`,
        `- [Open it in LayerBench](${link}), as it would be bundled`,
        '',
        '| Text | Effort | SFB | Skips |',
        '|---|---|---|---|',
      );
      for (const text of texts) {
        const mine = await score(layout, text.id);
        const theirs = await Promise.all(others.map((o) => score(o, text.id)));
        const skips = mine.missing.length
          ? `${mine.skipped.toFixed(2)}%: ${mine.missing.slice(0, 8).join(' ')}`
          : 'nothing';
        lines.push(
          `| ${text.name} | ${formatValue(mine.effort, 'effort')}${place(
            mine.effort,
            theirs.map((t) => t.effort),
          )} | ${formatValue(mine.sfb, 'percent')}${place(
            mine.sfb,
            theirs.map((t) => t.sfb),
          )} | ${skips} |`,
        );
      }
      lines.push(
        '',
        `Places are among the ${others.length + 1} bundled layouts, lowest first, scored as the ` +
          'Library scores them: the Layouts Doc rules, letters only, on 100,000 symbols.',
        '',
      );
    }
    writeFileSync(FILE, `${lines.join('\n')}\n`);
  }, 900_000);
});
