import { type Bands, classifyBand, cyanophage, humanBand, layoutsDoc } from '@layerbench/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { guidePage } from './pages.js';

let analyzing = '';
let metrics = '';

beforeAll(async () => {
  analyzing = await guidePage('analyzing')!.load();
  metrics = await guidePage('metrics')!.load();
});

/** The text of one `###` section of the guide, up to the next heading. */
function section(heading: string): string {
  const start = analyzing.indexOf(`### ${heading}\n`);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const next = analyzing.slice(start + 4).search(/\n#{2,3} /);
  return analyzing.slice(start, next < 0 ? undefined : start + 4 + next);
}

interface Step {
  name: string;
  /** The bound the row gives, or the last bound for the open step above it. */
  bound: number;
  colour: string;
}

/** The steps of every ruler table in a piece of the guide, in order: name, bound, colour. */
function tables(text: string): Step[][] {
  const rulers: Step[][] = [];
  for (const line of text.split('\n')) {
    const m = /^\| ([a-z ]+) \| (?:above )?([\d.]+) \| (green|amber|red) \|$/.exec(line);
    if (!m) continue;
    if (m[1] === 'min') rulers.push([]);
    rulers[rulers.length - 1].push({ name: m[1], bound: Number(m[2]), colour: m[3] });
  }
  return rulers;
}

const COLOURS = { good: 'green', ok: 'amber', bad: 'red' } as const;

/** What the engine says of a ruler, step by step: the name and colour each bound's value gets. */
function expected(bands: Bands): Step[] {
  const { bounds } = bands;
  return [...bounds, bounds.at(-1)! + 1].map((value, i) => {
    const band = classifyBand(value, bands);
    return {
      name: humanBand(band.label),
      bound: bounds[Math.min(i, bounds.length - 1)],
      colour: COLOURS[band.quality as keyof typeof COLOURS],
    };
  });
}

const ruleBands = (set: ReturnType<typeof layoutsDoc>, id: string): Bands =>
  set.rules.find((r) => r.id === id)!.bands!;

describe('the guide’s rulers', () => {
  it('draw the Layouts Doc rule set’s SFB and Effort as the set carries them', () => {
    const [sfb, effort, ...rest] = tables(section('The Layouts Doc rule set'));
    expect(rest).toEqual([]);
    expect(sfb).toEqual(expected(ruleBands(layoutsDoc(), 'sfb')));
    expect(effort).toEqual(expected(ruleBands(layoutsDoc(), 'effort')));
  });

  it('draw the cyanophage-like rule set’s SFB as the set carries it, and no Effort of his', () => {
    const [sfb, ...rest] = tables(section('The cyanophage-like rule set'));
    expect(rest).toEqual([]);
    expect(sfb).toEqual(expected(ruleBands(cyanophage(), 'sfb')));
    // Effort has no ruler of his: the set's is the Layouts Doc's, which the guide says in words.
    expect(ruleBands(cyanophage(), 'effort')).toEqual(ruleBands(layoutsDoc(), 'effort'));
  });

  it('are the numbers the glossary gives, row by row', () => {
    // The glossary's table and its Effort rule row write the same bounds as the presets carry.
    const dot = (b: Bands) => b.bounds.join(' · ');
    expect(metrics).toContain(
      `| SFB | lower is better | ${dot(ruleBands(layoutsDoc(), 'sfb'))}; cyanophage-like: ${dot(ruleBands(cyanophage(), 'sfb'))} |`,
    );
    expect(metrics).toContain(
      `| Effort | lower is better | ${dot(ruleBands(layoutsDoc(), 'effort'))} (effort) |`,
    );
    expect(metrics).toContain(`Bands ${dot(ruleBands(layoutsDoc(), 'effort'))}, from *min*`);
    // And the paragraph on Effort's bands, which lists them a third time: all three agree.
    const effort = dot(ruleBands(layoutsDoc(), 'effort'));
    expect(metrics.split(effort).length - 1, 'places the glossary writes Effort’s bounds').toBe(3);
  });

  it('colour nine steps in thirds, green then amber then red', () => {
    for (const ruler of tables(section('The Layouts Doc rule set'))) {
      expect(ruler.map((s) => s.colour)).toEqual([
        ...Array(3).fill('green'),
        ...Array(3).fill('amber'),
        ...Array(3).fill('red'),
      ]);
    }
  });
});
