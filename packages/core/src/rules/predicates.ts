import type { Finger, FingerName } from '../geometry/types.js';
import { fingerName } from '../geometry/types.js';
import {
  type Attrs,
  adjacentFingerPair,
  attrDistance,
  pairDirection,
  rankDelta,
  sameFinger,
  sameHand,
} from './attrs.js';
import type { Globals, NumCond, Predicate, PredicateLeaf, Rule } from './types.js';

export interface PredicateContext {
  globals: Globals;
  params: Rule['params'];
}

/** An n-gram: the attributes of its keys, in typing order. */
export type Ngram = Attrs[];
export type CompiledPredicate = (ngram: Ngram) => boolean;

const DEFAULT_HEIGHT: Record<FingerName, number> = {
  middle: 3,
  ring: 2,
  pinky: 1,
  index: 0,
  thumb: -1,
};

/** `"$global.name"` resolves against the rule set's globals; anything else is a literal. */
function resolve(v: unknown, ctx: PredicateContext): unknown {
  if (typeof v === 'string' && v.startsWith('$global.')) {
    return (ctx.globals as unknown as Record<string, unknown>)[v.slice('$global.'.length)];
  }
  return v;
}

function resolveDeep(v: unknown, ctx: PredicateContext): unknown {
  const r = resolve(v, ctx);
  if (r && typeof r === 'object' && !Array.isArray(r)) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(r as Record<string, unknown>)) {
      out[k] = resolve(val, ctx);
    }
    return out;
  }
  return r;
}

function inSet(x: unknown, v: unknown): boolean {
  if (v && typeof v === 'object' && !Array.isArray(v) && 'in' in (v as object)) {
    return ((v as { in: unknown[] }).in ?? []).some((c) => c === x);
  }
  if (Array.isArray(v)) return v.some((c) => c === x);
  return v === x;
}

function num(x: number, cond: NumCond): boolean {
  if (typeof cond === 'number') return x === cond;
  const c = cond as Record<string, number>;
  if ('abs' in c) return Math.abs(x) === c.abs;
  if ('abs_min' in c) {
    return Math.abs(x) >= c.abs_min && (!('abs_max' in c) || Math.abs(x) <= c.abs_max);
  }
  if ('abs_max' in c) return Math.abs(x) <= c.abs_max;
  if ('eq' in c) return x === c.eq;
  return (
    (!('min' in c) || x >= c.min) &&
    (!('max' in c) || x <= c.max) &&
    (!('gt' in c) || x > c.gt) &&
    (!('lt' in c) || x < c.lt)
  );
}

/** Pairwise predicates hold when every consecutive pair holds; a single key never satisfies one. */
function allPairs(keys: Ngram, fn: (a: Attrs, b: Attrs) => boolean): boolean {
  if (keys.length < 2) return false;
  for (let i = 0; i + 1 < keys.length; i++) {
    if (!fn(keys[i], keys[i + 1])) return false;
  }
  return true;
}

function nameOf(f: Finger | null): FingerName | null {
  return f ? (fingerName(f) as FingerName) : null;
}

/** "The finger that prefers being higher sits lower" (Layouts Doc ch. 6). y grows downward. */
function heightViolated(a: Attrs, b: Attrs, ctx: PredicateContext): boolean {
  if (!sameHand(a, b) || sameFinger(a, b) || !a.finger || !b.finger) return false;
  const table: Record<string, number> = {
    ...DEFAULT_HEIGHT,
    ...(ctx.params?.finger_height_preference ?? {}),
  };
  const pa = table[nameOf(a.finger) as string] ?? 0;
  const pb = table[nameOf(b.finger) as string] ?? 0;
  if (pa === pb) return false;
  return pa > pb ? a.y > b.y : b.y > a.y;
}

function directions(ng: Ngram): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < ng.length; i++) out.push(pairDirection(ng[i], ng[i + 1]));
  return out;
}

function monotone(ng: Ngram): boolean {
  if (ng.length < 3) return false;
  const d = directions(ng);
  return d.every((x) => x === 'inward' || x === 'outward') && new Set(d).size === 1;
}

function changesDirection(ng: Ngram): boolean {
  if (ng.length < 3) return false;
  const d = directions(ng);
  return d.every((x) => x === 'inward' || x === 'outward') && new Set(d).size > 1;
}

function handPattern(ng: Ngram, pattern: string): boolean {
  const chars = [...pattern];
  if (chars.length !== ng.length) return false;
  if (chars.every((c) => c === 'L' || c === 'R')) {
    return chars.every((c, i) => ng[i].hand === c);
  }
  const first = ng[0].hand;
  if (first === 'both') return false;
  return chars.every((c, i) => {
    const h = ng[i].hand;
    if (c === 'a') return h === first;
    if (c === 'b') return h !== 'both' && h !== first;
    return false;
  });
}

function leaf(
  name: string,
  value: unknown,
  keys: Ngram,
  ng: Ngram,
  ctx: PredicateContext,
): boolean {
  switch (name) {
    // single-key attributes: every selected key must satisfy, unless the name says `any_`
    case 'hand':
      return keys.every((k) => k.hand === value);
    case 'finger':
      return keys.every((k) => inSet(k.finger, value));
    case 'includes_finger':
      return keys.some((k) => inSet(k.finger, value));
    case 'finger_name':
      return keys.every((k) => k.finger !== null && inSet(nameOf(k.finger), value));
    case 'includes_finger_name':
      return keys.some((k) => k.finger !== null && inSet(nameOf(k.finger), value));
    case 'row':
      return keys.every((k) => inSet(k.row, value));
    case 'col':
      return keys.every((k) => inSet(k.col, value));
    case 'is_thumb':
      return keys.every((k) => k.thumb === value);
    case 'any_thumb':
      return keys.some((k) => k.thumb) === value;
    case 'is_home':
      return keys.every((k) => k.home === value);
    case 'is_inner':
      return keys.every((k) => k.inner === value);
    case 'any_inner':
      return keys.some((k) => k.inner) === value;
    case 'key_kind':
      return keys.every((k) => inSet(k.key_kind, value));
    case 'any_key_kind':
      return keys.some((k) => inSet(k.key_kind, value));
    case 'layer':
      return keys.every((k) => inSet(k.layer, value));
    case 'any_layer':
      return keys.some((k) => inSet(k.layer, value));
    case 'is_chord':
      return keys.every((k) => k.members.length > 1) === value;

    // pairwise attributes: every consecutive pair of the selection
    case 'same_hand':
      return allPairs(keys, (a, b) => sameHand(a, b) === value);
    case 'same_finger':
      return allPairs(keys, (a, b) => sameFinger(a, b) === value);
    case 'same_key':
      return allPairs(keys, (a, b) => (a.pos === b.pos) === value);
    case 'adjacent_fingers':
      return allPairs(keys, (a, b) => adjacentFingerPair(a, b) === value);
    case 'rank_delta':
      return allPairs(keys, (a, b) => num(rankDelta(a, b), value as NumCond));
    case 'row_delta':
      return allPairs(keys, (a, b) => num(a.row - b.row, value as NumCond));
    case 'col_delta':
      return allPairs(keys, (a, b) => num(a.col - b.col, value as NumCond));
    case 'x_distance':
      return allPairs(keys, (a, b) => sameHand(a, b) && num(Math.abs(a.x - b.x), value as NumCond));
    case 'y_distance':
      return allPairs(keys, (a, b) => sameHand(a, b) && num(Math.abs(a.y - b.y), value as NumCond));
    case 'distance':
      return allPairs(keys, (a, b) => {
        const d = attrDistance(a, b, ctx.globals.distance_model);
        return d !== null && num(d, value as NumCond);
      });
    case 'direction':
      return allPairs(keys, (a, b) => pairDirection(a, b) === value);
    case 'finger_name_pair': {
      const wanted = [...(value as FingerName[])].sort();
      return allPairs(keys, (a, b) => {
        if (!a.finger || !b.finger || !sameHand(a, b)) return false;
        const got = [nameOf(a.finger) as string, nameOf(b.finger) as string].sort();
        return got.length === wanted.length && got.every((g, i) => g === wanted[i]);
      });
    }
    case 'finger_height_preference':
      return allPairs(keys, (a, b) => heightViolated(a, b, ctx));

    // whole-n-gram attributes
    case 'hand_pattern':
      return handPattern(ng, value as string);
    case 'monotone':
      return monotone(ng) === value;
    case 'changes_direction':
      return changesDirection(ng) === value;
    case 'distinct_fingers':
      return (new Set(keys.map((k) => k.finger)).size === keys.length) === value;
    default:
      throw new Error(`unknown predicate ${name}`);
  }
}

/**
 * Turn a predicate tree into a closure. Values and `at` selections are resolved once, so the hot
 * loop only walks the n-gram.
 */
export function compilePredicate(
  pred: Predicate | null | undefined,
  ctx: PredicateContext,
): CompiledPredicate {
  if (!pred) return () => true;
  if ('all' in pred && Array.isArray(pred.all)) {
    const parts = pred.all.map((p) => compilePredicate(p, ctx));
    return (ng) => parts.every((f) => f(ng));
  }
  if ('any' in pred && Array.isArray(pred.any)) {
    const parts = pred.any.map((p) => compilePredicate(p, ctx));
    return (ng) => parts.some((f) => f(ng));
  }
  if ('none' in pred && Array.isArray(pred.none)) {
    const parts = pred.none.map((p) => compilePredicate(p, ctx));
    return (ng) => !parts.some((f) => f(ng));
  }

  const { at, ...rest } = pred as PredicateLeaf;
  const entries = Object.entries(rest).map(
    ([k, v]) => [k, resolveDeep(v, ctx)] as [string, unknown],
  );
  const idx = at;
  return (ng) => {
    const keys = idx ? idx.map((i) => ng[i]) : ng;
    for (const [name, value] of entries) {
      if (!leaf(name, value, keys, ng, ctx)) return false;
    }
    return true;
  };
}

/** Evaluate a predicate directly (convenience for tests and one-off checks). */
export function matchPredicate(
  pred: Predicate | null | undefined,
  ngram: Ngram,
  ctx: PredicateContext,
): boolean {
  return compilePredicate(pred, ctx)(ngram);
}
