import { keyDistance } from '../geometry/distance.js';
import { FINGERS, type Finger } from '../geometry/types.js';
import type { CompiledLayout } from '../layout/compile.js';
import {
  type ActivatorDef,
  type BindingKind,
  MAX_CONDITION_LAYERS,
  type Mod,
  type ModChoice,
  modsMet,
  type TypingPathEntry,
} from '../layout/types.js';
import { recordPresses } from '../presses/press-log.js';
import { cyanophageEffort } from '../rules/effort.js';
import type {
  FingerTravel,
  RunStats,
  SimulationStats,
  SimulationTables,
  WordTrace,
} from '../tables/tables.js';
import { type ActivatorCandidate, discoverActivators, standInPeers } from './activators.js';
import {
  type Choosable,
  chooseKeys,
  compareCost,
  type PressCost,
  type PressMeasure,
  pressMeasure,
} from './choice.js';
import { type Action, type KeyEvent, Machine, peelBinding, type Snapshot } from './machine.js';
import {
  enumerateProducers,
  type Producer,
  type ProducerIndex,
  repeatProducers,
} from './producers.js';

export interface SimulateOptions {
  caseMode: 'fold' | 'model';
  crossWord: 'reset' | 'bridge';
  repeatPolicy?: 'repeat_key' | 'tap_twice';
  typingPaths?: Record<string, TypingPathEntry[]>;
  activators?: Record<string, ActivatorDef[]>;
  /** Symbols treated as soft boundaries when unproducible (not counted as coverage failures). */
  softSymbols?: string[];
  maxSymbols?: number;
  collectEvents?: boolean;
  /** Per-key effort is not needed here; kept for API symmetry. */
  producerIndex?: ProducerIndex;
}

/** A run of presses with no space in it enters the tables in pieces of at most this many. */
const WORD_LIMIT = 128;

/** How many times a way of typing a symbol is tried, each time with other modifiers held. */
const MOD_TRIES = 8;

/** Layer taps another key can make instead: nothing they do depends on which key it was. */
const STAND_IN_KINDS: ReadonlySet<BindingKind> = new Set(['sl', 'tog', 'to']);

/** A press of the word another key could make: where it is, and every key's event for it. */
interface WordSlot extends Choosable {
  /** Index of the press's event in the word. */
  event: number;
  /** The planner's event first, then the other keys'. */
  options: KeyEvent[];
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

export function findHomeKeys(compiled: CompiledLayout): Record<Finger, number> {
  const home = {} as Record<Finger, number>;
  for (const f of FINGERS) {
    let best = -1;
    let bestScore = Infinity;
    compiled.keys.forEach((k, i) => {
      if (k.finger !== f) return;
      let score: number;
      if (k.thumb)
        score = k.col; // innermost thumb is the resting thumb key
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
 * Text → physical key events → n-gram tables.
 */
export class Simulator {
  readonly machine: Machine;
  readonly index: ProducerIndex;
  private readonly activators: Map<number, ActivatorCandidate[]>;
  /** For each layer tap, the keys after it that could make the same tap. */
  private readonly peers: Map<ActivatorCandidate, ActivatorCandidate[]>;
  /** What a choice between keys is measured by. */
  private readonly measure: PressMeasure;
  /** For the token being typed: a layer tap the planner made, and the same tap on other keys. */
  private readonly standIns = new Map<KeyEvent, KeyEvent[]>();
  private readonly userPaths = new Map<string, TypingPathEntry[]>();
  private readonly plannerHolds = new Set<number>();
  /** Conditional layers being brought on by their conditions, outermost first. */
  private readonly conditionsOpen = new Set<number>();
  /**
   * For the way being tried, each choice of more than one modifier in the order it comes up: the
   * modifier it starts from, and the one it took of how many. A way that fails is tried again with
   * the last choice that has another modifier left taking the next one (`tryProducer`).
   */
  private readonly modStarts: number[] = [];
  private readonly modPicks: { took: number; of: number }[] = [];
  private readonly fold: boolean;
  private readonly repeatPolicy: 'repeat_key' | 'tap_twice';

  // accumulation
  private readonly presses = recordPresses();
  private readonly runs: RunStats = {
    handRuns: [],
    handStrings: new Map(),
    fingerRuns: [],
    layerRuns: [],
  };
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
  /**
   * The word being typed, kept until it ends: its presses enter the tables then, in the order they
   * were made, once each key a choice was left to is chosen (`commitWord`).
   */
  private readonly word: KeyEvent[] = [];
  /** The position of each of the word's presses, a choosable one at the planner's key. */
  private readonly wordKeys: number[] = [];
  /** The word's presses that another key could make. */
  private readonly slots: WordSlot[] = [];
  readonly events: KeyEvent[] = [];
  private readonly collectEvents: boolean;
  private readonly softSymbols: Set<string>;
  readonly coverage: Coverage;

  constructor(
    readonly compiled: CompiledLayout,
    readonly options: SimulateOptions,
  ) {
    this.machine = new Machine(compiled);
    this.fold = options.caseMode === 'fold';
    this.index = options.producerIndex ?? enumerateProducers(compiled, options.caseMode);
    this.repeatPolicy =
      options.repeatPolicy ??
      (compiled.layout.repeatPolicy?.doubledLetters === 'tapTwice' ? 'tap_twice' : 'repeat_key');
    this.collectEvents = options.collectEvents ?? false;
    this.softSymbols = new Set(options.softSymbols ?? ['?', '!']);
    this.coverage = {
      unproducible: new Map(),
      softDropped: new Map(),
      excludedByCase: this.index.excludedByCase.map((p) => p.id),
    };
    for (const [sym, entries] of Object.entries(
      options.typingPaths ?? compiled.layout.typingPaths ?? {},
    )) {
      this.userPaths.set(this.fold ? sym.toLowerCase() : sym, entries);
    }
    this.activators = discoverActivators(
      compiled,
      options.activators ?? compiled.layout.activators ?? {},
    );
    this.peers = standInPeers(this.activators);
    // Effort of a press at each position, a chord's keys summed, on cyanophage's own grid.
    const effort = cyanophageEffort(compiled);
    const pressEffort = compiled.positions.map((p) =>
      p.members.reduce((sum, m) => sum + (effort[compiled.keys[m].id] ?? 1), 0),
    );
    this.measure = pressMeasure(compiled, pressEffort);
    this.homeKeys = findHomeKeys(compiled);
    this.lastFingerPos = { ...this.homeKeys };
    this.lastFingerPosWord = { ...this.homeKeys };
    const zero = () => Object.fromEntries(FINGERS.map((f) => [f, 0])) as Record<Finger, number>;
    this.travel = {
      continuous: zero(),
      resetAtWord: zero(),
      usage: zero(),
      byKey: { continuous: [], resetAtWord: [] },
    };
    this.stats = {
      symbols: 0,
      words: 0,
      keystrokes: 0,
      space_presses: 0,
      layer_taps: 0,
      one_shot_activations: 0,
      wasted_one_shots: 0,
      hold_presses: 0,
      chords: 0,
      macro_presses: 0,
      adaptive_presses: 0,
      adaptive_trigger_hits: 0,
      repeat_presses: 0,
      per_layer: compiled.layers.map(() => 0),
      unproducible: this.coverage.unproducible,
    };
  }

  // ---------------------------------------------------------------- planning

  private candidatesFor(token: string): Producer[] {
    const out: Producer[] = [];
    const last = this.machine.state.lastSymbol;
    const lastCmp = last === null ? null : this.fold ? last.toLowerCase() : last;
    if (this.repeatPolicy === 'repeat_key' && lastCmp !== null && lastCmp === token) {
      out.push(...repeatProducers(this.index));
    }
    const base = this.index.bySymbol.get(token) ?? [];
    if (!this.fold) {
      const lower = token.toLowerCase();
      if (lower !== token) {
        const lowerProducers = this.index.bySymbol.get(lower) ?? [];
        out.push(...lowerProducers);
        out.push(...base);
        // A capital is its letter with Shift held, on a key and on a combo alike.
        for (const p of lowerProducers) {
          if (p.kind === 'repeat') continue;
          out.push({
            ...p,
            id: `${p.id}+shift`,
            mods: [...(p.mods ?? []), ['LSHIFT']],
            cost: p.cost + 1,
          });
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
      if (
        e.when?.afterAny &&
        (last === null ||
          !e.when.afterAny.some((a) => a === last || a.toLowerCase() === last.toLowerCase()))
      ) {
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
    if (!list) return this.activateWhen(target, events, depth);
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
      // Where the board is just before a tap other keys could make too, and the kind of that tap.
      let beforeTap: Snapshot | null = null;
      let tapKind: BindingKind | null = null;
      let tapped: KeyEvent | null = null;
      // A one-shot, toggle or switch on a tap-hold's hold: held past its term, then let go.
      let heldThenLetGo = false;
      if (cand.requiredMods?.length) ok = this.ensureMods(cand.requiredMods, events, modHolds);
      if (ok && !m.isLayerActive(cand.viaLayer))
        ok = this.activate(cand.viaLayer, events, depth + 1);
      if (ok && cand.combo !== undefined) {
        // A combo's keys pressed together, on a layer it fires on, typing nothing.
        if (!m.comboAvailable(cand.combo)) ok = false;
        else {
          const evs = m.perform({
            type: 'chord',
            combo: cand.combo,
            hold: cand.mode === 'hold',
          });
          if (evs.some((e) => e.symbols.length)) ok = false;
          else events.push(...evs);
        }
      } else if (ok) {
        const r = m.resolve(cand.pos);
        if (r.layer !== cand.viaLayer) ok = false;
        else {
          const peeled = peelBinding(m, r.binding, cand.mode);
          const kinds =
            cand.mode === 'hold'
              ? ['mo', 'lt', 'sl', 'tog', 'to']
              : ['sl', 'tog', 'to', 'adaptive', 'macro'];
          if (!kinds.includes(peeled.kind)) ok = false;
          else if (cand.mode === 'hold' && STAND_IN_KINDS.has(peeled.kind)) heldThenLetGo = true;
          else if (this.peers.has(cand) && STAND_IN_KINDS.has(peeled.kind)) {
            beforeTap = m.state.snapshot();
            tapKind = peeled.kind;
          }
        }
      }
      if (ok && cand.combo === undefined) {
        const action: Action =
          cand.mode === 'hold'
            ? { type: 'hold_press', pos: cand.pos }
            : { type: 'tap', pos: cand.pos };
        const evs = m.perform(action);
        if (heldThenLetGo) evs.push(...m.perform({ type: 'hold_release', pos: cand.pos }));
        if (evs.some((e) => e.symbols.length)) ok = false;
        else {
          events.push(...evs);
          if (cand.mode === 'hold' && !heldThenLetGo) this.plannerHolds.add(cand.pos);
          if (evs.length === 1) tapped = evs[0];
        }
      }
      if (ok && m.isLayerActive(target)) {
        // Held modifiers that only select the activator's part are released after the producer step.
        for (const pos of modHolds) this.plannerHolds.add(pos);
        if (beforeTap && tapKind && tapped) {
          this.offerStandIns(tapped, tapKind, this.peers.get(cand) ?? [], beforeTap, top);
        }
        return true;
      }
      m.state.restore(snap);
      m.recomputeMask();
      events.length = startLen;
      this.plannerHolds.clear();
      for (const p of holdsBefore) this.plannerHolds.add(p);
    }
    // The machine turns a conditional layer off however else it came on: its condition may still.
    return this.activateWhen(target, events, depth);
  }

  /**
   * A layer no key brings on, only others on together, as Extras comes on while Numbers and Symbols
   * are both held: the condition's layers are brought on one after another, in the order it names
   * them first, so the last is reached from the one before when it can be, as Symbols is from
   * Numbers. The condition is a set, not a sequence, so where that order cannot be pressed, the
   * others are tried, one layer at a time: an order is given up as soon as a layer in it fails.
   */
  private activateWhen(target: number, events: KeyEvent[], depth: number): boolean {
    // Two layers that each come on only with the other are never reached.
    if (this.conditionsOpen.has(target)) return false;
    this.conditionsOpen.add(target);
    try {
      const layerIndex = this.compiled.layerIndex;
      for (const cond of this.compiled.layout.conditionalLayers ?? []) {
        if (layerIndex.get(cond.then) !== target) continue;
        const ifs = cond.if.map((id) => layerIndex.get(id) ?? -1);
        // A document names no more than `MAX_CONDITION_LAYERS`, none of them conditional, so its
        // conditions are tried in every order. A layout written in code is not checked: a condition
        // there naming more, or met on the way to another's, is tried in its own order only, so the
        // tries add up along a chain of them rather than multiply.
        const any = ifs.length <= MAX_CONDITION_LAYERS && this.conditionsOpen.size === 1;
        if (this.activateEach(ifs, [], target, events, depth, any)) return true;
      }
      return false;
    } finally {
      this.conditionsOpen.delete(target);
    }
  }

  /**
   * Brings `layers` on in some order that leaves `target` on, or leaves the board as it was: any
   * order, or with `any` false only the one given. An order is given up as soon as a layer brought on
   * turns one before it off.
   */
  private activateEach(
    layers: number[],
    on: number[],
    target: number,
    events: KeyEvent[],
    depth: number,
    any: boolean,
  ): boolean {
    const m = this.machine;
    if (layers.length === 0) return m.isLayerActive(target);
    for (let i = 0; i < (any ? layers.length : 1); i++) {
      const snap = m.state.snapshot();
      const startLen = events.length;
      const holdsBefore = new Set(this.plannerHolds);
      const rest = [...layers.slice(0, i), ...layers.slice(i + 1)];
      const now = [...on, layers[i]];
      // At the same depth: each layer is reached as it would be on its own, the condition taking
      // none of the route's steps.
      if (
        this.activate(layers[i], events, depth) &&
        now.every((li) => m.isLayerActive(li)) &&
        this.activateEach(rest, now, target, events, depth, any)
      )
        return true;
      m.state.restore(snap);
      m.recomputeMask();
      events.length = startLen;
      this.plannerHolds.clear();
      for (const p of holdsBefore) this.plannerHolds.add(p);
    }
    return false;
  }

  /**
   * The other keys that could have made a layer tap: each is pressed from where the board was just
   * before it, and stands in if it is the same kind of tap, types nothing, and leaves the board
   * exactly where the planner's key left it. Which of them the word presses is chosen when it ends.
   */
  private offerStandIns(
    tapped: KeyEvent,
    kind: BindingKind,
    peers: ActivatorCandidate[],
    beforeTap: Snapshot,
    top: number,
  ): void {
    const m = this.machine;
    const afterTap = m.state.snapshot();
    const found: KeyEvent[] = [];
    for (const peer of peers) {
      if (peer.from !== undefined && peer.from !== top) continue;
      m.state.restore(beforeTap);
      m.recomputeMask();
      const r = m.resolve(peer.pos);
      if (r.layer !== peer.viaLayer) continue;
      if (peelBinding(m, r.binding, 'tap').kind !== kind) continue;
      const evs = m.perform({ type: 'tap', pos: peer.pos });
      if (evs.length === 1 && evs[0].symbols === '' && m.state.matches(afterTap))
        found.push(evs[0]);
    }
    m.state.restore(afterTap);
    m.recomputeMask();
    if (found.length) this.standIns.set(tapped, found);
  }

  /**
   * Hold one modifier of each choice not already held: the shift key, or a key that holds one. A
   * choice of more than one starts from the modifier this try of the way gives it (`modStarts`).
   */
  private ensureMods(
    choices: readonly ModChoice[],
    events: KeyEvent[],
    holdsOut: number[],
  ): boolean {
    const m = this.machine;
    for (const choice of choices) {
      if (modsMet(choice, m.activeMods())) continue;
      const several = choice.length > 1;
      const at = this.modPicks.length;
      let took = choice.length;
      for (let i = several ? (this.modStarts[at] ?? 0) : 0; i < choice.length; i++) {
        // A press that holds another modifier, as a shift key holding the other shift, is taken
        // back before the next one is tried.
        const snap = m.state.snapshot();
        const eventsAt = events.length;
        const holdsAt = holdsOut.length;
        if (this.holdMod(choice[i], events, holdsOut) && modsMet(choice, m.activeMods())) {
          took = i;
          break;
        }
        m.state.restore(snap);
        m.recomputeMask();
        events.length = eventsAt;
        holdsOut.length = holdsAt;
      }
      if (several) this.modPicks.push({ took, of: choice.length });
      if (took === choice.length) return false;
    }
    return true;
  }

  /**
   * After a way failed: the choice nearest its failure that has another modifier left takes the
   * next one, the choices before it what they took, and those after it start over. False when no
   * choice has one left.
   */
  private nextModStarts(): boolean {
    const picks = this.modPicks;
    let k = picks.length - 1;
    while (k >= 0 && picks[k].took + 1 >= picks[k].of) k--;
    if (k < 0) return false;
    this.modStarts.length = 0;
    for (let j = 0; j < k; j++) this.modStarts.push(picks[j].took);
    this.modStarts.push(picks[k].took + 1);
    return true;
  }

  /** Press a key that holds `mod`: false when there is none, and then nothing was pressed. */
  private holdMod(mod: Mod, events: KeyEvent[], holdsOut: number[]): boolean {
    const m = this.machine;
    const isShift = mod === 'LSHIFT' || mod === 'RSHIFT';
    const sk = this.compiled.shiftKey;
    if (isShift && sk) {
      const r = m.resolve(sk.key);
      const peeled = peelBinding(m, r.binding, sk.kind === 'hold' ? 'hold' : 'tap');
      if (
        sk.kind === 'sk' &&
        (peeled.kind === 'sk' || peeled.kind === 'mod_morph' || peeled.kind === 'adaptive')
      ) {
        events.push(...m.perform({ type: 'tap', pos: sk.key }));
        return true;
      }
      if (sk.kind === 'hold' && peeled.kind === 'mod') {
        events.push(...m.perform({ type: 'hold_press', pos: sk.key }));
        holdsOut.push(sk.key);
        return true;
      }
      // The shift key is no shift on this layer: another key, or a combo, may give it.
    }
    // Search active layers for a sticky or held modifier key.
    for (let pos = 0; pos < this.compiled.keys.length; pos++) {
      const r = m.resolve(pos);
      const tapPeeled = peelBinding(m, r.binding, 'tap');
      if (tapPeeled.kind === 'sk' && tapPeeled.mod === mod) {
        events.push(...m.perform({ type: 'tap', pos }));
        return true;
      }
      const holdPeeled = peelBinding(m, r.binding, 'hold');
      if (holdPeeled.kind === 'mod' && holdPeeled.mod === mod) {
        events.push(...m.perform({ type: 'hold_press', pos }));
        holdsOut.push(pos);
        return true;
      }
    }
    // Then a typing combo that taps a sticky modifier. A held chord is let go in the same action,
    // so a combo can give a modifier only as a one-shot.
    for (const c of this.compiled.combos) {
      if (c.role !== 'typing' || !m.comboAvailable(c.idx)) continue;
      const peeled = peelBinding(m, c.binding, 'tap');
      if (peeled.kind === 'sk' && peeled.mod === mod) {
        events.push(...m.perform({ type: 'chord', combo: c.idx }));
        return true;
      }
    }
    return false;
  }

  /**
   * A combo fires only when the highest active layer is in its layer list, so activate one of those
   * layers first when needed (ZMK filters combo candidates against the single highest active layer).
   */
  private ensureComboAvailable(comboIdx: number, events: KeyEvent[]): boolean {
    const m = this.machine;
    if (m.comboAvailable(comboIdx)) return true;
    const combo = this.compiled.combos[comboIdx];
    const mask = combo?.layerMask;
    if (mask === null || mask === undefined) return false;
    const top = m.highestActiveLayer();
    for (let li = top + 1; li < this.compiled.layers.length; li++) {
      if ((mask & (1 << li)) === 0) continue;
      if (this.activate(li, events, 0) && m.comboAvailable(comboIdx)) return true;
    }
    return false;
  }

  /**
   * Type the token this way, or null. A modifier held for a choice can still be on for a press
   * after the one it was held for, and spoil it, as a sticky Shift held for a layer key shifts the
   * letter on that layer: then the way is tried again with the choice's next modifier, a bounded
   * number of times. A way with no choice of more than one modifier is tried once.
   */
  private tryProducer(p: Producer, token: string): KeyEvent[] | null {
    this.modStarts.length = 0;
    for (let tries = 1; ; tries++) {
      this.modPicks.length = 0;
      const events = this.tryProducerOnce(p, token);
      if (events || tries === MOD_TRIES || !this.nextModStarts()) return events;
    }
  }

  private tryProducerOnce(p: Producer, token: string): KeyEvent[] | null {
    const m = this.machine;
    const snap = m.state.snapshot();
    const holdsBefore = [...this.plannerHolds];
    const events: KeyEvent[] = [];
    const modHolds: number[] = [];
    let ok = true;
    // A dead key's modifier belongs to the letter it accents: shift, then the letter.
    const modsAt = p.kind === 'deadkey' ? p.steps.length - 1 : 0;
    // A shifted accent: shift, then the dead key, and shift comes up again before the letter.
    const deadHolds: number[] = [];
    for (const [i, step] of p.steps.entries()) {
      // After the accent the hand lets go of any layer it held for it, then types the letter.
      if (ok && i === 1 && p.kind === 'deadkey') {
        if (this.plannerHolds.size > 0) events.push(...this.releaseHolds());
        for (const pos of deadHolds.splice(0))
          events.push(...m.perform({ type: 'hold_release', pos }));
      }
      if (ok && i === 0 && p.deadMods?.length) ok = this.ensureMods(p.deadMods, events, deadHolds);
      if (ok && i === modsAt && p.mods?.length) ok = this.ensureMods(p.mods, events, modHolds);
      if (!ok) break;
      if (step.mode === 'chord') {
        if (step.combo === undefined || !this.ensureComboAvailable(step.combo, events)) {
          ok = false;
          break;
        }
        events.push(
          ...m.perform({ type: 'chord', combo: step.combo, hold: step.held, taps: step.taps }),
        );
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
      if (step.mode === 'hold') {
        events.push(...m.perform({ type: 'hold_press', pos: step.pos }));
        events.push(...m.perform({ type: 'hold_release', pos: step.pos }));
      } else events.push(...m.perform({ type: 'tap', pos: step.pos, taps: step.taps }));
    }
    for (const pos of modHolds) events.push(...m.perform({ type: 'hold_release', pos }));
    if (ok) {
      const emitted = events.map((e) => e.symbols).join('');
      ok = this.fold ? emitted.toLowerCase() === token : emitted === token;
    }
    if (!ok) {
      m.state.restore(snap);
      m.recomputeMask();
      this.plannerHolds.clear();
      for (const pos of holdsBefore) this.plannerHolds.add(pos);
      return null;
    }
    // A combo's presses count as what its binding typed through, as a key's do.
    for (const e of events) if (e.producerKind === undefined) e.producerKind = p.via ?? p.kind;
    return events;
  }

  private releaseHolds(): KeyEvent[] {
    const out: KeyEvent[] = [];
    for (const pos of this.plannerHolds)
      out.push(...this.machine.perform({ type: 'hold_release', pos }));
    this.plannerHolds.clear();
    return out;
  }

  // ------------------------------------------------------------ accumulation

  private commit(events: KeyEvent[], isSpace: boolean): void {
    const c = this.compiled;
    for (const ev of events) {
      if (this.collectEvents) this.events.push(ev);
      if (ev.kind === 'hold_release') continue;
      const st = this.stats;
      st.keystrokes++;
      st.per_layer[ev.layer] = (st.per_layer[ev.layer] ?? 0) + 1;
      if (ev.kind === 'hold_press') st.hold_presses++;
      if (ev.kind === 'chord') st.chords++;
      if (ev.keyKind === 'layer_tap') st.layer_taps++;
      if (ev.leafKind === 'sl') st.one_shot_activations++;
      if (ev.wastedOneShot) st.wasted_one_shots++;
      if (ev.leafKind === 'macro') st.macro_presses++;
      // A chord counts as the kind of key its binding acted as, for adaptive keys and repeats. Layer
      // taps stay the keys' own: that statistic counts a combo as a combo (see presses/layer-taps).
      const acts = ev.actsAs ?? ev.keyKind;
      if (acts === 'adaptive') {
        st.adaptive_presses++;
        if (ev.producerKind === 'adaptive') st.adaptive_trigger_hits++;
      }
      if (acts === 'repeat') st.repeat_presses++;
      if (ev.keyKind === 'space') st.space_presses++;
      const id = this.presses.press(ev, ev.keyKind === 'space' || isSpace ? 'with_space' : 'both');
      const pos = c.positions[ev.pos];
      // finger travel & usage, by finger and by the key the finger went to
      const byKey = this.travel.byKey;
      byKey.continuous[id] ??= pos.members.map(() => 0);
      byKey.resetAtWord[id] ??= pos.members.map(() => 0);
      pos.members.forEach((member, slot) => {
        const key = c.keys[member];
        const f = key.finger;
        this.travel.usage[f]++;
        const prev = this.lastFingerPos[f];
        if (prev >= 0) {
          const d = keyDistance(c.keys[prev], key, 'euclid') ?? 0;
          this.travel.continuous[f] += d;
          byKey.continuous[id][slot] += d;
        }
        this.lastFingerPos[f] = member;
        const prevW = this.lastFingerPosWord[f];
        if (prevW >= 0) {
          const d = keyDistance(c.keys[prevW], key, 'euclid') ?? 0;
          this.travel.resetAtWord[f] += d;
          byKey.resetAtWord[id][slot] += d;
        }
        this.lastFingerPosWord[f] = member;
      });
      if (ev.keyKind === 'space' || isSpace) continue;
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
    if (this.runFingerLen > 0)
      this.runs.fingerRuns[this.runFingerLen] = (this.runs.fingerRuns[this.runFingerLen] ?? 0) + 1;
    this.runFingerLen = 0;
    this.runFinger = null;
  }

  private flushLayerRun(): void {
    if (this.runLayerLen > 0 && this.runLayer > 0)
      this.runs.layerRuns[this.runLayerLen] = (this.runs.layerRuns[this.runLayerLen] ?? 0) + 1;
    this.runLayerLen = 0;
    this.runLayer = -1;
  }

  /** Keep a token's presses with the word they belong to, noting the ones another key could make. */
  private addToWord(events: KeyEvent[]): void {
    for (const e of events) {
      this.word.push(e);
      if (e.kind === 'hold_release') continue;
      const others = this.standIns.get(e);
      if (others) {
        for (const o of others) o.producerKind = e.producerKind;
        this.slots.push({
          at: this.wordKeys.length,
          keys: [e.pos, ...others.map((o) => o.pos)],
          event: this.word.length - 1,
          options: [e, ...others],
        });
      }
      this.wordKeys.push(e.pos);
    }
    this.standIns.clear();
    // A run with no space in it still enters the tables as it goes.
    if (this.word.length >= WORD_LIMIT) this.commitWord();
  }

  /**
   * The word's presses enter the tables, each one another key could make on the key that makes the
   * word's fewest same-finger pairs, then the least effort (`chooseKeys`); a tie keeps the
   * planner's.
   */
  private commitWord(): void {
    if (this.word.length === 0) return;
    if (this.slots.length) {
      const { pick } = chooseKeys(this.measure, this.wordKeys, this.slots);
      this.slots.forEach((slot, j) => {
        this.word[slot.event] = slot.options[pick[j]];
      });
    }
    this.commit(this.word, false);
    this.word.length = 0;
    this.wordKeys.length = 0;
    this.slots.length = 0;
  }

  private wordBoundary(hard: boolean): void {
    // Before anything else: the word's own presses are what it ends on.
    this.commitWord();
    if (this.curWord.length) {
      const w = this.curWord.join('');
      const t = this.words.get(w);
      if (t) t.count++;
      else
        this.words.set(w, {
          word: w,
          count: 1,
          presses: this.curWordPresses,
          keys: this.curWordKeys.slice(),
        });
      this.stats.words++;
    }
    this.curWord = [];
    this.curWordKeys = [];
    this.curWordPresses = 0;
    if (this.options.crossWord === 'reset' || hard) {
      this.presses.boundary('no_space');
      this.flushHandRun();
      this.flushFingerRun();
      this.flushLayerRun();
    }
    if (hard) {
      this.presses.boundary('with_space');
    }
    for (const f of FINGERS) this.lastFingerPosWord[f] = this.homeKeys[f];
  }

  // ------------------------------------------------------------------ driver

  /**
   * Candidate tokens starting at code-unit index `i`, longest first (multi-symbol producer strings,
   * then the single symbol). Tokens never cross a space. Returns `[token, symbolCount, nextIndex]`.
   */
  private tokenCandidates(stream: string, i: number): [string, number, number][] {
    const first = String.fromCodePoint(stream.codePointAt(i) as number);
    const out: [string, number, number][] = [];
    if (this.index.multiStarts.has(first)) {
      for (let len = this.index.maxLen; len >= 2; len--) {
        let s = '';
        let j = i;
        let bad = false;
        for (let k = 0; k < len; k++) {
          if (j >= stream.length) {
            bad = true;
            break;
          }
          const cp = stream.codePointAt(j) as number;
          const g = String.fromCodePoint(cp);
          if (g === ' ') {
            bad = true;
            break;
          }
          s += g;
          j += g.length;
        }
        if (!bad && this.index.bySymbol.has(s)) out.push([s, len, j]);
      }
    }
    out.push([first, 1, i + first.length]);
    return out;
  }

  /**
   * Type one token the cheapest way the layout offers from where the typist is. A symbol whose
   * order was set by hand in Typing paths takes the first way that works, in that order.
   */
  private typeToken(token: string): boolean {
    this.standIns.clear();
    const handSet = (this.userPaths.get(this.pathSymbol(token))?.length ?? 0) > 0;
    let cands = this.candidatesFor(token);
    for (let attempt = 0; attempt < 2; attempt++) {
      const events = handSet ? this.firstThatWorks(cands, token) : this.cheapest(cands, token);
      if (events) {
        this.addToWord(events);
        return true;
      }
      if (this.plannerHolds.size === 0) break;
      this.addToWord(this.releaseHolds());
      cands = this.candidatesFor(token);
    }
    return false;
  }

  /** The symbol a token's typing path is kept under, as `candidatesFor` looks it up. */
  private pathSymbol(token: string): string {
    if (this.fold) return token;
    const lower = token.toLowerCase();
    return lower !== token ? lower : token;
  }

  private firstThatWorks(cands: Producer[], token: string): KeyEvent[] | null {
    for (const p of cands) {
      const events = this.tryProducer(p, token);
      if (events) return events;
    }
    return null;
  }

  /**
   * Every way to type the token, each tried from the same state: the fewest presses win; then the
   * way that leaves fewer layer keys held, since a held key still has to come up, and holding it
   * through what follows can change that (releasing it ends the one-shot shift a sentence armed);
   * then the way that makes the word so far the fewest same-finger bigrams, then skipgrams, then
   * the least effort (`wordCostWith`); then the candidates' own order. Those measures are fixed —
   * the default effort grid, not the rule set's — so what is typed never depends on the rules it
   * is scored by.
   */
  private cheapest(cands: Producer[], token: string): KeyEvent[] | null {
    if (cands.length <= 1) return this.firstThatWorks(cands, token);
    const m = this.machine;
    const start = m.state.snapshot();
    const holds = [...this.plannerHolds];
    const restore = (state: typeof start, held: number[]) => {
      m.state.restore(state);
      m.recomputeMask();
      this.plannerHolds.clear();
      for (const pos of held) this.plannerHolds.add(pos);
    };
    let best: {
      events: KeyEvent[];
      presses: number;
      /** Worked out only when another way ties with it in presses and held keys. */
      cost: PressCost | null;
      state: typeof start;
      holds: number[];
    } | null = null;
    for (const p of cands) {
      const events = this.tryProducer(p, token);
      if (events) {
        let presses = 0;
        for (const e of events) if (e.kind !== 'hold_release') presses++;
        const held = this.plannerHolds.size;
        let cost: PressCost | null = null;
        let better =
          best === null ||
          presses < best.presses ||
          (presses === best.presses && held < best.holds.length);
        if (!better && best !== null && presses === best.presses && held === best.holds.length) {
          cost = this.wordCostWith(events);
          best.cost ??= this.wordCostWith(best.events);
          better = compareCost(cost, best.cost) < 0;
        }
        if (better) {
          best = {
            events,
            presses,
            cost,
            state: m.state.snapshot(),
            holds: [...this.plannerHolds],
          };
        }
      }
      restore(start, holds);
    }
    if (best === null) return null;
    restore(best.state, best.holds);
    return best.events;
  }

  /**
   * What the word typed so far costs with these presses after it: its same-finger bigrams, then
   * skipgrams, then effort. A layer tap another key could make, the word's own or one of these,
   * counts on whichever key costs least — as the word will be committed.
   */
  private wordCostWith(events: KeyEvent[]): PressCost {
    const n = this.wordKeys.length;
    const extra: Choosable[] = [];
    for (const e of events) {
      if (e.kind === 'hold_release') continue;
      const others = this.standIns.get(e);
      if (others)
        extra.push({ at: this.wordKeys.length, keys: [e.pos, ...others.map((o) => o.pos)] });
      this.wordKeys.push(e.pos);
    }
    const { cost } = chooseKeys(
      this.measure,
      this.wordKeys,
      extra.length ? [...this.slots, ...extra] : this.slots,
    );
    this.wordKeys.length = n;
    return cost;
  }

  /** Always typed right after `wordBoundary`, so no word is waiting and the space commits at once. */
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
      for (const e of events) {
        if (e.symbols === ' ') continue;
        e.symbols = ' ';
        e.keyKind = 'space';
        e.label = '␣';
      }
    }
    for (const e of events) if (e.symbols === ' ') e.keyKind = 'space';
    this.commit(events, true);
  }

  run(stream: string): SimulationResult {
    const steps = this.steps(stream, Infinity);
    for (;;) {
      const r = steps.next();
      if (r.done) return r.value;
    }
  }

  /**
   * Type the stream, stopping after about every `every` symbols to say how many are done, so a
   * caller can let other work in, or give up; `run` goes through without stopping.
   */
  *steps(stream: string, every = 20_000): Generator<number, SimulationResult> {
    const max = this.options.maxSymbols ?? Infinity;
    let i = 0;
    let symbols = 0;
    let pause = every;
    while (i < stream.length && symbols < max) {
      if (symbols >= pause) {
        pause = symbols + every;
        yield symbols;
      }
      const cp = stream.codePointAt(i) as number;
      const g = String.fromCodePoint(cp);
      if (g === ' ') {
        this.wordBoundary(false);
        this.typeSpace();
        this.presses.symbol('with_space');
        i += 1;
        continue;
      }
      let typed = false;
      for (const [token, len, next] of this.tokenCandidates(stream, i)) {
        if (this.typeToken(token)) {
          this.curWord.push(token);
          for (let k = 0; k < len; k++) {
            this.presses.symbol('both');
          }
          this.stats.symbols += len;
          symbols += len;
          i = next;
          typed = true;
          break;
        }
      }
      if (!typed) {
        const soft = this.softSymbols.has(g);
        const map = soft ? this.coverage.softDropped : this.coverage.unproducible;
        map.set(g, (map.get(g) ?? 0) + 1);
        this.wordBoundary(true);
        symbols += 1;
        i += g.length;
      }
    }
    this.wordBoundary(false);
    // The last word is in; holds still down come up after it.
    this.commit(this.releaseHolds(), false);
    const tables: SimulationTables = {
      presses: this.presses.seal(),
      runs: this.runs,
      words: this.words,
      travel: this.travel,
      stats: this.stats,
    };
    return {
      tables,
      coverage: this.coverage,
      events: this.collectEvents ? this.events : undefined,
      producers: this.index,
    };
  }
}

export function simulate(
  compiled: CompiledLayout,
  stream: string,
  options: SimulateOptions,
): SimulationResult {
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
export function explain(
  compiled: CompiledLayout,
  text: string,
  options: SimulateOptions,
): { steps: ExplainStep[]; coverage: Coverage; presses: number } {
  const nfc = text.normalize('NFC');
  const stream = options.caseMode === 'fold' ? nfc.toLowerCase() : nfc;
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
  return {
    steps,
    coverage: r.coverage,
    presses: steps.filter((s) => s.kind !== 'hold_release').length,
  };
}
