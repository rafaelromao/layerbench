import type { Finger, Hand } from '../geometry/types.js';
import { fingerHand } from '../geometry/types.js';
import type { CompiledLayout } from '../layout/compile.js';
import { tableIndex } from '../tables/ngram-index.js';
import type { SimulationTables } from '../tables/tables.js';
import { packBigram, unpackBigram, unpackTrigram } from '../tables/tables.js';
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
  type RuleItemNext,
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
  /** The text's own n-gram totals in the same universe, as if every character took one press. */
  text: SimulationTables['text']['noSpace'];
  /** What follows each pair that ends on a layer key, built the first time a rule asks. */
  followers?: Map<number, Map<number, number>>;
}

/**
 * A key pressed to bring a layer on rather than to type: a layer key tapped, or one held. The
 * machine names a hold that turns a layer on `⇩<layer>`; any other hold is a modifier.
 */
function reachesLayer(k: Attrs | undefined): boolean {
  return k?.key_kind === 'layer_tap' || (k?.key_kind === 'hold' && k.label.startsWith('⇩'));
}

/** For each pair that ends on a layer key, the keys pressed next and how often. */
function followersOf(ctx: Ctx): Map<number, Map<number, number>> {
  if (ctx.followers) return ctx.followers;
  const out = new Map<number, Map<number, number>>();
  for (const [key, count] of ctx.tables.trigram) {
    const [a, b, c] = unpackTrigram(key);
    if (!reachesLayer(ctx.attrs[b])) continue;
    const pair = packBigram(a, b);
    const next = out.get(pair) ?? new Map<number, number>();
    next.set(c, (next.get(c) ?? 0) + count);
    out.set(pair, next);
  }
  ctx.followers = out;
  return out;
}

/** What a pair that ends on a layer key was pressed for, each with its part of the pair's percent. */
function nextKeys(ctx: Ctx, pair: Ngram, percent: number): RuleItemNext[] | undefined {
  if (pair.length !== 2 || !reachesLayer(pair[1])) return undefined;
  const next = followersOf(ctx).get(packBigram(pair[0].id, pair[1].id));
  if (!next) return undefined;
  const sum = [...next.values()].reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return undefined;
  return [...next.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => {
      const k = ctx.attrs[id];
      return {
        label: k.label,
        key: k.pos,
        layer: k.layer,
        count,
        share: count / sum,
        percent: (percent * count) / sum,
      };
    });
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

/** Credit a physical key with part of a number, overall and on the layer it was pressed on. */
function credit(
  perKey: Map<number, number>,
  perLayerKey: Map<number, Map<number, number>>,
  layer: number,
  key: number,
  by: number,
): void {
  if (by === 0) return;
  bump(perKey, key, by);
  let onLayer = perLayerKey.get(layer);
  if (!onLayer) {
    onLayer = new Map<number, number>();
    perLayerKey.set(layer, onLayer);
  }
  bump(onLayer, key, by);
}

function perLayerRecord(
  perLayerKey: Map<number, Map<number, number>>,
): Record<number, Record<number, number>> {
  return Object.fromEntries(
    [...perLayerKey].map(([layer, keys]) => [layer, toRecord(keys)]),
  ) as unknown as Record<number, Record<number, number>>;
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

/**
 * Keystrokes as the text counts them: one per character, space included only when the universe
 * counts it. Counting the layout's own presses instead would let its layer taps, holds
 * and one-shots, which no pair rule can match, thin out every percentage. cyanophage counts one
 * space per word, which `space_per_word_in_keystrokes` adds where space is not counted; where it
 * is, the spaces are already there, and adding a word's space on top would count it twice.
 */
function textKeystrokes(ctx: Ctx): number {
  if (ctx.globals.universe === 'with_space') return ctx.text.unigram;
  return ctx.text.unigram + (ctx.globals.space_per_word_in_keystrokes ? ctx.sim.stats.words : 0);
}

function per100Denominator(stats: SimulationTables['stats'], per?: string): number {
  return per === 'keystrokes' ? stats.keystrokes : per === 'words' ? stats.words : stats.symbols;
}

function per100(m: number, stats: SimulationTables['stats'], per?: string): number {
  const denom = per100Denominator(stats, per);
  return denom > 0 ? (m / denom) * 100 : 0;
}

interface Extra {
  unit?: Unit;
  items?: RuleItem[];
  per_key?: Record<number, number>;
  per_layer_key?: Record<number, Record<number, number>>;
  key_scale?: number | null;
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
    per_layer_key: extra.per_layer_key ?? {},
    key_scale: extra.key_scale ?? null,
    per_hand: extra.per_hand ?? {},
    breakdown: extra.breakdown ?? {},
    note: rule.description ?? null,
    enabled: true,
    score_weight: rule.score?.weight ?? 0,
    normalized: null,
  };
}

// ------------------------------------------------------------------- n-grams

/** One table an n-gram rule counts over: its entries, what they are a share of, and their weight. */
export interface NgramSource {
  table: Map<number, number>;
  total: number;
  weight: number;
  /** Which table of the universe it is. */
  kind: 'unigram' | 'bigram' | 'trigram' | 'skip1' | 'skip2' | 'skip3';
}

/**
 * The tables an n-gram rule counts over. Pairs are counted over the text's pairs, not the layout's:
 * its extra presses would otherwise add pairs no rule can match, and a macro would take away pairs
 * it saved. Single keys and trigrams are shares of what was pressed; trigram categories must still
 * add up within it.
 */
function ngramSources(rule: Rule, ctx: Ctx): NgramSource[] {
  const spec = rule.ngram ?? { n: 2 as const, skip: 0 };
  const n = spec.n ?? 2;
  const skip = spec.skip ?? 0;
  const t = ctx.tables;
  const pairs = ctx.text;
  const skipKind = (k: number) => `skip${k}` as NgramSource['kind'];
  if (n === 1) return [{ table: t.unigram, total: t.totals.unigram, weight: 1, kind: 'unigram' }];
  if (n === 3) return [{ table: t.trigram, total: t.totals.trigram, weight: 1, kind: 'trigram' }];
  if (Array.isArray(skip)) {
    return skip.map((k) => ({
      table: t.skip[k - 1],
      total: pairs.skip[k - 1],
      weight: ctx.globals.skip_weights[k - 1] ?? 0,
      kind: skipKind(k),
    }));
  }
  if (skip > 0)
    return [
      { table: t.skip[skip - 1], total: pairs.skip[skip - 1], weight: 1, kind: skipKind(skip) },
    ];
  return [{ table: t.bigram, total: pairs.bigram, weight: 1, kind: 'bigram' }];
}

/** The n-gram a table entry is, its keys' attributes in order. */
function ngramOf(ctx: Ctx, kind: NgramSource['kind'], key: number, into: Attrs[]): void {
  if (kind === 'unigram') into[0] = ctx.attrs[key];
  else if (kind === 'trigram') {
    const [a, b, c] = unpackTrigram(key);
    into[0] = ctx.attrs[a];
    into[1] = ctx.attrs[b];
    into[2] = ctx.attrs[c];
  } else {
    const [a, b] = unpackBigram(key);
    into[0] = ctx.attrs[a];
    into[1] = ctx.attrs[b];
  }
}

/** An n-gram as a card lists it, with its share of what the rule counts over. */
function toItem(
  ctx: Ctx,
  rule: Rule,
  ngram: Ngram,
  c: number,
  d: number | null,
  total: number,
): RuleItem {
  const spec = rule.ngram ?? { n: 2 as const, skip: 0 };
  const n = spec.n ?? 2;
  const skip = spec.skip ?? 0;
  const joiner = n === 2 && skip !== 0 ? '_' : '';
  const percent = total > 0 ? (c / total) * 100 : 0;
  // A pair, not a skipgram: what is pressed after it is what came right after its last key.
  const then = n === 2 && skip === 0 ? nextKeys(ctx, ngram, percent) : undefined;
  return {
    label: ngram.map((k) => k.label).join(joiner),
    keys: ngram.map((k) => k.pos),
    layers: ngram.map((k) => k.layer),
    percent,
    count: c,
    distance: d,
    ...(then ? { then } : {}),
  };
}

function evalNgram(rule: Rule, ctx: Ctx): RuleResult {
  const spec = rule.ngram ?? { n: 2 as const, skip: 0 };
  const n = spec.n ?? 2;
  const sources = ngramSources(rule, ctx);

  const match = compilePredicate(rule.where, ctx);
  const aggregate: Aggregate = rule.aggregate ?? 'percent_of_ngrams';
  const model = ctx.globals.distance_model;
  const breakdownBy = rule.breakdown_by;

  let matched = 0;
  let total = 0;
  let weightedDistance = 0;
  const items: { ngram: Ngram; c: number; d: number | null }[] = [];
  const perKey = new Map<number, number>();
  const perLayerKey = new Map<number, Map<number, number>>();
  const perFinger = new Map<Finger, number>();
  const perHand = new Map<Hand, number>();
  const breakdown = new Map<string | number, number>();
  const ngram: Attrs[] = new Array(n);
  // What each key is credited with, so that the keys' parts add up to the value: an n-gram's count
  // split between its keys, and a chord's share between the keys pressed together; its distance
  // times its count for a distance; each key's own effort times its count for an effort sum, where
  // a space costs nothing whichever key types it.
  const byDistance = aggregate === 'sum_distance' || aggregate === 'mean_distance';
  const effortTable = rule.params?.effort ?? {};
  const fallback = defaultEffort(ctx.compiled);
  const memberEffort =
    aggregate === 'weighted_sum'
      ? ctx.compiled.keys.map((_, m) => keyEffort(ctx.compiled, m, effortTable, fallback))
      : null;
  let effortSum = 0;

  for (const source of sources) {
    total += source.total * source.weight;
    for (const [key, count] of source.table) {
      ngramOf(ctx, source.kind, key, ngram);
      if (!match(ngram)) continue;

      const c = count * weightOf(rule.weight, ngram) * source.weight;
      const d = pairDistance(ngram, model);
      matched += c;
      weightedDistance += c * (d ?? 0);
      items.push({ ngram: [...ngram], c, d });

      const each = (byDistance ? c * (d ?? 0) : c) / ngram.length;
      for (const k of ngram) {
        for (const m of k.members) {
          const part = memberEffort
            ? k.key_kind === 'space'
              ? 0
              : c * memberEffort[m]
            : each / k.members.length;
          if (memberEffort) effortSum += part;
          credit(perKey, perLayerKey, k.layer, m, part);
        }
      }

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

  const keystrokes = textKeystrokes(ctx);
  const handPct = distribute(perHand, matched);

  let value: number | null;
  /** What a unit of a key's credit is worth in the value; null where the value is no such sum. */
  let keyScale: number | null;
  let unit: Unit = 'percent';
  switch (aggregate) {
    case 'percent_of_keystrokes':
      value = pct(matched, keystrokes);
      keyScale = keystrokes > 0 ? 100 / keystrokes : 0;
      break;
    case 'count':
      value = matched;
      keyScale = 1;
      unit = 'count';
      break;
    case 'per100': {
      const denom = per100Denominator(ctx.sim.stats, rule.aggregate_opts?.per ?? 'symbols');
      value = per100(matched, ctx.sim.stats, rule.aggregate_opts?.per ?? 'symbols');
      keyScale = denom > 0 ? 100 / denom : 0;
      unit = 'per100';
      break;
    }
    case 'sum_distance':
      value = total > 0 ? (weightedDistance / total) * 100 : null;
      keyScale = total > 0 ? 100 / total : null;
      unit = 'distance';
      break;
    case 'mean_distance':
      value = matched > 0 ? weightedDistance / matched : null;
      keyScale = matched > 0 ? 1 / matched : null;
      unit = 'distance';
      break;
    case 'per_finger':
      value = spread(distribute(perFinger, matched) as Map<string | number, number>);
      keyScale = null;
      break;
    case 'per_hand':
      value = Math.abs((handPct.get('L') ?? 0) - (handPct.get('R') ?? 0));
      keyScale = null;
      break;
    case 'per_layer':
    case 'per_row':
    case 'per_col':
      value = spread(distribute(breakdown, matched));
      keyScale = null;
      break;
    case 'weighted_sum': {
      // Per character typed, space included, which is cyanophage's keystrokes on the layouts it
      // models. The layout's own presses would make its layer taps, which cost less than most
      // letters, lower the average: they add their cost, never a keystroke.
      const k = ctx.sim.text.withSpace.unigram;
      value = k > 0 ? (effortSum / k) * (rule.scale ?? 1) : 0;
      keyScale = k > 0 ? (rule.scale ?? 1) / k : 0;
      unit = 'effort';
      break;
    }
    default:
      value = pct(matched, total);
      keyScale = total > 0 ? 100 / total : 0;
  }

  const itemsOut: RuleItem[] = items
    .sort((a, b) => b.c - a.c)
    .slice(0, ctx.globals.top_items)
    .map((it) => toItem(ctx, rule, it.ngram, it.c, it.d, total));

  return finish(rule, value, {
    unit,
    items: itemsOut,
    key_scale: keyScale,
    per_key: toRecord(perKey) as unknown as Record<number, number>,
    per_layer_key: perLayerRecord(perLayerKey),
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

  const scored: {
    word: string;
    count: number;
    effort: number;
    perChar: number;
    keys: number[];
    layers: number[];
  }[] = [];
  for (const [w, t] of ctx.sim.words) {
    const len = [...w].length;
    if (len < minLen || t.count < minCount) continue;
    let effort = 0;
    const keys: number[] = [];
    const layers: number[] = [];
    for (const id of t.keys) {
      const a = ctx.attrs[id];
      if (!a) continue;
      keys.push(a.pos);
      layers.push(a.layer);
      for (const m of a.members) effort += keyEffort(ctx.compiled, m, table, fallback);
    }
    // Extra presses (layer taps and the like) count as effort too.
    const perChar = (effort + (t.presses - len)) / len;
    scored.push({ word: w, count: t.count, effort, perChar, keys, layers });
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
      layers: s.layers,
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
      // Space presses type spaces, which are not symbols here: left in, every layout would look as
      // if it pressed a key too many per word.
      value = st.symbols > 0 ? (st.keystrokes - st.space_presses) / st.symbols - 1 : 0;
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
  const parts: Extra = {};
  if (rule.stat === 'layer_taps_per_100') {
    st.per_layer.forEach((c, l) => {
      breakdown[String(l)] = ratio(c, st.keystrokes) * 100;
    });
    // Each layer tap on the key it was made on, a chord's split between its keys.
    const perKey = new Map<number, number>();
    const perLayerKey = new Map<number, Map<number, number>>();
    for (const [id, count] of ctx.sim.withSpace.unigram) {
      const a = ctx.attrs[id];
      if (a?.key_kind !== 'layer_tap') continue;
      for (const m of a.members) credit(perKey, perLayerKey, a.layer, m, count / a.members.length);
    }
    parts.key_scale = st.symbols > 0 ? 100 / st.symbols : 0;
    parts.per_key = toRecord(perKey) as unknown as Record<number, number>;
    parts.per_layer_key = perLayerRecord(perLayerKey);
  }
  return finish(rule, value, { unit: rule.unit ?? 'percent', breakdown, ...parts });
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

  // Each key is credited with the travel its finger made to press it.
  const perKey = new Map<number, number>();
  const perLayerKey = new Map<number, Map<number, number>>();
  const byKey = rule.travel_mode === 'reset_at_word' ? tr.byKey.resetAtWord : tr.byKey.continuous;
  byKey.forEach((slots, id) => {
    const a = ctx.attrs[id];
    if (!a || !slots) return;
    slots.forEach((d, slot) => {
      const m = a.members[slot];
      if (m !== undefined) credit(perKey, perLayerKey, a.layer, m, d);
    });
  });

  return finish(rule, k > 0 ? total / k : 0, {
    unit: 'distance',
    per_finger: perFinger,
    per_hand: perHand,
    breakdown: src as unknown as Record<string, number>,
    key_scale: k > 0 ? 1 / k : 0,
    per_key: toRecord(perKey) as unknown as Record<number, number>,
    per_layer_key: perLayerRecord(perLayerKey),
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

/** Everything a rule set reads a simulation through, the same for every rule. */
function contextOf(sim: SimulationTables, compiled: CompiledLayout, ruleSet: RuleSet): Ctx {
  const globals: Globals = { ...DEFAULT_GLOBALS, ...ruleSet.globals };
  const attrs = buildAttrs(compiled, sim.registry);
  const withSpace = globals.universe === 'with_space';
  const tables = withSpace ? sim.withSpace : sim.noSpace;
  const text = withSpace ? sim.text.withSpace : sim.text.noSpace;
  return { sim, compiled, attrs, tables, text, globals, params: {} };
}

/** One rule's n-grams through a key: how many it matched there, and the busiest of them. */
export interface FocusRule {
  id: string;
  /** Matched n-grams with the key in them, weighted as the rule weighs them. */
  count: number;
  /** As a card lists them, its percents of everything the rule counts over; busiest first. */
  items: RuleItem[];
}

export interface FocusResult {
  rules: FocusRule[];
  /** For a key pressed to bring a layer on: the keys pressed right after it, busiest first. */
  next: RuleItemNext[];
}

const SHAPE: Record<NgramSource['kind'], 1 | 2 | 3> = {
  unigram: 1,
  bigram: 2,
  trigram: 3,
  skip1: 2,
  skip2: 2,
  skip3: 2,
};

/**
 * What one key, pressed on one layer, takes part in: for every rule over pairs or trigrams, the
 * n-grams it matched with the key in them, in the order its card lists them. The key is a physical
 * key; its presses are every logical key typed on it on that layer, a chord it is part of included.
 */
export function evaluateFocus(
  sim: SimulationTables,
  compiled: CompiledLayout,
  ruleSet: RuleSet,
  focus: { key: number; layer: number },
  opts: { limit?: number } = {},
): FocusResult {
  const ctx = contextOf(sim, compiled, ruleSet);
  const limit = opts.limit ?? ctx.globals.top_items;
  const ids: number[] = [];
  ctx.attrs.forEach((a, id) => {
    if (a && a.layer === focus.layer && a.members.includes(focus.key)) ids.push(id);
  });

  const rules: FocusRule[] = [];
  for (const rule of ruleSet.rules) {
    if (rule.enabled === false || rule.aggregate === 'ratio') continue;
    if ((rule.source ?? 'ngram') !== 'ngram' || (rule.ngram?.n ?? 2) < 2) continue;
    const scoped: Ctx = { ...ctx, params: rule.params ?? {} };
    const match = compilePredicate(rule.where, scoped);
    const n = rule.ngram?.n ?? 2;
    const ngram: Attrs[] = new Array(n);
    const sources = ngramSources(rule, scoped);
    let total = 0;
    for (const source of sources) total += source.total * source.weight;
    let count = 0;
    const found: { ngram: Ngram; c: number; d: number | null }[] = [];
    for (const source of sources) {
      const index = tableIndex(source.table, SHAPE[source.kind]);
      const ordinals = new Set<number>();
      for (const id of ids) for (const o of index.through(id)) ordinals.add(o);
      for (const o of [...ordinals].sort((a, b) => a - b)) {
        ngramOf(scoped, source.kind, index.keys[o], ngram);
        if (!match(ngram)) continue;
        const c = index.counts[o] * weightOf(rule.weight, ngram) * source.weight;
        count += c;
        found.push({ ngram: [...ngram], c, d: pairDistance(ngram, scoped.globals.distance_model) });
      }
    }
    if (found.length === 0) continue;
    const items = found
      .sort((a, b) => b.c - a.c)
      .slice(0, limit)
      .map((it) => toItem(scoped, rule, it.ngram, it.c, it.d, total));
    rules.push({ id: rule.id, count, items });
  }

  // What a layer key was pressed for: the presses right after it.
  const next = new Map<number, number>();
  const pairs = tableIndex(ctx.tables.bigram, 2);
  for (const id of ids) {
    if (!reachesLayer(ctx.attrs[id])) continue;
    for (const o of pairs.through(id)) {
      const [a, b] = unpackBigram(pairs.keys[o]);
      if (a === id) next.set(b, (next.get(b) ?? 0) + pairs.counts[o]);
    }
  }
  const sum = [...next.values()].reduce((x, y) => x + y, 0);
  const pairTotal = ctx.tables.totals.bigram;
  return {
    rules,
    next: [...next.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, c]) => {
        const k = ctx.attrs[id];
        return {
          label: k.label,
          key: k.pos,
          layer: k.layer,
          count: c,
          share: sum > 0 ? c / sum : 0,
          percent: pairTotal > 0 ? (c / pairTotal) * 100 : 0,
        };
      }),
  };
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
  const ctx = contextOf(sim, compiled, ruleSet);
  const { globals } = ctx;

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
