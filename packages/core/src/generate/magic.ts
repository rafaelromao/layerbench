import type { AdaptiveTrigger, Binding, Layout } from '../layout/types.js';
import { type EngineScore, scoreLayout } from './engine.js';
import { board3x5 } from './model.js';
import type { Sample } from './tables.js';

/**
 * Magic keys, found with the engine. A magic (adaptive) key types its own symbol, but after a
 * given symbol types another: put where a same-finger pair lands, it lets the simulator type the
 * pair's second letter on another finger, since it prefers the way that makes no SFB. Its own
 * symbol must stay typeable after the trigger symbol, which happens one of two ways: a plain key
 * for it on `alpha2`, reached by the one-shot, when the layout has that layer; or the pair's own
 * key answering in kind, typing the magic key's symbol after the same trigger, as Magic Romak's
 * `h` and `v` do for each other. The second costs nothing in layer taps but may make a pair of its
 * own; the engine decides which is better.
 *
 * The search is greedy: each round tries every pair the `sfb` rule still lists on every cheap
 * base key on another finger, both ways, keeps the candidate that lowers SFB most without raising
 * Effort past the cap or costing noticeably more layer taps, and stops when nothing helps.
 */

export interface MagicOptions {
  effortCap: number;
  /** Adaptive keys at most, hosts and answering keys together (4). */
  maxKeys?: number;
  /** Triggers at most over all magic keys (6). */
  maxTriggers?: number;
  /** How much a round must lower SFB to be kept, in percentage points (0.004). */
  minGain?: number;
  log?: (line: string) => void;
}

export interface MagicResult {
  layout: Layout;
  score: EngineScore;
  /** What the magic keys do, for the layout's description. */
  description: string;
}

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });

interface Found {
  layout: Layout;
  score: EngineScore;
  note: string;
}

function clone(layout: Layout): Layout {
  return structuredClone(layout);
}

/** The base and `alpha2` bindings of a generated layout, by reference, so they can be changed. */
function layers(layout: Layout): {
  base: Record<string, Binding>;
  alpha2: Record<string, Binding> | null;
} {
  const base = layout.layers[0].bindings;
  const alpha2 = layout.layers.find((l) => l.id === 'alpha2')?.bindings ?? null;
  return { base, alpha2 };
}

/** A key's own symbol: what it types when no trigger matches. */
function ownSymbol(b: Binding | undefined): string | null {
  if (!b) return null;
  if (b.kind === 'kp') return b.symbol ?? null;
  if (b.kind === 'adaptive' && b.default?.kind === 'kp') return b.default.symbol ?? null;
  return null;
}

function triggersOf(b: Binding | undefined): AdaptiveTrigger[] {
  return b?.kind === 'adaptive' ? (b.triggers ?? []) : [];
}

/** Add `after → output` to a key, making it adaptive if it is plain; null if it cannot take it. */
function withTrigger(b: Binding | undefined, after: string, output: string): Binding | null {
  const own = ownSymbol(b);
  if (own === null || own === output) return null;
  const existing = triggersOf(b);
  if (existing.some((t) => t.afterAny?.includes(after))) return null;
  return {
    kind: 'adaptive',
    default: kp(own),
    triggers: [...existing, { afterAny: [after], binding: kp(output) }],
  };
}

export function searchMagic(start: Layout, sample: Sample, opts: MagicOptions): MagicResult | null {
  const board = board3x5();
  const maxKeys = opts.maxKeys ?? 4;
  const maxTriggers = opts.maxTriggers ?? 6;
  const minGain = opts.minGain ?? 0.004;
  const log = opts.log ?? (() => {});
  const symbolSet = new Set(sample.symbols);

  let current = clone(start);
  let score = scoreLayout(current, sample);
  const base0 = score;
  const notes: string[] = [];
  let triggers = 0;

  const adaptiveCount = (layout: Layout): number =>
    Object.values(layers(layout).base).filter((b) => b.kind === 'adaptive').length;

  /** Cheap base keys that can host a trigger: plain, or already magic. */
  const hosts = (): string[] => {
    const { base } = layers(current);
    return board.keys
      .filter((k) => !k.thumb && k.cost <= 1 && ownSymbol(base[k.id]) !== null)
      .map((k) => k.id);
  };

  /** The base key that types `symbol` on its own. */
  const keyOf = (symbol: string): string | null => {
    const { base } = layers(current);
    for (const [id, b] of Object.entries(base)) {
      if (ownSymbol(b) === symbol && !board.byId.get(id)?.thumb) return id;
    }
    return null;
  };

  while (triggers < maxTriggers) {
    const pairs = score.sfbItems
      .map((item) => ({ item, chars: [...item.label] }))
      .filter(({ chars }) => chars.length === 2 && chars.every((c) => symbolSet.has(c)))
      .slice(0, 12);
    let best: Found | null = null;
    const consider = (candidate: Layout, note: string): void => {
      if (adaptiveCount(candidate) > maxKeys) return;
      const s = scoreLayout(candidate, sample);
      if (s.effort >= opts.effortCap) return;
      if (s.missing.length !== score.missing.length) return;
      if (s.tapsPer100 > score.tapsPer100 + 0.5) return;
      if (!best || s.sfb < best.score.sfb) best = { layout: candidate, score: s, note };
    };
    for (const { item, chars } of pairs) {
      const [a, b] = chars;
      const fingerOfA = board.keys[item.keys[0]]?.finger;
      for (const host of hosts()) {
        const key = board.byId.get(host);
        if (!key || key.finger === fingerOfA) continue;
        const { base } = layers(current);
        const hosted = withTrigger(base[host], a, b);
        if (!hosted) continue;
        const own = ownSymbol(base[host]) as string;

        // One way: the host's own symbol falls back to a plain key on alpha2.
        {
          const candidate = clone(current);
          const { base: cb, alpha2 } = layers(candidate);
          cb[host] = hosted;
          if (alpha2) {
            if (!Object.values(alpha2).some((x) => x.kind === 'kp' && x.symbol === own)) {
              const free = board.keys
                .filter((k) => !k.thumb && !alpha2[k.id])
                .sort((x, y) => x.cost - y.cost)[0];
              if (free) alpha2[free.id] = kp(own);
            }
            consider(candidate, `${host} types ${own}, after ${a} types ${b}`);
          }
        }

        // The other: the pair's own key answers, typing the host's symbol after the same trigger.
        const answer = keyOf(b);
        if (answer && answer !== host) {
          const candidate = clone(current);
          const { base: cb } = layers(candidate);
          const answering = withTrigger(cb[answer], a, own);
          if (answering) {
            cb[host] = hosted;
            cb[answer] = answering;
            consider(
              candidate,
              `${host} types ${own} but ${b} after ${a}, and ${answer} types ${b} but ${own} after ${a}`,
            );
          }
        }
      }
    }
    // Read through a const: `best` is set inside `consider`, which the flow analysis cannot see.
    const found = best as Found | null;
    if (!found || score.sfb - found.score.sfb < minGain) break;
    current = found.layout;
    score = found.score;
    triggers++;
    notes.push(found.note);
    log(
      `  magic: ${found.note} → Effort ${score.effort.toFixed(2)} SFB ${score.sfb.toFixed(3)}% ` +
        `taps/100 ${score.tapsPer100.toFixed(2)}`,
    );
  }

  if (notes.length === 0) return null;
  return {
    layout: current,
    score,
    description:
      `magic keys (${notes.join('; ')}) take SFB from ${base0.sfb.toFixed(3)}% to ` +
      `${score.sfb.toFixed(3)}%`,
  };
}
