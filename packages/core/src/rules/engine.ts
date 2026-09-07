import type { Finger, Hand } from '../geometry/types.js';
import { fingerHand } from '../geometry/types.js';
import type { CompiledLayout } from '../layout/compile.js';
import type { SimulationTables } from '../tables/tables.js';
import { unpackBigram, unpackTrigram } from '../tables/tables.js';
import { type Attrs, adjacentFingerPair, attrDistance, buildAttrs } from './attrs.js';
import { classifyBand } from './bands.js';
import { defaultEffort, keyEffort } from './effort.js';
import { compilePredicate, type Ngram, type PredicateContext } from './predicates.js';
import {
  type Aggregate,
  DEFAULT_GLOBALS,
  type Globals,
  type Rule,
  type RuleItem,
  type RuleResult,
  type RuleSet,
  type Score,
  type Unit,
  type WeightSpec,
} from './types.js';

interface Ctx extends PredicateContext {
  sim: SimulationTables;
  compiled: CompiledLayout;
  attrs: Attrs[];
  tables: SimulationTables['noSpace'];
}

/** Percentage, with the reference's convention that an empty denominator yields 0. */
function pct(m: number, t: number): number {
  return t <= 0 ? 0 : (m / t) * 100;
}

function ratio(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

function spread(map: Map<string | number, number>): number | null {
  if (map.size === 0) return null;
  const values = [...map.values()];
  return Math.max(...values) - Math.min(...values);
}

/** Turn counts into percentages of `total`, falling back to the map's own sum. */
function distribute<K extends string | number>(map: Map<K, number>, total: number): Map<K, number> {
  if (map.size === 0) return new Map();
  let sum = total;
  if (!(sum > 0)) {
    sum = 0;
    for (const v of map.values()) sum += v;
  }
  if (!(sum > 0)) return map;
  const out = new Map<K, number>();
  for (const [k, v] of map) out.set(k, (v / sum) * 100);
  return out;
}

function toRecord<K extends string | number, V>(map: Map<K, V>): Record<string, V> {
  const out: Record<string, V> = {};
  for (const [k, v] of map) out[String(k)] = v;
  return out;
}

function bump<K>(map: Map<K, number>, key: K, by: number): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

/** Weight of an n-gram: adjacent and non-adjacent finger pairs can be weighted differently. */
function weightOf(spec: WeightSpec | null | undefined, ngram: Ngram): number {
  if (!spec) return 1;
  if (ngram.length >= 2) {
    const [a, b] = ngram;
    if (spec.adjacent_fingers !== undefined && adjacentFingerPair(a, b))
      return spec.adjacent_fingers;
    if (spec.non_adjacent_fingers !== undefined && !adjacentFingerPair(a, b)) {
      return spec.non_adjacent_fingers;
    }
  }
  return spec.default ?? 1;
}

/** Bigrams measure the pair; trigrams measure first to last. */
function pairDistance(ngram: Ngram, model: Globals['distance_model']): number | null {
  if (ngram.length === 2) return attrDistance(ngram[0], ngram[1], model);
  if (ngram.length === 3) return attrDistance(ngram[0], ngram[2], model);
  return null;
}

function per100(m: number, stats: SimulationTables['stats'], per?: string): number {
  const denom =
    per === 'keystrokes' ? stats.keystrokes : per === 'words' ? stats.words : stats.symbols;
  return denom > 0 ? (m / denom) * 100 : 0;
}

interface Extra {
  unit?: Unit;
  items?: RuleItem[];
  per_key?: Record<number, number>;
  per_finger?: Partial<Record<Finger, number>>;
  per_hand?: Partial<Record<Hand, number>>;
  breakdown?: Record<string, number>;
}

function finish(rule: Rule, value: number | null, extra: Extra): RuleResult {
  return {
    id: rule.id,
    label: rule.label ?? rule.id,
    family: rule.family ?? 'other',
    value,
    unit: extra.unit ?? 'percent',
    band: classifyBand(value, rule.bands),
    items: extra.items ?? [],
    per_finger: extra.per_finger ?? {},
    per_key: extra.per_key ?? {},
    per_hand: extra.per_hand ?? {},
    breakdown: extra.breakdown ?? {},
    note: rule.description ?? null,
    enabled: true,
    score_weight: rule.score?.weight ?? 0,
    normalized: null,
  };
}

// ------------------------------------------------------------------- n-grams

function evalNgram(rule: Rule, ctx: Ctx): RuleResult {
  const spec = rule.ngram ?? { n: 2 as const, skip: 0 };
  const n = spec.n ?? 2;
  const skip = spec.skip ?? 0;
  const t = ctx.tables;

  const sources: [Map<number, number>, number, number][] = [];
  if (n === 1) sources.push([t.unigram, t.totals.unigram, 1]);
  else if (n === 3) sources.push([t.trigram, t.totals.trigram, 1]);
  else if (Array.isArray(skip)) {
    for (const k of skip) {
      sources.push([t.skip[k - 1], t.totals.skip[k - 1], ctx.globals.skip_weights[k - 1] ?? 0]);
    }
  } else if (skip > 0) sources.push([t.skip[skip - 1], t.totals.skip[skip - 1], 1]);
  else sources.push([t.bigram, t.totals.bigram, 1]);

  const match = compilePredicate(rule.where, ctx);
  const aggregate: Aggregate = rule.aggregate ?? 'percent_of_ngrams';
  const model = ctx.globals.distance_model;
  const breakdownBy = rule.breakdown_by;

  let matched = 0;
  let total = 0;
  let weightedDistance = 0;
  const items: { ngram: Ngram; c: number; d: number | null }[] = [];
  const perKey = new Map<number, number>();
  const perFinger = new Map<Finger, number>();
  const perHand = new Map<Hand, number>();
  const breakdown = new Map<string | number, number>();
  const ngram: Attrs[] = new Array(n);

  for (const [table, tot, skipW] of sources) {
    total += tot * skipW;
    for (const [key, count] of table) {
      if (n === 1) ngram[0] = ctx.attrs[key];
      else if (n === 2) {
        const [a, b] = unpackBigram(key);
        ngram[0] = ctx.attrs[a];
        ngram[1] = ctx.attrs[b];
      } else {
        const [a, b, c] = unpackTrigram(key);
        ngram[0] = ctx.attrs[a];
        ngram[1] = ctx.attrs[b];
        ngram[2] = ctx.attrs[c];
      }
      if (!match(ngram)) continue;

      const c = count * weightOf(rule.weight, ngram) * skipW;
      const d = pairDistance(ngram, model);
      matched += c;
      weightedDistance += c * (d ?? 0);
      items.push({ ngram: [...ngram], c, d });

      const share = c / ngram.length;
      for (const k of ngram) for (const m of k.members) bump(perKey, m, share);

      const last = ngram[ngram.length - 1];
      if (last.fingers.length > 0) {
        const fShare = c / last.fingers.length;
        for (const f of last.fingers) bump(perFinger, f, fShare);
      }
      if (last.hand !== 'both') bump(perHand, last.hand as Hand, c);
      if (breakdownBy) {
        const bk =
          breakdownBy === 'layer'
            ? last.layer
            : breakdownBy === 'row'
              ? last.row
              : breakdownBy === 'col'
                ? last.col
                : breakdownBy === 'key_kind'
                  ? last.key_kind
                  : breakdownBy === 'hand'
                    ? last.hand
                    : 'all';
        bump(breakdown, bk, c);
      }
    }
  }

  const keystrokes =
    ctx.sim.stats.keystrokes + (ctx.globals.space_per_word_in_keystrokes ? ctx.sim.stats.words : 0);
  const handPct = distribute(perHand, matched);

  let value: number | null;
  let unit: Unit = 'percent';
  switch (aggregate) {
    case 'percent_of_keystrokes':
      value = pct(matched, keystrokes);
      break;
    case 'count':
      value = matched;
      unit = 'count';
      break;
    case 'per100':
      value = per100(matched, ctx.sim.stats, rule.aggregate_opts?.per ?? 'symbols');
      unit = 'per100';
      break;
    case 'sum_distance':
      value = total > 0 ? (weightedDistance / total) * 100 : null;
      unit = 'distance';
      break;
    case 'mean_distance':
      value = matched > 0 ? weightedDistance / matched : null;
      unit = 'distance';
      break;
    case 'per_finger':
      value = spread(distribute(perFinger, matched) as Map<string | number, number>);
      break;
    case 'per_hand':
      value = Math.abs((handPct.get('L') ?? 0) - (handPct.get('R') ?? 0));
      break;
    case 'per_layer':
    case 'per_row':
    case 'per_col':
      value = spread(distribute(breakdown, matched));
      break;
    case 'weighted_sum': {
      const table = rule.params?.effort ?? {};
      const fallback = defaultEffort(ctx.compiled);
      let sum = 0;
      for (const it of items) {
        let e = 0;
        for (const k of it.ngram) {
          for (const m of k.members) e += keyEffort(ctx.compiled, m, table, fallback);
        }
        sum += it.c * e;
      }
      const k = ctx.sim.stats.keystrokes;
      value = k > 0 ? (sum / k) * (rule.scale ?? 1) : 0;
      unit = 'effort';
      break;
    }
    default:
      value = pct(matched, total);
  }

  const joiner = n === 2 && skip !== 0 ? '_' : '';
  const itemsOut: RuleItem[] = items
    .sort((a, b) => b.c - a.c)
    .slice(0, ctx.globals.top_items)
    .map((it) => ({
      label: it.ngram.map((k) => k.label).join(joiner),
      keys: it.ngram.map((k) => k.pos),
      percent: total > 0 ? (it.c / total) * 100 : 0,
      count: it.c,
      distance: it.d,
    }));

  return finish(rule, value, {
    unit,
    items: itemsOut,
    per_key: toRecord(perKey) as unknown as Record<number, number>,
    per_finger: toRecord(distribute(perFinger, matched)) as Partial<Record<Finger, number>>,
    per_hand: toRecord(handPct) as Partial<Record<Hand, number>>,
    breakdown: toRecord(distribute(breakdown, matched)),
  });
}

// ---------------------------------------------------------------------- runs

function evalRun(rule: Rule, ctx: Ctx): RuleResult {
  const runs = ctx.sim.runs;
  const by = rule.run?.by ?? 'hand';
  const hist = by === 'finger' ? runs.fingerRuns : by === 'layer' ? runs.layerRuns : runs.handRuns;
  // Histograms are sparse arrays indexed by run length; only real lengths are entries.
  const histEntries: [number, number][] = [];
  hist.forEach((count, len) => {
    if (count > 0) histEntries.push([len, count]);
  });

  if ((rule.aggregate ?? 'histogram') === 'top_strings') {
    const totalWords = ctx.sim.stats.words;
    const minLen = rule.run?.min_len ?? 4;
    const long = [...runs.handStrings.entries()].filter(([s]) => [...s].length >= minLen);
    const items: RuleItem[] = long
      .sort((a, b) => b[1] * [...b[0]].length - a[1] * [...a[0]].length)
      .slice(0, ctx.globals.top_items)
      .map(([s, c]) => ({
        label: s,
        count: c,
        percent: totalWords > 0 ? (c / totalWords) * 100 : 0,
        keys: [],
      }));
    const count = long.reduce((acc, [, c]) => acc + c, 0);
    return finish(rule, totalWords > 0 ? (count / totalWords) * 100 : 0, {
      unit: 'percent',
      items,
    });
  }

  const entries = histEntries.sort((a, b) => a[0] - b[0]);
  const total = entries.reduce((acc, [, c]) => acc + c, 0);
  const mean = total > 0 ? entries.reduce((acc, [len, c]) => acc + len * c, 0) / total : 0;
  const items: RuleItem[] = entries.map(([len, c]) => ({
    label: String(len),
    percent: total > 0 ? (c / total) * 100 : 0,
    count: c,
    keys: [],
  }));
  return finish(rule, mean, {
    unit: 'length',
    items,
    breakdown: toRecord(new Map(entries)),
  });
}

// --------------------------------------------------------------------- words

function evalWord(rule: Rule, ctx: Ctx): RuleResult {
  const minLen = rule.min_length ?? 4;
  const minCount = rule.min_count ?? 2;
  const table = rule.params?.effort ?? {};
  const fallback = defaultEffort(ctx.compiled);

  const scored: { word: string; count: number; effort: number; perChar: number; keys: number[] }[] =
    [];
  for (const [w, t] of ctx.sim.words) {
    const len = [...w].length;
    if (len < minLen || t.count < minCount) continue;
    let effort = 0;
    const keys: number[] = [];
    for (const id of t.keys) {
      const a = ctx.attrs[id];
      if (!a) continue;
      keys.push(a.pos);
      for (const m of a.members) effort += keyEffort(ctx.compiled, m, table, fallback);
    }
    // Extra presses (layer taps and the like) count as effort too.
    const perChar = (effort + (t.presses - len)) / len;
    scored.push({ word: w, count: t.count, effort, perChar, keys });
  }

  const items: RuleItem[] = scored
    .sort((a, b) => b.perChar - a.perChar)
    .slice(0, ctx.globals.top_items)
    .map((s) => ({
      label: s.word,
      count: s.count,
      percent: s.perChar,
      distance: s.effort,
      keys: s.keys,
    }));

  const totalWords = ctx.sim.stats.words;
  const weighted = scored.reduce((acc, s) => acc + s.perChar * s.count, 0);
  return finish(rule, totalWords > 0 ? weighted / totalWords : 0, { unit: 'effort', items });
}

// --------------------------------------------------------------------- stats

function evalStat(rule: Rule, ctx: Ctx): RuleResult {
  const st = ctx.sim.stats;
  let value: number | null;
  switch (rule.stat) {
    case 'layer_taps_per_100':
      value = ratio(st.layer_taps, st.symbols) * 100;
      break;
    case 'one_shots_per_word':
      value = ratio(st.one_shot_activations, st.words);
      break;
    case 'wasted_one_shots_pct':
      value = ratio(st.wasted_one_shots, st.one_shot_activations) * 100;
      break;
    case 'macro_pct':
      value = ratio(st.macro_presses, st.keystrokes) * 100;
      break;
    case 'adaptive_hit_rate':
      value = ratio(st.adaptive_trigger_hits, st.adaptive_presses) * 100;
      break;
    case 'combo_pct':
      value = ratio(st.chords, st.keystrokes) * 100;
      break;
    case 'extra_keystrokes':
      value = st.symbols > 0 ? st.keystrokes / st.symbols - 1 : 0;
      break;
    case 'keystrokes':
      value = st.keystrokes;
      break;
    case 'hold_pct':
      value = ratio(st.hold_presses, st.keystrokes) * 100;
      break;
    case 'repeat_pct':
      value = ratio(st.repeat_presses, st.keystrokes) * 100;
      break;
    default:
      value = null;
  }

  const breakdown: Record<string, number> = {};
  if (rule.stat === 'layer_taps_per_100') {
    st.per_layer.forEach((c, l) => {
      breakdown[String(l)] = ratio(c, st.keystrokes) * 100;
    });
  }
  return finish(rule, value, { unit: rule.unit ?? 'percent', breakdown });
}

// -------------------------------------------------------------------- travel

function evalTravel(rule: Rule, ctx: Ctx): RuleResult {
  const tr = ctx.sim.travel;
  const src = rule.travel_mode === 'reset_at_word' ? tr.resetAtWord : tr.continuous;
  const k = ctx.sim.stats.keystrokes;
  const fingers = Object.entries(src) as [Finger, number][];
  const total = fingers.reduce((acc, [, d]) => acc + d, 0);

  const perFinger: Partial<Record<Finger, number>> = {};
  if (total > 0) for (const [f, d] of fingers) perFinger[f] = (d / total) * 100;

  const left = fingers.filter(([f]) => fingerHand(f) === 'L').reduce((acc, [, d]) => acc + d, 0);
  const perHand: Partial<Record<Hand, number>> =
    total > 0 ? { L: (left / total) * 100, R: ((total - left) / total) * 100 } : {};

  return finish(rule, k > 0 ? total / k : 0, {
    unit: 'distance',
    per_finger: perFinger,
    per_hand: perHand,
    breakdown: src as unknown as Record<string, number>,
  });
}

// ------------------------------------------------------------------ dispatch

function evaluateRule(rule: Rule, ctx: Ctx): RuleResult {
  const scoped: Ctx = { ...ctx, params: rule.params ?? {} };
  switch (rule.source ?? 'ngram') {
    case 'run':
      return evalRun(rule, scoped);
    case 'word':
      return evalWord(rule, scoped);
    case 'stat':
      return evalStat(rule, scoped);
    case 'travel':
      return evalTravel(rule, scoped);
    default:
      return evalNgram(rule, scoped);
  }
}

function computeScore(results: RuleResult[], ruleSet: RuleSet): Score {
  const weighted = results
    .filter((r) => r.score_weight > 0 && typeof r.value === 'number' && r.band.index !== null)
    .map((r) => [r.score_weight, r.band.goodness ?? 0.5] as const);
  const totalW = weighted.reduce((acc, [w]) => acc + w, 0);
  const value =
    totalW > 0 ? (weighted.reduce((acc, [w, g]) => acc + w * g, 0) / totalW) * 100 : null;
  return { enabled: ruleSet.score_enabled ?? false, value };
}

export interface EvaluationResult {
  results: RuleResult[];
  score: Score;
  globals: Globals;
}

/**
 * Run a rule set over a simulation. Ratio rules are evaluated last, against the other results, and
 * appended in that order.
 */
export function evaluate(
  sim: SimulationTables,
  compiled: CompiledLayout,
  ruleSet: RuleSet,
): EvaluationResult {
  const globals: Globals = { ...DEFAULT_GLOBALS, ...ruleSet.globals };
  const attrs = buildAttrs(compiled, sim.registry);
  const tables = globals.universe === 'with_space' ? sim.withSpace : sim.noSpace;
  const ctx: Ctx = { sim, compiled, attrs, tables, globals, params: {} };

  const enabled = ruleSet.rules.filter((r) => r.enabled !== false);
  const results = enabled.filter((r) => r.aggregate !== 'ratio').map((r) => evaluateRule(r, ctx));
  const byId = new Map(results.map((r) => [r.id, r]));

  const ratios = enabled
    .filter((r) => r.aggregate === 'ratio')
    .map((rule) => {
      const a = byId.get(rule.aggregate_opts?.numerator ?? '');
      const b = byId.get(rule.aggregate_opts?.denominator ?? '');
      const value =
        a && b && typeof a.value === 'number' && typeof b.value === 'number' && b.value > 0
          ? a.value / b.value
          : null;
      return finish(rule, value, { unit: 'ratio' });
    });

  const all = [...results, ...ratios];
  return { results: all, score: computeScore(all, ruleSet), globals };
}
