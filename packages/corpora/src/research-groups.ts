/**
 * Measures how other groups of programming languages compare with the corpora, for
 * `docs/research/code-corpora.md`: for each group a sample of its code from the repositories of
 * `raw/code-sources.json` (`research`), read as the corpora are, its symbol and digit profile, how
 * far that is from each corpus (Jensen-Shannon divergence), and how the bundled layouts rank on it.
 * Nothing of the samples is written: only the numbers, to `docs/research/code-groups.json`.
 *
 *   pnpm corpora:fetch research     # the repositories, once (network)
 *   pnpm corpora:research           # the measurements
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AnalysisSettings,
  analysisRun,
  analyze,
  BUNDLED_LAYOUTS,
  CODE_TAG,
  type Corpus,
  DEFAULT_SETTINGS,
  getPreset,
  normalizeText,
} from '@layerbench/core';
import { allocate, CODE_LANGUAGES, lineCost, stripWith, takeLines } from '@layerbench/core/prepare';
import {
  type ArchiveRepo,
  type Candidate,
  type Reading,
  type RepoRead,
  readArchive,
  settle,
} from './archive.js';
import { RAW_DIR, readCodeSources } from './code-sources.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..', '..');
const SERVED = join(ROOT, 'apps', 'web', 'public', 'corpora');
const OUT = join(ROOT, 'docs', 'research', 'code-groups.json');

/** What the three corpora are called here. */
const REFERENCES = ['code-c-family', 'code-python-family', 'en-markdown-agents'] as const;
const SAMPLE = 100_000;
const SETTINGS: Omit<AnalysisSettings, 'corpus'> = {
  ...DEFAULT_SETTINGS,
  rules: getPreset('layouts_doc'),
  caseMode: 'model',
  textClass: 'letters+digits+symbols',
  sample: SAMPLE,
};

const PUNCTUATION = [...'!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'];
const DIGITS = [...'0123456789'];

interface Profile {
  /** Characters counted, spaces not. */
  characters: number;
  /** Shares of those that are digits, punctuation and capitals, in percent. */
  digits: number;
  symbols: number;
  capitals: number;
  /** The ten most frequent symbols, with their shares of the characters, in percent. */
  top: [string, number][];
  /** The share of each digit among the digits, in percent. */
  digitShares: number[];
  /** Per symbol and digit, its share of the symbols and digits together: what is compared. */
  vector: number[];
}

function profileOf(stream: string): Profile {
  const counts = new Map<string, number>();
  let characters = 0;
  let capitals = 0;
  for (const ch of stream) {
    if (ch === ' ') continue;
    characters++;
    if (/\p{Lu}/u.test(ch)) capitals++;
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  const of = (chars: string[]) => chars.map((c) => counts.get(c) ?? 0);
  const marks = of(PUNCTUATION);
  const digits = of(DIGITS);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const nonLetters = sum(marks) + sum(digits);
  return {
    characters,
    digits: (sum(digits) / characters) * 100,
    symbols: (sum(marks) / characters) * 100,
    capitals: (capitals / characters) * 100,
    top: PUNCTUATION.map((c, i) => [c, (marks[i] / characters) * 100] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
    digitShares: digits.map((n) => (n / Math.max(1, sum(digits))) * 100),
    vector: [...marks, ...digits].map((n) => n / Math.max(1, nonLetters)),
  };
}

/** Jensen-Shannon divergence in bits: 0 for the same profile, 1 for profiles with nothing shared. */
function jsd(p: number[], q: number[]): number {
  let total = 0;
  for (let i = 0; i < p.length; i++) {
    const m = (p[i] + q[i]) / 2;
    if (p[i] > 0) total += 0.5 * p[i] * Math.log2(p[i] / m);
    if (q[i] > 0) total += 0.5 * q[i] * Math.log2(q[i] / m);
  }
  return total;
}

/** Ranks, the lowest value first, equal values sharing the mean of their places. */
function ranks(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(values.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    for (let k = i; k <= j; k++) out[order[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return out;
}

/** Spearman's rank correlation of two lists of values. */
function spearman(a: number[], b: number[]): number {
  const ra = ranks(a);
  const rb = ranks(b);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const [ma, mb] = [mean(ra), mean(rb)];
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}

interface Text {
  id: string;
  name: string;
  lines: string[];
  repos: string[];
}

/** The text of a corpus as it is committed, one line each. */
function referenceText(id: string): Text {
  const lines = readFileSync(join(RAW_DIR, `${id}.txt`), 'utf8')
    .split('\n')
    .slice(0, -1);
  return { id, name: id, lines, repos: [] };
}

/** A sample of a text's projects, each giving an equal part, in the order of a hash. */
async function sampleOf<R extends ArchiveRepo>(
  name: string,
  repos: R[],
  readingOf: (repo: R) => Reading,
  errors: string[],
): Promise<Text> {
  const best = new Map<string, Candidate & { repo: string }>();
  const reads: RepoRead<R>[] = [];
  for (const repo of repos) {
    const read = await readArchive(repo, readingOf(repo), best);
    reads.push(read);
    if (read.licenseError) errors.push(read.licenseError);
  }
  settle(reads, best);
  const cost = (r: RepoRead<R>) => r.lines.reduce((t, l) => t + lineCost(l.text), 0);
  const share = allocate(
    readCodeSources().research.bytes,
    reads.map((r) => ({ key: r.repo.id, weight: 1, available: cost(r) })),
  );
  for (const r of reads) r.taken = takeLines(r.lines, share.get(r.repo.id) ?? 0);
  const lines = reads.flatMap((r) => r.taken);
  console.log(`${name}: ${lines.length} lines from ${reads.map((r) => r.repo.id).join(', ')}`);
  const used = reads.filter((r) => r.taken.length > 0).map((r) => r.repo.id);
  return { id: name, name, lines, repos: used };
}

/** The groups of the research note, each from its own projects. */
async function groupTexts(errors: string[]): Promise<Text[]> {
  const { research } = readCodeSources();
  const families = new Map<string, (typeof research.repos)[number][]>();
  for (const repo of research.repos) {
    const family = research.groups[repo.group].name;
    families.set(family, [...(families.get(family) ?? []), repo]);
  }
  const texts: Text[] = [];
  for (const [family, repos] of families) {
    texts.push(
      await sampleOf(
        family,
        repos,
        (repo) => {
          const lexicon = research.groups[repo.group].lexicon;
          return {
            kind: 'code',
            extensions: lexicon.extensions,
            keepFixtures: repo.keepFixtures,
            lines: (text) => stripWith(text, lexicon).split('\n'),
          };
        },
        errors,
      ),
    );
  }
  return texts;
}

/** Each language of the two code corpora on its own, to see whether it belongs with the others. */
async function memberTexts(errors: string[]): Promise<Text[]> {
  const { corpora, repos } = readCodeSources();
  const texts: Text[] = [];
  for (const [id, plan] of Object.entries(corpora)) {
    if (plan.kind !== 'code') continue;
    for (const language of Object.keys(plan.shares ?? {})) {
      const members = repos.filter((r) => r.corpus === id && r.language === language);
      const lexicon = CODE_LANGUAGES[language as keyof typeof CODE_LANGUAGES];
      texts.push(
        await sampleOf(
          `${language} (${id})`,
          members,
          (repo) => ({
            kind: 'code',
            extensions: repo.extensions ?? lexicon.extensions,
            lines: (text) => stripWith(text, lexicon).split('\n'),
          }),
          errors,
        ),
      );
    }
  }
  return texts;
}

function corpusOf(text: Text): { corpus: Corpus; stream: string } {
  const sample = normalizeText(text.lines.join(' '), {
    caseMode: 'model',
    textClass: 'letters+digits+symbols',
  });
  const corpus: Corpus = {
    id: `research-${text.id}`,
    name: text.name,
    language: CODE_TAG,
    sample,
    symbols: [...sample].length,
    words: sample.split(' ').length,
    custom: true,
  };
  const settings = { ...SETTINGS, corpus: corpus.id };
  return { corpus, stream: analysisRun(settings, corpus).stream };
}

/** Effort and the share of the text skipped, for every bundled layout, in the order they are listed. */
function efforts(
  text: Text,
  caseMode: 'model' | 'fold' = 'model',
): { effort: number[]; skipped: number[] } {
  const { corpus } = corpusOf(text);
  const { options, stream } = analysisRun({ ...SETTINGS, caseMode, corpus: corpus.id }, corpus);
  const effort: number[] = [];
  const skipped: number[] = [];
  for (const layout of BUNDLED_LAYOUTS) {
    const report = analyze(layout, stream, options);
    effort.push(Number(report.results.find((r) => r.id === 'effort')?.value));
    const left = [...report.coverage.unproducible.values()].reduce((a, b) => a + b, 0);
    skipped.push((left / (report.stats.symbols + left)) * 100);
  }
  return { effort, skipped };
}

async function main(): Promise<void> {
  const references = REFERENCES.map(referenceText);
  const news = readFileSync(join(SERVED, 'en-general', 'sample.txt'), 'utf8');
  const baseline: Text = { id: 'en-general', name: 'English news', lines: [news], repos: [] };
  const errors: string[] = [];
  const groups = await groupTexts(errors);
  const members = await memberTexts(errors);
  if (errors.length > 0)
    throw new Error(`Not under the licence they say:\n${[...new Set(errors)].join('\n')}`);

  const measured = [...references, baseline, ...groups, ...members].map((text) => {
    const stream = corpusOf(text).stream;
    const { effort, skipped } = efforts(text);
    const folded = efforts(text, 'fold').effort;
    console.log(`${text.id}: measured`);
    return { text, profile: profileOf(stream), effort, skipped, folded };
  });

  const byId = new Map(measured.map((m) => [m.text.id, m]));
  const round = (n: number, digits = 3) => Number(n.toFixed(digits));
  const rows = measured.map((m) => ({
    id: m.text.id,
    repos: m.text.repos,
    lines: m.text.lines.length,
    bytes: m.text.lines.reduce((t, l) => t + lineCost(l), 0),
    characters: m.profile.characters,
    digits: round(m.profile.digits, 2),
    symbols: round(m.profile.symbols, 2),
    capitals: round(m.profile.capitals, 2),
    top: m.profile.top.map(([c, s]) => [c, round(s, 2)]),
    digitShares: m.profile.digitShares.map((s) => round(s, 1)),
    divergence: Object.fromEntries(
      REFERENCES.map((r) => [r, round(jsd(m.profile.vector, byId.get(r)?.profile.vector ?? []))]),
    ),
    rank: Object.fromEntries(
      REFERENCES.map((r) => [r, round(spearman(m.effort, byId.get(r)?.effort ?? []))]),
    ),
    // The same, with capitals counted as lower case (the analysis's default case mode).
    rankFold: Object.fromEntries(
      REFERENCES.map((r) => [r, round(spearman(m.folded, byId.get(r)?.folded ?? []))]),
    ),
    effort: round(m.effort.reduce((a, b) => a + b, 0) / m.effort.length, 1),
    skipped: round(m.skipped.reduce((a, b) => a + b, 0) / m.skipped.length, 2),
  }));
  const layouts = BUNDLED_LAYOUTS.map((l) => l.id ?? l.name);
  const efforts_ = Object.fromEntries(
    measured.map((m) => [m.text.id, m.effort.map((e) => round(e, 1))]),
  );
  writeFileSync(OUT, `${JSON.stringify({ layouts, rows, efforts: efforts_ }, null, 2)}\n`);
  console.log(`wrote ${OUT}`);
}

main();
