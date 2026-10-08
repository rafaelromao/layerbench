import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { describe, it } from 'vitest';
import { toCanonicalJson } from '../layout/json.js';
import type { Layout } from '../layout/types.js';
import { type AnnealResult, anneal, polish, type Targets } from './anneal.js';
import { layoutText, toLayout } from './emit.js';
import { bundledScores, type EngineScore, placeAmong, scoreLayout } from './engine.js';
import { searchMagic } from './magic.js';
import { board3x5, CONFIGS, type Design, randomDesign, rng, type Score } from './model.js';
import { LETTERS, loadSample, type Sample, SYMBOLS } from './tables.js';

/**
 * Not a test: the generator. Like `pnpm goldens`, it runs through vitest because that is the
 * repository's TypeScript runner and resolves the served corpora the way the suite does.
 *
 *   pnpm generate                        # full: one-shot alpha layer, thumb letters, repeat key
 *   GENERATE_TRACK=thumb pnpm generate   # thumb: one layer, one thumb letter, repeat key, shift
 *   GENERATE_TRACK=flat pnpm generate    # flat: one layer of 30 keys, nothing else
 *
 * Every number written is the engine's, on the request the Library makes of a layout: English
 * news, the first 100,000 symbols, letters only, case folded, no space, cyanophage-like rules.
 * The full track asks for Effort and SFB under caps with the fewest layer taps; the other two
 * sweep SFB caps and minimize Effort under each, and report the Pareto front.
 *
 * Knobs, all optional: GENERATE_SEEDS (runs per setting, 3), GENERATE_ITERS (annealing steps per
 * run, 3000000), GENERATE_CONFIGS (thumb arrangements: `c1,c2,c3,c4`, `c5`, `flat`),
 * GENERATE_WEIGHTS (full track: weights on one-shot taps, `10,30,100`), GENERATE_SFB_CAP (full:
 * 0.29; the others: the list of caps), GENERATE_EFFORT_CAP (full: 295), GENERATE_MAGIC (`1` tries
 * magic keys on the best designs), GENERATE_OUT (the folder, `generated/` at the repository
 * root), APP_ORIGIN (where the links open).
 */

type Track = 'full' | 'thumb' | 'flat';

const RUN = process.env.GENERATE === '1';
const TRACK: Track =
  process.env.GENERATE_TRACK === 'flat'
    ? 'flat'
    : process.env.GENERATE_TRACK === 'thumb'
      ? 'thumb'
      : 'full';
const SEEDS = Number(process.env.GENERATE_SEEDS ?? 3);
const ITERS = Number(process.env.GENERATE_ITERS ?? 3_000_000);
const MAGIC = process.env.GENERATE_MAGIC === '1';
const APP = process.env.APP_ORIGIN || 'https://layerbench.github.io';
const OUT =
  process.env.GENERATE_OUT ?? fileURLToPath(new URL('../../../../generated', import.meta.url));

/** The targets the generator was asked for. */
const EFFORT_TARGET = 300;
const SFB_TARGET = 0.3;

const TRACKS: Record<
  Track,
  { title: string; configs: string; caps: string; weights: string; symbols: readonly string[] }
> = {
  full: {
    title: 'one-shot alpha layer',
    configs: 'c1,c2,c3,c4',
    caps: '0.29',
    weights: '10,30,100',
    symbols: SYMBOLS,
  },
  thumb: {
    title: 'one thumb letter, repeat key and one-shot shift',
    configs: 'c5',
    caps: '0.30,0.35,0.40,0.45,0.50',
    weights: '0',
    symbols: [...LETTERS, ',', '.', "'", '-'],
  },
  flat: {
    title: 'flat 30 keys',
    configs: 'flat',
    caps: '0.40,0.45,0.50,0.55,0.60,0.70',
    weights: '0',
    symbols: [...LETTERS, ',', '.', "'", '-'],
  },
};

function list(env: string | undefined, fallback: string): string[] {
  return (env ?? fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

interface Candidate {
  label: string;
  config: string;
  weight: number;
  seed: number;
  cap: number;
  design: Design;
  exact: Score;
  layout: Layout;
  engine: EngineScore;
  magic?: string;
}

function blob(layout: Layout): string {
  const encoded = JSON.stringify(toCanonicalJson(layout));
  return deflateSync(Buffer.from(encoded, 'utf8')).toString('base64url');
}

function link(layout: Layout, corpusId: string): string {
  const query = new URLSearchParams({ layout: `inline:${blob(layout)}` });
  return `${APP}/analyze?corpus=${corpusId}&rules=cyanophage#${query}`;
}

function fmt(n: number, digits = 2): string {
  return Number.isFinite(n) ? n.toFixed(digits) : '–';
}

function meetsTargets(e: EngineScore): boolean {
  return e.effort < EFFORT_TARGET && e.sfb < SFB_TARGET;
}

/** No other candidate is at least as good on every count and better on one. */
function paretoFront(all: Candidate[]): Candidate[] {
  const key = (c: Candidate) => [c.engine.effort, c.engine.sfb, c.engine.tapsPer100];
  return all.filter((c) => {
    const mine = key(c);
    return !all.some((o) => {
      if (o === c) return false;
      const theirs = key(o);
      return theirs.every((v, i) => v <= mine[i]) && theirs.some((v, i) => v < mine[i]);
    });
  });
}

function describeCandidate(c: Candidate, sample: Sample): string {
  const settings =
    `${sample.corpusId}, ${sample.maxSymbols.toLocaleString('en-US')} symbols, letters only, ` +
    'case folded, no space, cyanophage-like rules';
  return (
    `${c.layout.name}: ${CONFIGS[c.config]?.description ?? c.config}. ` +
    `Generated by LayerBench's annealer for Effort < ${EFFORT_TARGET} and SFB < ${SFB_TARGET}% ` +
    `on ${settings}` +
    (c.magic ? `; ${c.magic}` : '') +
    '.'
  );
}

describe.skipIf(!RUN)('generate (GENERATE=1)', () => {
  it(
    `searches the ${TRACK} track and writes the results`,
    async () => {
      const board = board3x5();
      const track = TRACKS[TRACK];
      const full = TRACK === 'full';
      const sample = await loadSample({ symbols: track.symbols });
      const t0 = Date.now();
      const log = (line: string): void => {
        console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${line}`);
      };
      log(`sample: ${sample.chars} characters, ${sample.words} words, ${sample.spaces} spaces`);

      const configs = list(process.env.GENERATE_CONFIGS, track.configs);
      const weights = list(process.env.GENERATE_WEIGHTS, track.weights).map(Number);
      const caps = list(process.env.GENERATE_SFB_CAP, track.caps).map(Number);
      const effortCap = full ? Number(process.env.GENERATE_EFFORT_CAP ?? 295) : Infinity;

      const candidates: Candidate[] = [];
      let n = 0;
      for (const cap of caps) {
        for (const configId of configs) {
          const config = CONFIGS[configId];
          if (!config) throw new Error(`Unknown config ${configId}`);
          for (const weight of weights) {
            for (let seed = 1; seed <= SEEDS; seed++) {
              const targets: Targets = {
                sfbCap: cap,
                effortCap,
                effortWeight: full ? 0.2 : 1,
                tapsWeight: weight,
              };
              const start = randomDesign(board, config, track.symbols.length, rng(seed * 7919 + n));
              const result: AnnealResult = anneal(sample, start, {
                ...targets,
                iterations: ITERS,
                seed: seed * 104729 + n,
              });
              const polished = polish(sample, result.design, targets);
              n++;
              const label = full
                ? `${configId}-w${weight}-${seed}`
                : `${configId}-${fmt(cap)}-${seed}`;
              const layout = toLayout(polished.design, sample, { name: label });
              const engine = scoreLayout(layout, sample);
              candidates.push({
                label,
                config: configId,
                weight,
                seed,
                cap,
                design: polished.design,
                exact: polished.score,
                layout,
                engine,
              });
              const drift =
                Math.abs(engine.effort - polished.score.effort) > 1e-6 ||
                Math.abs(engine.sfb - polished.score.sfb) > 1e-6
                  ? ` (exact pass said ${fmt(polished.score.effort)} / ${fmt(polished.score.sfb, 3)}%)`
                  : '';
              log(
                `${label}: Effort ${fmt(engine.effort)} SFB ${fmt(engine.sfb, 3)}% taps/100 ` +
                  `${fmt(engine.tapsPer100)}${result.feasible ? '' : ' (caps not met)'}${drift}`,
              );
            }
          }
        }
      }

      const byTaps = (a: Candidate, b: Candidate): number =>
        a.engine.tapsPer100 - b.engine.tapsPer100 || a.engine.effort - b.engine.effort;
      const byEffort = (a: Candidate, b: Candidate): number => a.engine.effort - b.engine.effort;

      let chosen: Candidate[];
      if (full) {
        const ok = candidates.filter((c) => meetsTargets(c.engine) && c.engine.sfb <= c.cap);
        chosen = [];
        const take = (c: Candidate | undefined): void => {
          if (c && !chosen.includes(c)) chosen.push(c);
        };
        take([...ok].sort(byTaps)[0]);
        take([...ok].sort(byEffort)[0]);
        take([...ok].sort((a, b) => a.engine.sfb - b.engine.sfb)[0]);
        for (const c of [...ok].sort(byTaps).slice(1, 4)) take(c);
        if (chosen.length === 0) {
          log('no run met both targets; keeping the Pareto front');
          chosen = paretoFront(candidates).sort(byEffort);
        }
      } else {
        chosen = paretoFront(candidates).sort((a, b) => a.engine.sfb - b.engine.sfb);
      }

      if (MAGIC) {
        // The full track's best design; on the others, every point of the front, a few at most.
        const hosts = full ? chosen.slice(0, 1) : [...chosen].sort(byEffort).slice(0, 6);
        const added: Candidate[] = [];
        for (const best of hosts) {
          log(`magic keys on ${best.label}…`);
          const found = searchMagic(best.layout, sample, {
            effortCap: Math.max(EFFORT_TARGET, best.engine.effort + 1),
            log,
          });
          if (!found) continue;
          const layout = { ...found.layout, name: `${best.label}-magic` };
          added.push({
            ...best,
            label: layout.name,
            layout,
            engine: scoreLayout(layout, sample),
            magic: found.description,
          });
        }
        chosen = [...added, ...chosen];
      }

      mkdirSync(OUT, { recursive: true });
      const bundled = bundledScores(sample);
      const efforts = [...bundled.values()].map((s) => s.effort);
      const sfbs = [...bundled.values()].map((s) => s.sfb);
      const lines: string[] = [
        `# Generated layouts: ${track.title}`,
        '',
        `Scored by LayerBench's engine on ${sample.corpusId}, the first ` +
          `${sample.maxSymbols.toLocaleString('en-US')} symbols, letters only, case folded, no ` +
          'space, cyanophage-like rules: the request the Library makes. Places are among the ' +
          `${bundled.size} bundled layouts, lowest first. "Targets" is Effort < ${EFFORT_TARGET} ` +
          `and SFB < ${SFB_TARGET}%.`,
        '',
        '| Layout | Effort | SFB | SFS | Layer taps / 100 | Extra keystrokes | Skips | Targets |',
        '|---|---|---|---|---|---|---|---|',
      ];
      for (const c of chosen) {
        const e = c.engine;
        lines.push(
          `| ${c.label} | ${fmt(e.effort)} (${placeAmong(e.effort, efforts)}) | ` +
            `${fmt(e.sfb, 3)}% (${placeAmong(e.sfb, sfbs)}) | ${fmt(e.sfs)}% | ` +
            `${fmt(e.tapsPer100)} | ${fmt(e.extraKeystrokes, 3)} | ` +
            `${e.missing.length ? `${fmt(e.skipped)}%: ${e.missing.slice(0, 6).join(' ')}` : 'nothing'} | ` +
            `${meetsTargets(e) ? 'met' : 'not met'} |`,
        );
      }
      lines.push(
        '',
        '## Every run',
        '',
        '| Run | Effort | SFB | Layer taps / 100 | Its cap | Targets |',
        '|---|---|---|---|---|---|',
      );
      for (const c of candidates) {
        lines.push(
          `| ${c.label} | ${fmt(c.engine.effort)} | ${fmt(c.engine.sfb, 3)}% | ` +
            `${fmt(c.engine.tapsPer100)} | ${c.engine.sfb <= c.cap ? 'under' : 'over'} | ` +
            `${meetsTargets(c.engine) ? 'met' : 'not met'} |`,
        );
      }
      for (const c of chosen) {
        const name = c.label;
        const layout: Layout = { ...c.layout, id: name, description: describeCandidate(c, sample) };
        writeFileSync(join(OUT, `${name}.json`), `${JSON.stringify(toCanonicalJson(layout))}\n`);
        lines.push(
          '',
          `## ${name}`,
          '',
          layout.description ?? '',
          '',
          '```',
          layoutText(layout, c.design),
          '```',
          '',
          `- File: \`generated/${name}.json\` (paste it in Library → Import)`,
          `- [Open in LayerBench](${link(layout, sample.corpusId)})`,
        );
      }
      writeFileSync(join(OUT, `report-${TRACK}.md`), `${lines.join('\n')}\n`);
      log(`wrote ${chosen.length} layouts and report-${TRACK}.md to ${OUT}`);
    },
    6 * 3_600_000,
  );
});
