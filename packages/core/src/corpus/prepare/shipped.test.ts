import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { corporaRoot } from '../../golden/paths.js';
import { CODE_TAG } from '../../lang/profiles.js';
import { corpusStream } from '../corpus.js';
import { nodeCorpusLoader } from '../node-loader.js';
import { isCodeLanguage } from './languages.js';
import { MAX_LINE, REJECTS, rejectReason, type TextKind, tidy } from './lines.js';
import { lineCost } from './select.js';

/**
 * The code and Markdown corpora as they are committed: what `pnpm corpora:extract` wrote and what
 * `pnpm corpora` built from it. The extractor judges every line as it goes; these hold what is in
 * the repository to the same judgement, so a filter that grows stricter than the text, or a text
 * edited by hand, fails here before it ships.
 */

const RAW = fileURLToPath(new URL('../../../../corpora/raw/', import.meta.url));
const SOURCES = JSON.parse(readFileSync(`${RAW}code-sources.json`, 'utf8')) as {
  corpora: Record<string, { kind: TextKind; bytes: number; shares?: Record<string, number> }>;
};

const rawLines = (id: string): string[] =>
  readFileSync(`${RAW}${id}.txt`, 'utf8').split('\n').slice(0, -1);

describe.each(Object.entries(SOURCES.corpora))('the raw text of %s', (id, plan) => {
  const lines = rawLines(id);

  it('holds no line the filters would turn away, and each line as it was tidied', () => {
    const bad = lines.filter((line) => tidy(line) !== line || rejectReason(line, plan.kind));
    expect(bad.slice(0, 3)).toEqual([]);
    expect(lines.every((line) => line.length <= MAX_LINE[plan.kind])).toBe(true);
  });

  it('fits the sample it is built into, and nearly fills it', () => {
    const bytes = lines.reduce((total, line) => total + lineCost(line), 0);
    expect(bytes).toBeLessThanOrEqual(plan.bytes + 1);
    expect(bytes).toBeGreaterThan(plan.bytes * 0.99);
  });

  it('names its languages by ones it can strip comments from, in shares that add to a whole', () => {
    if (plan.kind === 'markdown') return;
    const shares = Object.entries(plan.shares ?? {});
    expect(shares.every(([language]) => isCodeLanguage(language))).toBe(true);
    expect(shares.reduce((total, [, share]) => total + share, 0)).toBe(100);
  });
});

describe('the served samples of the code and Markdown corpora', () => {
  const loader = nodeCorpusLoader(corporaRoot());

  it('hold no address, key, long hash or person-shaped contact, and no control character', async () => {
    for (const id of Object.keys(SOURCES.corpora)) {
      const { sample } = await loader.load(id);
      // Not `toMatch`: a failure would print the whole sample.
      // ASCII, and for Markdown the few signs the build keeps beyond it (`°`, `€`).
      const outside = id === 'en-markdown-agents' ? /[^\x20-\x7e°€£§ºª]/ : /[^\x20-\x7e]/;
      expect(sample.match(outside)?.[0], `${id}: a character outside ASCII`).toBeUndefined();
      for (const reason of ['email', 'address', 'hex', 'secret', 'authorship']) {
        expect(REJECTS[reason].test(sample), `${id}: ${reason}`).toBe(false);
      }
    }
  });

  it('are what they are named for, in the symbols they hold', async () => {
    const shares = async (id: string) => {
      const c = await loader.load(id);
      const stream = corpusStream(c, 'model', 'letters+digits+symbols');
      const counts = new Map<string, number>();
      for (const ch of stream) counts.set(ch, (counts.get(ch) ?? 0) + 1);
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      return (ch: string) => (counts.get(ch) ?? 0) / total;
    };
    const braces = await shares('code-c-family');
    const indent = await shares('code-python-family');
    const markdown = await shares('en-markdown-agents');
    const news = await shares('en-general');

    // Braces and semicolons, which news hardly has, against colons and no semicolons.
    expect(braces('{')).toBeGreaterThan(0.005);
    expect(braces(';')).toBeGreaterThan(0.01);
    expect(braces(';')).toBeGreaterThan(10 * indent(';'));
    expect(indent(':')).toBeGreaterThan(0.01);
    expect(indent(':')).toBeGreaterThan(braces(':'));
    expect(indent('_')).toBeGreaterThan(1.5 * braces('_'));
    for (const ch of ['(', ')', '=', '[', ']']) {
      expect(braces(ch), ch).toBeGreaterThan(10 * news(ch));
      expect(indent(ch), ch).toBeGreaterThan(10 * news(ch));
    }
    // Markdown: headings, emphasis, inline code, list markers and links.
    for (const ch of ['#', '*', '`', '[', ']', '-']) {
      expect(markdown(ch), ch).toBeGreaterThan(3 * news(ch));
    }
  });

  it('are listed with the tag they are served under', async () => {
    const list = await loader.list();
    const by = (id: string) => list.find((m) => m.id === id);
    expect(by('code-c-family')?.language).toBe(CODE_TAG);
    expect(by('code-python-family')?.language).toBe(CODE_TAG);
    expect(by('en-markdown-agents')?.language).toBe('en');
  });
});
