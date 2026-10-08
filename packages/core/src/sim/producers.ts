import { deadKeyCompositions } from '../host/locale.js';
import type { CompiledLayout } from '../layout/compile.js';
import type { Binding, Mod } from '../layout/types.js';
import type { ProducerKind } from './machine.js';

export interface ProducerStep {
  /** Layer whose binding must handle the press (null for chords). */
  layer: number | null;
  /** Position index (physical key, or chord virtual position). */
  pos: number;
  /** Binding object expected at that position (identity check after resolution). */
  binding: Binding;
  /** A hold is pressed past the tapping term and let go: what a tap-hold's hold does. */
  mode: 'tap' | 'hold' | 'chord';
  taps: number;
  combo?: number;
}

export interface Producer {
  id: string;
  /** Output string produced (lowercase in fold mode). */
  symbols: string;
  kind: ProducerKind;
  steps: ProducerStep[];
  /** Applicability conditions. */
  afterAny?: string[];
  /** Applicable only after a press whose binding carried one of these tags. */
  afterTags?: string[];
  /** Modifiers the producer needs held. Always a list, never undefined. */
  mods: Mod[];
  /**
   * A dead-key producer's modifiers for the accent itself, a dead key's shifted half; `mods` then
   * belong to the letter it accents.
   */
  deadMods?: Mod[];
  /** Estimated physical presses including one layer activation when off the base layer. */
  cost: number;
  /** True when the producer is a dynamic branch (adaptive/repeat) whose output depends on state. */
  dynamic: boolean;
}

interface StaticOutput {
  symbols: string;
  afterAny?: string[];
  afterTags?: string[];
  mods?: Mod[];
  taps: number;
  kind: ProducerKind;
  suffix: string;
  dynamic: boolean;
}

const MAX_DEPTH = 8;

/** Enumerate the textual outputs a binding can produce when tapped (static analysis). */
export function staticOutputs(b: Binding, depth = 0): StaticOutput[] {
  if (depth > MAX_DEPTH) return [];
  switch (b.kind) {
    case 'kp': {
      if (b.symbol === undefined) return [];
      const out: StaticOutput[] = [
        { symbols: b.symbol, taps: 1, kind: 'direct', suffix: '', dynamic: false },
      ];
      if (b.shifted !== undefined)
        out.push({
          symbols: b.shifted,
          taps: 1,
          kind: 'direct',
          suffix: '#shifted',
          mods: ['LSHIFT'],
          dynamic: false,
        });
      return out;
    }
    case 'unicode': {
      const out: StaticOutput[] = [
        { symbols: b.symbol, taps: 1, kind: 'direct', suffix: '', dynamic: false },
      ];
      if (b.shiftedSymbol)
        out.push({
          symbols: b.shiftedSymbol,
          taps: 1,
          kind: 'direct',
          suffix: '#shifted',
          mods: ['LSHIFT'],
          dynamic: false,
        });
      return out;
    }
    case 'macro': {
      const steps: Binding[] = [];
      if (b.steps) steps.push(...b.steps);
      else if (b.symbols !== undefined)
        for (const g of Array.from(b.symbols.normalize('NFC')))
          steps.push({ kind: 'kp', symbol: g });
      // `then` steps are side effects; they may also emit text (rare) — include them.
      if (b.then) steps.push(...b.then);
      let combos: { symbols: string; afterAny?: string[]; mods?: Mod[]; dynamic: boolean }[] = [
        { symbols: '', dynamic: false },
      ];
      for (const step of steps) {
        const outs = staticOutputs(step, depth + 1);
        if (outs.length === 0) {
          // Non-emitting step (layer change, mod) — keep going.
          if (emitsText(step)) return [];
          continue;
        }
        const next: typeof combos = [];
        for (const c of combos) {
          for (const o of outs) {
            if (o.mods?.length) continue; // shifted variants inside macros are not producers
            next.push({
              symbols: c.symbols + o.symbols,
              afterAny: c.afterAny ?? o.afterAny,
              dynamic: c.dynamic || o.dynamic,
            });
          }
        }
        combos = next;
        if (combos.length > 8) combos = combos.slice(0, 8);
      }
      return combos
        .filter((c) => c.symbols.length > 0)
        .map((c, i) => ({
          symbols: c.symbols,
          taps: 1,
          kind: 'macro' as ProducerKind,
          suffix: i ? `#${i}` : '',
          afterAny: c.afterAny,
          dynamic: c.dynamic,
        }));
    }
    case 'adaptive': {
      const out: StaticOutput[] = [];
      (b.triggers ?? []).forEach((t, i) => {
        for (const o of staticOutputs(t.binding, depth + 1)) {
          out.push({
            ...o,
            kind: o.kind === 'direct' || o.kind === 'macro' ? 'adaptive' : o.kind,
            afterAny: o.afterAny ?? t.afterAny,
            afterTags: o.afterTags ?? t.afterTags,
            suffix: `#t${i}${o.suffix}`,
            dynamic: true,
          });
        }
      });
      if (b.default) {
        for (const o of staticOutputs(b.default, depth + 1)) {
          out.push({
            ...o,
            kind: o.kind === 'direct' || o.kind === 'macro' ? 'adaptive' : o.kind,
            suffix: `#default${o.suffix}`,
            dynamic: true,
          });
        }
      }
      return out;
    }
    case 'key_repeat':
      return [{ symbols: '', taps: 1, kind: 'repeat', suffix: '', dynamic: true }];
    case 'hold_tap':
      return staticOutputs(b.tap, depth + 1);
    case 'lt':
      return staticOutputs(b.tap, depth + 1);
    case 'mod_morph': {
      const out = staticOutputs(b.default, depth + 1);
      for (const o of staticOutputs(b.morphed, depth + 1))
        out.push({ ...o, mods: [...(o.mods ?? []), ...b.mods], suffix: `#morph${o.suffix}` });
      return out;
    }
    case 'layer_morph': {
      const out = staticOutputs(b.inactive, depth + 1);
      for (const o of staticOutputs(b.active, depth + 1))
        out.push({ ...o, suffix: `#lm${o.suffix}`, dynamic: true });
      return out;
    }
    case 'tap_dance': {
      const out: StaticOutput[] = [];
      b.bindings.forEach((x, i) => {
        for (const o of staticOutputs(x, depth + 1))
          out.push({ ...o, taps: i + 1, suffix: `#td${i + 1}${o.suffix}` });
      });
      return out;
    }
    default:
      return [];
  }
}

/**
 * What a binding types when held: a tap-hold's hold, which can be any behaviour a tap can, found
 * through the morphs that pick between arms. A tap dance on a hold has one tap only.
 */
export function holdOutputs(b: Binding, depth = 0): StaticOutput[] {
  if (depth > MAX_DEPTH) return [];
  switch (b.kind) {
    case 'hold_tap':
      return staticOutputs(b.hold, depth + 1)
        .filter((o) => o.taps === 1)
        .map((o) => ({ ...o, suffix: `#hold${o.suffix}` }));
    case 'mod_morph': {
      const out = holdOutputs(b.default, depth + 1);
      for (const o of holdOutputs(b.morphed, depth + 1))
        out.push({ ...o, mods: [...(o.mods ?? []), ...b.mods], suffix: `#morph${o.suffix}` });
      return out;
    }
    case 'layer_morph': {
      const out = holdOutputs(b.inactive, depth + 1);
      for (const o of holdOutputs(b.active, depth + 1))
        out.push({ ...o, suffix: `#lm${o.suffix}`, dynamic: true });
      return out;
    }
    default:
      return [];
  }
}

function emitsText(b: Binding): boolean {
  return (
    b.kind === 'kp' ||
    b.kind === 'unicode' ||
    b.kind === 'key_repeat' ||
    b.kind === 'adaptive' ||
    b.kind === 'macro' ||
    b.kind === 'dead_key'
  );
}

export interface ProducerIndex {
  /** symbol string → producers (default order). */
  bySymbol: Map<string, Producer[]>;
  byId: Map<string, Producer>;
  /** Longest multi-symbol string length. */
  maxLen: number;
  /** First graphemes of multi-grapheme producer strings. */
  multiStarts: Set<string>;
  /** Producers requiring explicit modifiers or uppercase context (excluded in fold mode). */
  excludedByCase: Producer[];
}

function graphemeLength(s: string): number {
  return Array.from(s).length;
}

/**
 * Enumerate every way to produce each symbol string on the layout.
 */
export function enumerateProducers(
  compiled: CompiledLayout,
  caseMode: 'fold' | 'model',
): ProducerIndex {
  const bySymbol = new Map<string, Producer[]>();
  const byId = new Map<string, Producer>();
  const excludedByCase: Producer[] = [];
  const add = (p: Producer) => {
    byId.set(p.id, p);
    const list = bySymbol.get(p.symbols) ?? [];
    list.push(p);
    bySymbol.set(p.symbols, list);
  };
  const fold = caseMode === 'fold';

  for (const layer of compiled.layers) {
    for (let pos = 0; pos < compiled.keys.length; pos++) {
      const b = layer.bindings[pos];
      if (b.kind === 'trans' || b.kind === 'none') continue;
      const keyId = compiled.keys[pos].id;
      const tapped = staticOutputs(b).map((o) => ['tap', o] as const);
      const held = holdOutputs(b).map((o) => ['hold', o] as const);
      for (const [mode, o] of [...tapped, ...held]) {
        const base =
          o.kind === 'repeat'
            ? 'repeat'
            : o.kind === 'adaptive'
              ? 'adaptive'
              : o.kind === 'macro'
                ? 'macro'
                : 'direct';
        const id = `${base}:${layer.id}/${keyId}${o.suffix}`;
        const symbols = fold ? o.symbols.toLowerCase() : o.symbols;
        const p: Producer = {
          id,
          symbols,
          kind: o.kind,
          steps: [{ layer: layer.idx, pos, binding: b, mode, taps: o.taps }],
          afterAny: o.afterAny,
          afterTags: o.afterTags,
          mods: o.mods ?? [],
          cost: o.taps + (layer.idx === 0 ? 0 : 1) + (o.mods?.length ? 1 : 0),
          dynamic: o.dynamic,
        };
        if (fold && o.mods?.length) {
          excludedByCase.push(p);
          continue;
        }
        if (fold && o.afterAny?.every((a) => a !== a.toLowerCase()) && o.afterAny.length) {
          // Trigger only reachable after an uppercase symbol → unreachable in fold mode.
          excludedByCase.push(p);
          continue;
        }
        if (o.kind === 'repeat') {
          p.symbols = '';
        }
        add(p);
      }
    }
  }
  for (const c of compiled.combos) {
    if (c.role !== 'typing') continue;
    for (const o of staticOutputs(c.binding)) {
      if (o.mods?.length) continue;
      const p: Producer = {
        id: `combo:${c.id}${o.suffix}`,
        symbols: fold ? o.symbols.toLowerCase() : o.symbols,
        kind: 'combo',
        steps: [
          { layer: null, pos: c.pos, binding: c.binding, mode: 'chord', taps: 1, combo: c.idx },
        ],
        afterAny: o.afterAny,
        afterTags: o.afterTags,
        mods: [],
        cost: 1.5,
        dynamic: o.dynamic,
      };
      add(p);
    }
  }
  for (const p of deadKeyProducers(compiled, bySymbol, fold)) {
    // A shifted accent needs a modifier, like a shifted symbol: out of reach when case is folded.
    if (fold && p.deadMods?.length) excludedByCase.push(p);
    else add(p);
  }
  // Default ordering: cheapest first, then non-dynamic before dynamic, then non-combo.
  for (const [, list] of bySymbol) {
    list.sort(
      (a, b) =>
        a.cost - b.cost ||
        Number(a.dynamic) - Number(b.dynamic) ||
        Number(a.kind === 'combo') - Number(b.kind === 'combo') ||
        // Byte order, not locale order: this tie-break decides which producer types a symbol, and
        // the pinned reports depend on it.
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  }
  let maxLen = 1;
  const multiStarts = new Set<string>();
  for (const s of bySymbol.keys()) {
    const n = graphemeLength(s);
    if (n > 1) {
      maxLen = Math.max(maxLen, n);
      multiStarts.add(Array.from(s)[0]);
    }
  }
  return { bySymbol, byId, maxLen, multiStarts, excludedByCase };
}

/** The dead key a binding presses when tapped, past a tap-hold's or layer-tap's tap arm. */
function tappedDeadKey(b: Binding): Extract<Binding, { kind: 'dead_key' }> | null {
  if (b.kind === 'dead_key') return b;
  if (b.kind === 'hold_tap' || b.kind === 'lt') return tappedDeadKey(b.tap);
  return null;
}

/**
 * A dead key, then the letter it accents: one producer per dead key and per way of typing a letter
 * it composes with. Only plain, tapped letters count — an adaptive key's or a repeat's output
 * depends on what came before, and a held letter would hold through the accent. A dead key's shifted accent is
 * a way of its own, with shift on for the accent.
 */
function deadKeyProducers(
  compiled: CompiledLayout,
  bySymbol: Map<string, Producer[]>,
  fold: boolean,
): Producer[] {
  const out: Producer[] = [];
  for (const layer of compiled.layers) {
    for (let pos = 0; pos < compiled.keys.length; pos++) {
      const b = layer.bindings[pos];
      const dk = tappedDeadKey(b);
      if (!dk) continue;
      const keyId = compiled.keys[pos].id;
      const accents: [string, string, Mod[]][] = [[dk.diacritic, '', []]];
      if (dk.shifted !== undefined) accents.push([dk.shifted, '#shifted', ['LSHIFT']]);
      for (const [diacritic, suffix, deadMods] of accents) {
        const deadCost = 1 + (layer.idx === 0 ? 0 : 1) + deadMods.length;
        for (const [base, composed] of deadKeyCompositions(diacritic)) {
          if (fold && base !== base.toLowerCase()) continue;
          for (const letter of bySymbol.get(base) ?? []) {
            if (letter.kind !== 'direct' && letter.kind !== 'combo') continue;
            if (letter.dynamic || letter.mods.length || letter.afterAny || letter.afterTags)
              continue;
            if (letter.steps.some((s) => s.mode === 'hold')) continue;
            out.push({
              id: `deadkey:${layer.id}/${keyId}${suffix}+${letter.id}`,
              symbols: fold ? composed.toLowerCase() : composed,
              kind: 'deadkey',
              steps: [{ layer: layer.idx, pos, binding: b, mode: 'tap', taps: 1 }, ...letter.steps],
              mods: [],
              ...(deadMods.length ? { deadMods } : {}),
              cost: deadCost + letter.cost,
              dynamic: false,
            });
          }
        }
      }
    }
  }
  return out;
}

/** Repeat-key producers (output depends on the previous symbol). */
export function repeatProducers(index: ProducerIndex): Producer[] {
  return index.bySymbol.get('') ?? [];
}
