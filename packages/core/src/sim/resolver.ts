import { keyDistance } from '../geometry/distance.js';
import { FINGERS, type Finger } from '../geometry/types.js';
import type { CompiledLayout } from '../layout/compile.js';
import type { ActivatorDef, Binding, Mod, TypingPathEntry } from '../layout/types.js';
import {
  LogicalKeyRegistry,
  NgramAccumulator,
  type FingerTravel,
  type RunStats,
  type SimulationStats,
  type SimulationTables,
  type WordTrace,
} from '../tables/tables.js';
import { Machine, peelBinding, type Action, type KeyEvent } from './machine.js';
import { enumerateProducers, repeatProducers, type Producer, type ProducerIndex } from './producers.js';

export interface SimulateOptions {
  caseMode: 'fold' | 'model';
  crossWord: 'reset' | 'bridge';
  repeatPolicy?: 'repeatKey' | 'tapTwice';
  typingPaths?: Record<string, TypingPathEntry[]>;
  activators?: Record<string, ActivatorDef[]>;
  /** Symbols treated as soft boundaries when unproducible (not counted as coverage failures). */
  softSymbols?: string[];
  maxSymbols?: number;
  collectEvents?: boolean;
  /** Per-key effort is not needed here; kept for API symmetry. */
  producerIndex?: ProducerIndex;
}

export interface Coverage {
  unproducible: Map<string, number>;
  softDropped: Map<string, number>;
  excludedByCase: string[];
}

export interface SimulationResult {
  tables: SimulationTables;
  coverage: Coverage;
  events?: KeyEvent[];
  producers: ProducerIndex;
}

interface ActivatorCandidate {
  pos: number;
  viaLayer: number;
  mode: 'tap' | 'hold';
  target: number;
  user: boolean;
  order: number;
  /** Modifiers that must be active for this arm of the binding to be selected (mod-morph arms). */
  requiredMods?: Mod[];
  /** Source layer restriction (user-declared activators). */
  from?: number;
}

interface LayerTarget {
  mode: 'tap' | 'hold';
  target: number;
  kind: string;
  requiredMods?: Mod[];
}

function collectLayerTargets(compiled: CompiledLayout, b: Binding, mode: 'tap' | 'hold', out: LayerTarget[], depth = 0, requiredMods?: Mod[]): void {
  if (depth > 8) return;
  const li = (id: string) => compiled.layerIndex.get(id);
  switch (b.kind) {
    case 'sl':
    case 'tog':
    case 'to': {
      const t = li(b.layer);
      if (t !== undefined && mode === 'tap') out.push({ mode, target: t, kind: b.kind, requiredMods });
      return;
    }
    case 'mo': {
      const t = li(b.layer);
      if (t !== undefined && mode === 'hold') out.push({ mode, target: t, kind: 'mo', requiredMods });
      return;
    }
    case 'lt': {
      const t = li(b.layer);
      if (mode === 'hold') {
        if (t !== undefined) out.push({ mode, target: t, kind: 'lt', requiredMods });
      } else collectLayerTargets(compiled, b.tap, mode, out, depth + 1, requiredMods);
      return;
    }
    case 'hold_tap':
      collectLayerTargets(compiled, mode === 'hold' ? b.hold : b.tap, mode, out, depth + 1, requiredMods);
      return;
    case 'mod_morph':
      collectLayerTargets(compiled, b.default, mode, out, depth + 1, requiredMods);
      collectLayerTargets(compiled, b.morphed, mode, out, depth + 1, [...(requiredMods ?? []), b.mods[0]]);
      return;
    case 'layer_morph':
      collectLayerTargets(compiled, b.inactive, mode, out, depth + 1, requiredMods);
      collectLayerTargets(compiled, b.active, mode, out, depth + 1, requiredMods);
      return;
    case 'tap_dance':
      if (b.bindings[0]) collectLayerTargets(compiled, b.bindings[0], mode, out, depth + 1, requiredMods);
      return;
    case 'adaptive':
      if (b.default) collectLayerTargets(compiled, b.default, mode, out, depth + 1, requiredMods);
      return;
    default:
      return;
  }
}

const KIND_ORDER: Record<string, number> = { sl: 0, mo: 1, lt: 1, tog: 2, to: 3 };

function graphemes(s: string): string[] {
  return Array.from(s);
}

export function findHomeKeys(compiled: CompiledLayout): Record<Finger, number> {
  const home = {} as Record<Finger, number>;
  for (const f of FINGERS) {
    let best = -1;
    let bestScore = Infinity;
    compiled.keys.forEach((k, i) => {
      if (k.finger !== f) return;
      let score: number;
      if (k.thumb) score = k.col; // innermost thumb is the resting thumb key
      else score = (k.home ? 0 : 10) + Math.abs(k.row - 1);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best < 0 && f.endsWith('T')) best = compiled.spaceKey;
    home[f] = best;
  }
  return home;
}

/**
 * Text → physical key events → n-gram tables (SPEC §5.4–§5.6).
 */
export class Simulator {
  readonly machine: Machine;
  readonly index: ProducerIndex;
  private readonly activators = new Map<number, ActivatorCandidate[]>();
  private readonly userPaths = new Map<string, TypingPathEntry[]>();
  private readonly plannerHolds = new Set<number>();
  private readonly fold: boolean;
  private readonly repeatPolicy: 'repeatKey' | 'tapTwice';

  // accumulation
  readonly registry = new LogicalKeyRegistry();
  private readonly noSpace = new NgramAccumulator();
  private readonly withSpace = new NgramAccumulator();
  private readonly runs: RunStats = { handRuns: [], handStrings: new Map(), fingerRuns: [], layerRuns: [] };
  private readonly words = new Map<string, WordTrace>();
  private readonly travel: FingerTravel;
  private readonly homeKeys: Record<Finger, number>;
  private readonly lastFingerPos: Record<Finger, number>;
  private readonly lastFingerPosWord: Record<Finger, number>;
  private readonly stats: SimulationStats;
  private runHand: 'L' | 'R' | 'both' | null = null;
  private runLen = 0;
  private runLabels: string[] = [];
  private runFinger: Finger | null = null;
  private runFingerLen = 0;
  private runLayer = -1;
  private runLayerLen = 0;
  private curWord: string[] = [];
  private curWordKeys: number[] = [];
  private curWordPresses = 0;
  readonly events: KeyEvent[] = [];
  private readonly collectEvents: boolean;
  private readonly softSymbols: Set<string>;
  readonly coverage: Coverage;

  constructor(readonly compiled: CompiledLayout, readonly options: SimulateOptions) {
    this.machine = new Machine(compiled);
    this.fold = options.caseMode === 'fold';
    this.index = options.producerIndex ?? enumerateProducers(compiled, options.caseMode);
    this.repeatPolicy = options.repeatPolicy ?? compiled.layout.repeatPolicy?.doubledLetters ?? 'repeatKey';
    this.collectEvents = options.collectEvents ?? false;
    this.softSymbols = new Set(options.softSymbols ?? ['?', '!']);
    this.coverage = { unproducible: new Map(), softDropped: new Map(), excludedByCase: this.index.excludedByCase.map((p) => p.id) };
    for (const [sym, entries] of Object.entries(options.typingPaths ?? compiled.layout.typingPaths ?? {})) {
      this.userPaths.set(this.fold ? sym.toLocaleLowerCase() : sym, entries);
    }
    this.discoverActivators(options.activators ?? compiled.layout.activators ?? {});
    this.homeKeys = findHomeKeys(compiled);
    this.lastFingerPos = { ...this.homeKeys };
    this.lastFingerPosWord = { ...this.homeKeys };
    const zero = () => Object.fromEntries(FINGERS.map((f) => [f, 0])) as Record<Finger, number>;
    this.travel = { continuous: zero(), resetAtWord: zero(), usage: zero() };
    this.stats = {
      symbols: 0,
      words: 0,
      keystrokes: 0,
      spacePresses: 0,
      layerTaps: 0,
      oneShotActivations: 0,
      wastedOneShots: 0,
      holdPresses: 0,
      chords: 0,
      macroPresses: 0,
      adaptivePresses: 0,
      adaptiveTriggerHits: 0,
      repeatPresses: 0,
      perLayer: compiled.layers.map(() => 0),
      unproducible: this.coverage.unproducible,
    };
  }

  private discoverActivators(user: Record<string, ActivatorDef[]>): void {
    const c = this.compiled;
    let order = 0;
    for (const layer of c.layers) {
      for (let pos = 0; pos < c.keys.length; pos++) {
        const b = layer.bindings[pos];
        if (b.kind === 'trans' || b.kind === 'none') continue;
        for (const mode of ['tap', 'hold'] as const) {
          const targets: LayerTarget[] = [];
          collectLayerTargets(c, b, mode, targets);
          for (const t of targets) {
            const list = this.activators.get(t.target) ?? [];
            list.push({
              pos,
              viaLayer: layer.idx,
              mode,
              target: t.target,
              user: false,
              order: (KIND_ORDER[t.kind] ?? 5) * 1000 + (t.requiredMods?.length ? 500 : 0) + order++,
              requiredMods: t.requiredMods,
            });
            this.activators.set(t.target, list);
          }
        }
      }
    }
    for (const [targetId, defs] of Object.entries(user)) {
      const target = c.layerIndex.get(targetId);
      if (target === undefined) continue;
      defs.forEach((d, i) => {
        const m = /^key:([^/]+)\/(.+)$/.exec(d.via);
        if (!m) return;
        const viaLayer = c.layerIndex.get(m[1]);
        const pos = c.keyIndex.get(m[2]);
        if (viaLayer === undefined || pos === undefined) return;
        const list = this.activators.get(target) ?? [];
        const existing = list.find((a) => a.pos === pos && a.viaLayer === viaLayer);
        const mode = existing?.mode ?? 'tap';
        const cand: ActivatorCandidate = {
          pos,
          viaLayer,
          mode,
          target,
          user: true,
          order: -1000 + i,
          requiredMods: d.requires?.mods ?? existing?.requiredMods,
        };
        if (d.from && d.from !== '*') cand.from = c.layerIndex.get(d.from);
        list.unshift(cand);
        this.activators.set(target, list);
      });
    }
    for (const list of this.activators.values()) list.sort((a, b) => a.order - b.order);
  }

  // ---------------------------------------------------------------- planning

  private candidatesFor(token: string): Producer[] {
    const out: Producer[] = [];
    const last = this.machine.state.lastSymbol;
    const lastCmp = last === null ? null : this.fold ? last.toLocaleLowerCase() : last;
    if (this.repeatPolicy === 'repeatKey' && lastCmp !== null && lastCmp === token) {
      out.push(...repeatProducers(this.index));
    }
    const base = this.index.bySymbol.get(token) ?? [];
    if (!this.fold) {
      const lower = token.toLocaleLowerCase();
      if (lower !== token) {
        const lowerProducers = this.index.bySymbol.get(lower) ?? [];
        out.push(...lowerProducers);
        out.push(...base);
        for (const p of lowerProducers) {
          if (p.kind === 'combo' || p.kind === 'repeat') continue;
          out.push({ ...p, id: `${p.id}+shift`, mods: [...(p.mods ?? []), 'LSHIFT'], cost: p.cost + 1 });
        }
        return this.applyUserOrder(lower, out);
      }
    }
    out.push(...base);
    return this.applyUserOrder(token, out);
  }

  private applyUserOrder(symbol: string, list: Producer[]): Producer[] {
    const entries = this.userPaths.get(symbol);
    if (!entries || !list.length) return list;
    const byId = new Map(list.map((p) => [p.id, p]));
    const ordered: Producer[] = [];
    const disabled = new Set<string>();
    const last = this.machine.state.lastSymbol;
    for (const e of entries) {
      if (e.enabled === false) {
        disabled.add(e.producer);
        continue;
      }
      if (e.when?.afterAny && (last === null || !e.when.afterAny.some((a) => a === last || a.toLocaleLowerCase() === last.toLocaleLowerCase()))) {
        disabled.add(e.producer);
        continue;
      }
      const p = byId.get(e.producer);
      if (p && !ordered.includes(p)) ordered.push(p);
    }
    for (const p of list) if (!ordered.includes(p) && !disabled.has(p.id)) ordered.push(p);
    return ordered;
  }

  private activate(target: number, events: KeyEvent[], depth: number): boolean {
    if (depth > 2) return false;
    const m = this.machine;
    if (m.isLayerActive(target)) return true;
    const list = this.activators.get(target);
    if (!list) return false;
    const top = m.highestActiveLayer();
    const ranked = [...list].sort((a, b) => {
      const aOk = a.from === undefined || a.from === top ? 0 : 1;
      const bOk = b.from === undefined || b.from === top ? 0 : 1;
      if (aOk !== bOk) return aOk - bOk;
      const aTop = a.viaLayer === top ? 0 : m.isLayerActive(a.viaLayer) ? 1 : 2;
      const bTop = b.viaLayer === top ? 0 : m.isLayerActive(b.viaLayer) ? 1 : 2;
      if (aTop !== bTop) return aTop - bTop;
      return a.order - b.order;
    });
    for (const cand of ranked) {
      if (cand.from !== undefined && cand.from !== top) continue;
      const snap = m.state.snapshot();
      const startLen = events.length;
      const holdsBefore = new Set(this.plannerHolds);
      let ok = true;
      const modHolds: number[] = [];
      if (cand.requiredMods && cand.requiredMods.length) ok = this.ensureMods(cand.requiredMods, events, modHolds);
      if (ok && !m.isLayerActive(cand.viaLayer)) ok = this.activate(cand.viaLayer, events, depth + 1);
      if (ok) {
        const r = m.resolve(cand.pos);
        if (r.layer !== cand.viaLayer) ok = false;
        else {
          const peeled = peelBinding(m, r.binding, cand.mode);
          const kinds = cand.mode === 'hold' ? ['mo', 'lt'] : ['sl', 'tog', 'to', 'adaptive', 'macro'];
          if (!kinds.includes(peeled.kind)) ok = false;
        }
      }
      if (ok) {
        const action: Action = cand.mode === 'hold' ? { type: 'holdPress', pos: cand.pos } : { type: 'tap', pos: cand.pos };
        const evs = m.perform(action);
        if (evs.some((e) => e.symbols.length)) ok = false;
        else {
          events.push(...evs);
          if (cand.mode === 'hold') this.plannerHolds.add(cand.pos);
        }
      }
      if (ok && m.isLayerActive(target)) {
        // Held modifiers used only to select the activator arm are released after the producer step.
        for (const pos of modHolds) this.plannerHolds.add(pos);
        return true;
      }
      m.state.restore(snap);
      m.recomputeMask();
      events.length = startLen;
      this.plannerHolds.clear();
      for (const p of holdsBefore) this.plannerHolds.add(p);
    }
    return false;
  }

  private ensureMods(mods: Mod[], events: KeyEvent[], holdsOut: number[]): boolean {
    const m = this.machine;
    for (const mod of mods) {
      if (m.activeMods().has(mod)) continue;
      const isShift = mod === 'LSHIFT' || mod === 'RSHIFT';
      const sk = this.compiled.shiftKey;
      if (isShift && sk) {
        const r = m.resolve(sk.key);
        const peeled = peelBinding(m, r.binding, sk.kind === 'hold' ? 'hold' : 'tap');
        if (sk.kind === 'sk' && (peeled.kind === 'sk' || peeled.kind === 'mod_morph' || peeled.kind === 'adaptive')) {
          events.push(...m.perform({ type: 'tap', pos: sk.key }));
        } else if (sk.kind === 'hold' && peeled.kind === 'mod') {
          events.push(...m.perform({ type: 'holdPress', pos: sk.key }));
          holdsOut.push(sk.key);
        } else return false;
        if (!m.activeMods().has(mod)) return false;
        continue;
      }
      // Search active layers for a sticky or held modifier key.
      let found = false;
      for (let pos = 0; pos < this.compiled.keys.length && !found; pos++) {
        const r = m.resolve(pos);
        const tapPeeled = peelBinding(m, r.binding, 'tap');
        if (tapPeeled.kind === 'sk' && tapPeeled.mod === mod) {
          events.push(...m.perform({ type: 'tap', pos }));
          found = true;
          break;
        }
        const holdPeeled = peelBinding(m, r.binding, 'hold');
        if (holdPeeled.kind === 'mod' && holdPeeled.mod === mod) {
          events.push(...m.perform({ type: 'holdPress', pos }));
          holdsOut.push(pos);
          found = true;
          break;
        }
      }
      if (!found || !m.activeMods().has(mod)) return false;
    }
    return true;
  }

  private tryProducer(p: Producer, token: string): KeyEvent[] | null {
    const m = this.machine;
    const snap = m.state.snapshot();
    const events: KeyEvent[] = [];
    const modHolds: number[] = [];
    let ok = true;
    if (p.mods && p.mods.length) ok = this.ensureMods(p.mods, events, modHolds);
    for (const step of p.steps) {
      if (!ok) break;
      if (step.mode === 'chord') {
        if (step.combo === undefined || !m.comboAvailable(step.combo)) {
          ok = false;
          break;
        }
        events.push(...m.perform({ type: 'chord', combo: step.combo }));
        continue;
      }
      let r = m.resolve(step.pos);
      if (!(r.layer === step.layer && r.binding === step.binding)) {
        if (step.layer === null || !this.activate(step.layer, events, 0)) {
          ok = false;
          break;
        }
        r = m.resolve(step.pos);
        if (!(r.layer === step.layer && r.binding === step.binding)) {
          ok = false;
          break;
        }
      }
      events.push(...m.perform({ type: 'tap', pos: step.pos, taps: step.taps }));
    }
    for (const pos of modHolds) events.push(...m.perform({ type: 'holdRelease', pos }));
    if (ok) {
      const emitted = events.map((e) => e.symbols).join('');
      ok = this.fold ? emitted.toLocaleLowerCase() === token : emitted === token;
    }
    if (!ok) {
      m.state.restore(snap);
      m.recomputeMask();
      for (const pos of modHolds) this.plannerHolds.delete(pos);
      return null;
    }
    for (const e of events) if (e.producerKind === undefined) e.producerKind = p.kind;
    return events;
  }

  private releaseHolds(): KeyEvent[] {
    const out: KeyEvent[] = [];
    for (const pos of this.plannerHolds) out.push(...this.machine.perform({ type: 'holdRelease', pos }));
    this.plannerHolds.clear();
    return out;
  }

  // ------------------------------------------------------------ accumulation

  private commit(events: KeyEvent[], isSpace: boolean): void {
    const c = this.compiled;
    for (const ev of events) {
      if (this.collectEvents) this.events.push(ev);
      if (ev.kind === 'holdRelease') continue;
      const st = this.stats;
      st.keystrokes++;
      st.perLayer[ev.layer] = (st.perLayer[ev.layer] ?? 0) + 1;
      if (ev.kind === 'holdPress') st.holdPresses++;
      if (ev.kind === 'chord') st.chords++;
      if (ev.keyKind === 'layerTap') st.layerTaps++;
      if (ev.leafKind === 'sl') st.oneShotActivations++;
      if (ev.wastedOneShot) st.wastedOneShots++;
      if (ev.leafKind === 'macro') st.macroPresses++;
      if (ev.keyKind === 'magic') {
        st.adaptivePresses++;
        if (ev.producerKind === 'adaptive') st.adaptiveTriggerHits++;
      }
      if (ev.keyKind === 'repeat') st.repeatPresses++;
      if (ev.keyKind === 'space') st.spacePresses++;
      const id = this.registry.idFor(ev);
      this.withSpace.push(id);
      const pos = c.positions[ev.pos];
      // finger travel & usage
      for (const member of pos.members) {
        const key = c.keys[member];
        const f = key.finger;
        this.travel.usage[f]++;
        const prev = this.lastFingerPos[f];
        if (prev >= 0) this.travel.continuous[f] += keyDistance(c.keys[prev], key, 'euclid') ?? 0;
        this.lastFingerPos[f] = member;
        const prevW = this.lastFingerPosWord[f];
        if (prevW >= 0) this.travel.resetAtWord[f] += keyDistance(c.keys[prevW], key, 'euclid') ?? 0;
        this.lastFingerPosWord[f] = member;
      }
      if (ev.keyKind === 'space' || isSpace) continue;
      this.noSpace.push(id);
      this.curWordKeys.push(id);
      this.curWordPresses++;
      // same-hand runs
      const hand = pos.hand;
      if (hand === this.runHand && hand !== 'both') {
        this.runLen++;
        this.runLabels.push(ev.label);
      } else {
        this.flushHandRun();
        this.runHand = hand;
        this.runLen = hand === 'both' ? 0 : 1;
        this.runLabels = [ev.label];
      }
      const finger = pos.fingers.length === 1 ? pos.fingers[0] : null;
      if (finger !== null && finger === this.runFinger) this.runFingerLen++;
      else {
        this.flushFingerRun();
        this.runFinger = finger;
        this.runFingerLen = finger === null ? 0 : 1;
      }
      if (ev.layer === this.runLayer) this.runLayerLen++;
      else {
        this.flushLayerRun();
        this.runLayer = ev.layer;
        this.runLayerLen = 1;
      }
    }
  }

  private flushHandRun(): void {
    if (this.runLen > 0) {
      this.runs.handRuns[this.runLen] = (this.runs.handRuns[this.runLen] ?? 0) + 1;
      if (this.runLen >= 4) {
        const s = this.runLabels.join('');
        this.runs.handStrings.set(s, (this.runs.handStrings.get(s) ?? 0) + 1);
      }
    }
    this.runLen = 0;
    this.runLabels = [];
    this.runHand = null;
  }

  private flushFingerRun(): void {
    if (this.runFingerLen > 0) this.runs.fingerRuns[this.runFingerLen] = (this.runs.fingerRuns[this.runFingerLen] ?? 0) + 1;
    this.runFingerLen = 0;
    this.runFinger = null;
  }

  private flushLayerRun(): void {
    if (this.runLayerLen > 0 && this.runLayer > 0) this.runs.layerRuns[this.runLayerLen] = (this.runs.layerRuns[this.runLayerLen] ?? 0) + 1;
    this.runLayerLen = 0;
    this.runLayer = -1;
  }

  private wordBoundary(hard: boolean): void {
    if (this.curWord.length) {
      const w = this.curWord.join('');
      const t = this.words.get(w);
      if (t) t.count++;
      else this.words.set(w, { word: w, count: 1, presses: this.curWordPresses, keys: this.curWordKeys.slice() });
      this.stats.words++;
    }
    this.curWord = [];
    this.curWordKeys = [];
    this.curWordPresses = 0;
    if (this.options.crossWord === 'reset' || hard) {
      this.noSpace.boundary();
      this.flushHandRun();
      this.flushFingerRun();
      this.flushLayerRun();
    }
    if (hard) this.withSpace.boundary();
    for (const f of FINGERS) this.lastFingerPosWord[f] = this.homeKeys[f];
  }

  // ------------------------------------------------------------------ driver

  /** Candidate tokens at index i, longest first (multi-grapheme producer strings, then the single grapheme). */
  private tokenCandidates(stream: string[], i: number): [string, number][] {
    const first = stream[i];
    const out: [string, number][] = [];
    if (this.index.multiStarts.has(first)) {
      for (let len = Math.min(this.index.maxLen, stream.length - i); len >= 2; len--) {
        let s = '';
        let bad = false;
        for (let k = 0; k < len; k++) {
          const g = stream[i + k];
          if (g === ' ') {
            bad = true;
            break;
          }
          s += g;
        }
        if (!bad && this.index.bySymbol.has(s)) out.push([s, len]);
      }
    }
    out.push([first, 1]);
    return out;
  }

  private typeToken(token: string): boolean {
    let cands = this.candidatesFor(token);
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const p of cands) {
        const events = this.tryProducer(p, token);
        if (events) {
          this.commit(events, false);
          return true;
        }
      }
      if (this.plannerHolds.size === 0) break;
      this.commit(this.releaseHolds(), false);
      cands = this.candidatesFor(token);
    }
    return false;
  }

  private typeSpace(): void {
    const m = this.machine;
    const spaceKey = this.compiled.spaceKey;
    const snap = m.state.snapshot();
    let events = m.perform({ type: 'tap', pos: spaceKey });
    if (events.map((e) => e.symbols).join('') !== ' ') {
      m.state.restore(snap);
      m.recomputeMask();
      // Try releasing planner holds first, then fall back to a raw press (counts as space anyway).
      const rel = this.releaseHolds();
      this.commit(rel, false);
      events = m.perform({ type: 'tap', pos: spaceKey });
      if (events.map((e) => e.symbols).join('') !== ' ') {
        for (const e of events) {
          e.keyKind = 'space';
          e.symbols = ' ';
          e.label = '␣';
        }
      }
    }
    for (const e of events) if (e.symbols === ' ') e.keyKind = 'space';
    this.commit(events, true);
  }

  run(stream: string[]): SimulationResult {
    const max = this.options.maxSymbols ?? Infinity;
    let i = 0;
    let symbols = 0;
    while (i < stream.length && symbols < max) {
      const g = stream[i];
      if (g === ' ') {
        this.wordBoundary(false);
        this.typeSpace();
        i++;
        continue;
      }
      let consumed = 0;
      let typed = false;
      for (const [token, len] of this.tokenCandidates(stream, i)) {
        if (this.typeToken(token)) {
          this.curWord.push(token);
          this.stats.symbols += len;
          consumed = len;
          typed = true;
          break;
        }
        consumed = len;
      }
      if (!typed) {
        const token = stream[i];
        consumed = 1;
        const soft = this.softSymbols.has(token);
        const map = soft ? this.coverage.softDropped : this.coverage.unproducible;
        map.set(token, (map.get(token) ?? 0) + 1);
        this.wordBoundary(true);
      }
      symbols += consumed;
      i += consumed;
    }
    this.wordBoundary(false);
    this.commit(this.releaseHolds(), false);
    const tables: SimulationTables = {
      registry: this.registry,
      noSpace: this.noSpace.tables,
      withSpace: this.withSpace.tables,
      runs: this.runs,
      words: this.words,
      travel: this.travel,
      stats: this.stats,
    };
    return { tables, coverage: this.coverage, events: this.collectEvents ? this.events : undefined, producers: this.index };
  }
}

export function simulate(compiled: CompiledLayout, stream: string[], options: SimulateOptions): SimulationResult {
  return new Simulator(compiled, options).run(stream);
}

export interface ExplainStep {
  key: string;
  layer: string;
  finger: Finger | 'multi';
  kind: KeyEvent['kind'];
  keyKind: KeyEvent['keyKind'];
  label: string;
  symbols: string;
  wastedOneShot: boolean;
}

/** Trace how a word (or short text) is typed. */
export function explain(compiled: CompiledLayout, text: string, options: SimulateOptions): { steps: ExplainStep[]; coverage: Coverage; presses: number } {
  const stream = Array.from(text.normalize('NFC')).map((g) => (options.caseMode === 'fold' ? g.toLocaleLowerCase() : g));
  const sim = new Simulator(compiled, { ...options, collectEvents: true });
  const r = sim.run(stream);
  const steps: ExplainStep[] = (r.events ?? []).map((e) => {
    const pos = compiled.positions[e.pos];
    return {
      key: pos.id,
      layer: compiled.layers[e.layer]?.name ?? String(e.layer),
      finger: pos.fingers.length === 1 ? pos.fingers[0] : 'multi',
      kind: e.kind,
      keyKind: e.keyKind,
      label: e.label,
      symbols: e.symbols,
      wastedOneShot: e.wastedOneShot,
    };
  });
  return { steps, coverage: r.coverage, presses: steps.filter((s) => s.kind !== 'holdRelease').length };
}
