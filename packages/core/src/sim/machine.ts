import { composeDeadKey, hasShift, shiftSymbol, translateKeycode } from '../host/locale.js';
import type { CompiledLayout } from '../layout/compile.js';
import type { AdaptiveTrigger, Binding, BindingKind, Mod } from '../layout/types.js';

export type KeyKind =
  | 'alpha'
  | 'layer_tap'
  | 'shift'
  | 'space'
  | 'repeat'
  | 'magic'
  | 'combo'
  | 'hold';

export type ProducerKind = 'direct' | 'combo' | 'adaptive' | 'repeat' | 'macro' | 'deadkey';

export type Action =
  | { type: 'tap'; pos: number; taps?: number }
  | { type: 'hold_press'; pos: number }
  | { type: 'hold_release'; pos: number }
  | { type: 'chord'; combo: number };

export interface KeyEvent {
  kind: 'tap' | 'hold_press' | 'hold_release' | 'chord';
  /** Position index (physical key or chord virtual position). */
  pos: number;
  /** Layer whose binding handled the event (highest active layer for chords). */
  layer: number;
  /** Text emitted by this event. */
  symbols: string;
  keyKind: KeyKind;
  label: string;
  leafKind: BindingKind;
  producerKind?: ProducerKind;
  wastedOneShot: boolean;
  /** Bitmask of layers held (by hold presses) while this event happened. */
  underHold: number;
}

interface OneShot {
  layer: number;
  quickRelease: boolean;
  ignoreModifiers: boolean;
}

interface StickyMod {
  mod: Mod;
  quickRelease: boolean;
  ignoreModifiers: boolean;
}

interface HeldEntry {
  layer?: number;
  mod?: Mod;
}

export interface Snapshot {
  persistentMask: number;
  locks: number;
  oneShots: OneShot[];
  held: [number, HeldEntry][];
  stickyMods: StickyMod[];
  capsWord: { continueList: string[]; mods: Mod[] } | null;
  autoLayer: { layer: number; continueList: string[] } | null;
  lastSymbol: string | null;
  lastKeycode: string | null;
  lastTag: string | null;
  pendingDeadKey: string | null;
}

export class MachineState {
  persistentMask = 1;
  locks = 0;
  oneShots: OneShot[] = [];
  held = new Map<number, HeldEntry>();
  stickyMods: StickyMod[] = [];
  capsWord: { continueList: Set<string>; mods: Mod[] } | null = null;
  autoLayer: { layer: number; continueList: Set<string> } | null = null;
  lastSymbol: string | null = null;
  lastKeycode: string | null = null;
  /**
   * Tag of the binding that produced the last press. Lets an adaptive branch depend on *how* a
   * symbol was typed: `u` from a `qu` macro is not the same as a plain `u`, and firmware can only
   * tell them apart by arming a one-shot layer.
   */
  lastTag: string | null = null;
  pendingDeadKey: string | null = null;

  snapshot(): Snapshot {
    return {
      persistentMask: this.persistentMask,
      locks: this.locks,
      oneShots: this.oneShots.map((o) => ({ ...o })),
      held: [...this.held.entries()].map(([k, v]) => [k, { ...v }]),
      stickyMods: this.stickyMods.map((s) => ({ ...s })),
      capsWord: this.capsWord
        ? { continueList: [...this.capsWord.continueList], mods: [...this.capsWord.mods] }
        : null,
      autoLayer: this.autoLayer
        ? { layer: this.autoLayer.layer, continueList: [...this.autoLayer.continueList] }
        : null,
      lastSymbol: this.lastSymbol,
      lastKeycode: this.lastKeycode,
      lastTag: this.lastTag,
      pendingDeadKey: this.pendingDeadKey,
    };
  }

  restore(s: Snapshot): void {
    this.persistentMask = s.persistentMask;
    this.locks = s.locks;
    this.oneShots = s.oneShots.map((o) => ({ ...o }));
    this.held = new Map(s.held.map(([k, v]) => [k, { ...v }]));
    this.stickyMods = s.stickyMods.map((x) => ({ ...x }));
    this.capsWord = s.capsWord
      ? { continueList: new Set(s.capsWord.continueList), mods: [...s.capsWord.mods] }
      : null;
    this.autoLayer = s.autoLayer
      ? { layer: s.autoLayer.layer, continueList: new Set(s.autoLayer.continueList) }
      : null;
    this.lastSymbol = s.lastSymbol;
    this.lastKeycode = s.lastKeycode;
    this.lastTag = s.lastTag;
    this.pendingDeadKey = s.pendingDeadKey;
  }

  heldLayerMask(): number {
    let m = 0;
    for (const h of this.held.values()) if (h.layer !== undefined) m |= 1 << h.layer;
    return m;
  }

  heldMods(): Mod[] {
    const out: Mod[] = [];
    for (const h of this.held.values()) if (h.mod) out.push(h.mod);
    return out;
  }
}

interface ExecContext {
  mode: 'tap' | 'hold';
  pos: number;
  taps: number;
  out: string[];
  /** Binding kind that produced the outcome (innermost executed). */
  leaf: BindingKind;
  /** Outermost binding kind on the resolved layer (for display classification). */
  outer: BindingKind | null;
  emittedKeycode: boolean;
  modifierPress: boolean;
  suppressMods: Set<Mod>;
  /** Tag of the most recently entered tagged binding, recorded on the next emit. */
  tag: string | null;
  depth: number;
}

const ALPHA_RE = /^\p{L}$/u;

export function isAlphaSymbol(s: string): boolean {
  return ALPHA_RE.test(s);
}

function splitGraphemes(s: string): string[] {
  return Array.from(s.normalize('NFC'));
}

export interface ResolveResult {
  binding: Binding;
  layer: number;
}

/**
 * Deterministic, timing-free ZMK-like state machine (SPEC §5).
 */
export class Machine {
  readonly state = new MachineState();
  private mask = 1;

  constructor(readonly compiled: CompiledLayout) {
    this.recomputeMask();
  }

  /** Active layer bitmask (base | persistent | one-shots | holds | auto-layer, then conditional layers). */
  activeMask(): number {
    return this.mask;
  }

  recomputeMask(): void {
    const s = this.state;
    let m = 1 | s.persistentMask | s.heldLayerMask();
    for (const o of s.oneShots) m |= 1 << o.layer;
    if (s.autoLayer) m |= 1 << s.autoLayer.layer;
    const c = this.compiled;
    if (c.conditionalLayers.length) {
      m &= ~c.conditionalThenMask;
      for (let iter = 0; iter < 33; iter++) {
        let next = m;
        for (const cl of c.conditionalLayers) {
          if ((next & cl.ifMask) === cl.ifMask) next |= 1 << cl.then;
          else next &= ~(1 << cl.then);
        }
        if (next === m) break;
        m = next;
      }
    }
    this.mask = m;
  }

  highestActiveLayer(mask = this.mask): number {
    return 31 - Math.clz32(mask);
  }

  isLayerActive(layer: number): boolean {
    return (this.mask & (1 << layer)) !== 0;
  }

  /** Layer walk from the highest active layer down; `trans` passes, `none` swallows. */
  resolve(pos: number, mask = this.mask): ResolveResult {
    const layers = this.compiled.layers;
    for (let li = layers.length - 1; li >= 0; li--) {
      if ((mask & (1 << li)) === 0) continue;
      const b = layers[li].bindings[pos];
      if (b.kind === 'trans') continue;
      return { binding: b, layer: li };
    }
    return { binding: { kind: 'none' }, layer: 0 };
  }

  activeMods(): Set<Mod> {
    const mods = new Set<Mod>(this.state.heldMods());
    for (const s of this.state.stickyMods) mods.add(s.mod);
    return mods;
  }

  perform(action: Action): KeyEvent[] {
    switch (action.type) {
      case 'tap': {
        const taps = action.taps ?? 1;
        const events: KeyEvent[] = [];
        for (let i = 0; i < taps; i++) {
          // Intermediate taps of a tap-dance produce no output; the last one carries the count.
          events.push(this.press(action.pos, 'tap', i === taps - 1 ? taps : 0));
        }
        return events;
      }
      case 'hold_press':
        return [this.press(action.pos, 'hold', 1)];
      case 'hold_release':
        return [this.release(action.pos)];
      case 'chord':
        return [this.chord(action.combo)];
    }
  }

  private newContext(mode: 'tap' | 'hold', pos: number, taps: number): ExecContext {
    return {
      mode,
      pos,
      taps,
      out: [],
      leaf: 'none',
      outer: null,
      emittedKeycode: false,
      modifierPress: false,
      suppressMods: new Set(),
      tag: null,
      depth: 0,
    };
  }

  private press(pos: number, mode: 'tap' | 'hold', taps: number): KeyEvent {
    const armedBefore = this.state.oneShots.slice();
    const stickyBefore = this.state.stickyMods.slice();
    const maskAtPress = this.mask;
    const heldBefore = this.state.heldLayerMask();
    const { binding, layer } = this.resolve(pos, maskAtPress);
    const ctx = this.newContext(mode, pos, taps);
    if (taps === 0) {
      // Intermediate tap of a tap-dance: no behavior runs yet.
      ctx.leaf = 'tap_dance';
      ctx.outer = 'tap_dance';
    } else {
      this.run(binding, ctx);
    }
    const wasted = this.postStep(ctx, armedBefore, stickyBefore, layer);
    this.recomputeMask();
    return {
      kind: mode === 'hold' ? 'hold_press' : 'tap',
      pos,
      layer,
      symbols: ctx.out.join(''),
      keyKind: classify(ctx, mode),
      label: labelFor(this.compiled, ctx, binding, layer),
      leafKind: ctx.leaf,
      wastedOneShot: wasted,
      underHold: heldBefore,
    };
  }

  private release(pos: number): KeyEvent {
    const entry = this.state.held.get(pos);
    const heldBefore = this.state.heldLayerMask();
    const layer = entry?.layer ?? this.highestActiveLayer();
    this.state.held.delete(pos);
    this.recomputeMask();
    return {
      kind: 'hold_release',
      pos,
      layer,
      symbols: '',
      keyKind: 'hold',
      label:
        entry?.layer !== undefined
          ? `⇩${this.compiled.layers[entry.layer]?.name ?? entry.layer}`
          : entry?.mod
            ? `⇩${entry.mod}`
            : '⇩',
      leafKind: entry?.layer !== undefined ? 'mo' : 'mod',
      wastedOneShot: false,
      underHold: heldBefore,
    };
  }

  /** Can this combo fire right now? (ZMK filters candidates against the single highest active layer.) */
  comboAvailable(comboIdx: number): boolean {
    const c = this.compiled.combos[comboIdx];
    if (c.layerMask === null) return true;
    return (c.layerMask & (1 << this.highestActiveLayer())) !== 0;
  }

  private chord(comboIdx: number): KeyEvent {
    const c = this.compiled.combos[comboIdx];
    const armedBefore = this.state.oneShots.slice();
    const stickyBefore = this.state.stickyMods.slice();
    const heldBefore = this.state.heldLayerMask();
    const layer = this.highestActiveLayer();
    const ctx = this.newContext('tap', c.pos, 1);
    if (this.comboAvailable(comboIdx)) this.run(c.binding, ctx);
    const wasted = this.postStep(ctx, armedBefore, stickyBefore, layer);
    this.recomputeMask();
    return {
      kind: 'chord',
      pos: c.pos,
      layer,
      symbols: ctx.out.join(''),
      keyKind: 'combo',
      label: ctx.out.join('') || c.id,
      leafKind: ctx.leaf,
      wastedOneShot: wasted,
      underHold: heldBefore,
    };
  }

  private postStep(
    ctx: ExecContext,
    armedBefore: OneShot[],
    stickyBefore: StickyMod[],
    layer: number,
  ): boolean {
    const s = this.state;
    let wasted = false;
    const layerKinds: BindingKind[] = [
      'none',
      'sl',
      'tog',
      'to',
      'mo',
      'lt',
      'auto_layer',
      'caps_word',
    ];
    for (const os of armedBefore) {
      if (ctx.modifierPress && os.ignoreModifiers) continue;
      const i = s.oneShots.indexOf(os);
      if (i >= 0) s.oneShots.splice(i, 1);
      if (ctx.modifierPress || layer !== os.layer || layerKinds.includes(ctx.leaf)) wasted = true;
    }
    for (const sm of stickyBefore) {
      let consume = false;
      if (ctx.emittedKeycode) consume = true;
      else if (ctx.modifierPress && !sm.ignoreModifiers) consume = true;
      if (consume) {
        const i = s.stickyMods.indexOf(sm);
        if (i >= 0) s.stickyMods.splice(i, 1);
      }
    }
    if (ctx.emittedKeycode) {
      if (s.capsWord) {
        for (const sym of ctx.out) {
          for (const g of splitGraphemes(sym)) {
            if (!(isAlphaSymbol(g) || s.capsWord.continueList.has(g))) {
              s.capsWord = null;
              break;
            }
          }
          if (!s.capsWord) break;
        }
      }
      if (s.autoLayer) {
        for (const sym of ctx.out) {
          for (const g of splitGraphemes(sym)) {
            if (!(isAlphaSymbol(g) || s.autoLayer.continueList.has(g))) {
              s.autoLayer = null;
              break;
            }
          }
          if (!s.autoLayer) break;
        }
      }
    }
    return wasted;
  }

  private effectiveShift(ctx: ExecContext, forAlpha: boolean): boolean {
    for (const m of this.state.heldMods())
      if ((m === 'LSHIFT' || m === 'RSHIFT') && !ctx.suppressMods.has(m)) return true;
    for (const sm of this.state.stickyMods)
      if ((sm.mod === 'LSHIFT' || sm.mod === 'RSHIFT') && !ctx.suppressMods.has(sm.mod))
        return true;
    if (forAlpha && this.state.capsWord && hasShift(this.state.capsWord.mods)) return true;
    return false;
  }

  private emit(ctx: ExecContext, symbol: string, keycode: string | null): void {
    const s = this.state;
    let text = symbol;
    if (s.pendingDeadKey !== null && text.length) {
      text = composeDeadKey(s.pendingDeadKey, text);
      s.pendingDeadKey = null;
    }
    if (text.length) ctx.out.push(text);
    ctx.emittedKeycode = true;
    s.lastSymbol = symbol.length ? symbol : s.lastSymbol;
    s.lastKeycode = keycode ?? (symbol.length ? symbol : s.lastKeycode);
    s.lastTag = ctx.tag;
  }

  /** Does this adaptive branch apply? Both conditions must hold when both are declared. */
  private triggerMatches(t: AdaptiveTrigger, strict: boolean): boolean {
    if (t.afterTags) {
      const last = this.state.lastTag;
      if (last === null || !t.afterTags.includes(last)) return false;
    }
    if (t.afterAny === undefined) return t.afterTags !== undefined;
    return this.matchesTrigger(t.afterAny, strict);
  }

  private matchesTrigger(afterAny: string[], strict: boolean): boolean {
    const s = this.state;
    if (this.compiled.hostLocale === 'symbols') {
      const last = s.lastSymbol;
      if (last === null) return false;
      const lower = last.toLowerCase();
      for (const a of afterAny) {
        if (a === last || a.toLowerCase() === lower) return true;
      }
      return false;
    }
    const last = s.lastKeycode;
    if (last === null) return false;
    for (const a of afterAny) {
      if (a === last) return true;
      if (!strict && last.endsWith(`(${a})`)) return true;
    }
    return false;
  }

  run(b: Binding, ctx: ExecContext): void {
    if (ctx.depth > 24) return;
    if (ctx.outer === null) ctx.outer = b.kind;
    const tag = (b as { tag?: string }).tag;
    if (tag !== undefined) ctx.tag = tag;
    ctx.depth++;
    try {
      switch (b.kind) {
        case 'kp': {
          ctx.leaf = 'kp';
          if (this.compiled.hostLocale === 'symbols' || b.keycode === undefined) {
            const base = b.symbol ?? '';
            const alpha = isAlphaSymbol(base);
            const shifted = this.effectiveShift(ctx, alpha);
            const text = shifted ? shiftSymbol(base, b.shifted) : base;
            this.emit(ctx, text, null);
          } else {
            const mods = this.activeMods();
            for (const m of ctx.suppressMods) mods.delete(m);
            if (this.state.capsWord) for (const m of this.state.capsWord.mods) mods.add(m);
            const r = translateKeycode(this.compiled.hostLocale, b.keycode, mods);
            if (r === null) {
              this.emit(ctx, '', b.keycode);
            } else if (r.deadKey) {
              this.state.pendingDeadKey = r.deadKey;
              ctx.emittedKeycode = true;
              this.state.lastKeycode = b.keycode;
            } else {
              const alpha = isAlphaSymbol(r.symbol);
              if (alpha && !hasShift(mods) && this.state.capsWord === null)
                this.emit(ctx, r.symbol, b.keycode);
              else this.emit(ctx, r.symbol, b.keycode);
            }
          }
          return;
        }
        case 'trans':
        case 'none':
        case 'raw':
          // An imported key the engine has no model of types nothing, like an empty one.
          ctx.leaf = b.kind === 'raw' ? 'none' : b.kind;
          return;
        case 'mo':
          ctx.leaf = 'mo';
          if (ctx.mode === 'hold') this.state.held.set(ctx.pos, { layer: this.layerIdx(b.layer) });
          return;
        case 'lt':
          if (ctx.mode === 'hold') {
            ctx.leaf = 'lt';
            this.state.held.set(ctx.pos, { layer: this.layerIdx(b.layer) });
          } else this.run(b.tap, ctx);
          return;
        case 'hold_tap':
          if (ctx.mode === 'hold') this.run(b.hold, ctx);
          else this.run(b.tap, ctx);
          return;
        case 'sl':
          ctx.leaf = 'sl';
          this.state.oneShots.push({
            layer: this.layerIdx(b.layer),
            quickRelease: b.quickRelease ?? true,
            ignoreModifiers: b.ignoreModifiers ?? false,
          });
          return;
        case 'tog': {
          ctx.leaf = 'tog';
          const bit = 1 << this.layerIdx(b.layer);
          const on = (this.state.persistentMask & bit) !== 0;
          const mode = b.mode ?? 'flip';
          const turnOn = mode === 'on' ? true : mode === 'off' ? false : !on;
          if (turnOn) {
            this.state.persistentMask |= bit;
            this.state.locks |= bit;
          } else {
            this.state.persistentMask &= ~bit;
            this.state.locks &= ~bit;
          }
          return;
        }
        case 'to': {
          ctx.leaf = 'to';
          const bit = 1 << this.layerIdx(b.layer);
          this.state.persistentMask = 1 | bit;
          this.state.locks = bit;
          this.state.oneShots = [];
          this.state.autoLayer = null;
          for (const [k, v] of this.state.held)
            if (v.layer !== undefined) this.state.held.delete(k);
          return;
        }
        case 'sk':
          ctx.leaf = 'sk';
          ctx.modifierPress = true;
          this.state.stickyMods.push({
            mod: b.mod,
            quickRelease: b.quickRelease ?? false,
            ignoreModifiers: b.ignoreModifiers ?? true,
          });
          return;
        case 'mod':
          ctx.leaf = 'mod';
          ctx.modifierPress = true;
          if (ctx.mode === 'hold') this.state.held.set(ctx.pos, { mod: b.mod });
          return;
        case 'caps_word':
          ctx.leaf = 'caps_word';
          if (this.state.capsWord) this.state.capsWord = null;
          else
            this.state.capsWord = {
              continueList: new Set(b.continueList ?? ['_', 'Backspace', 'Delete']),
              mods: b.mods ?? ['LSHIFT'],
            };
          return;
        case 'auto_layer': {
          ctx.leaf = 'auto_layer';
          const li = this.layerIdx(b.layer);
          if (this.state.autoLayer && this.state.autoLayer.layer === li)
            this.state.autoLayer = null;
          else
            this.state.autoLayer = {
              layer: li,
              continueList: new Set(b.continueList ?? ['_', 'Backspace']),
            };
          return;
        }
        case 'key_repeat':
          ctx.leaf = 'key_repeat';
          if (this.state.lastSymbol !== null) {
            const sym = this.state.lastSymbol;
            const alpha = isAlphaSymbol(sym);
            const text = this.effectiveShift(ctx, alpha) ? shiftSymbol(sym) : sym;
            this.emit(ctx, text, this.state.lastKeycode);
          } else ctx.emittedKeycode = true;
          return;
        case 'adaptive': {
          for (const t of b.triggers ?? []) {
            if (this.triggerMatches(t, b.strictModifiers ?? false)) {
              this.run(t.binding, ctx);
              return;
            }
          }
          if (b.default) this.run(b.default, ctx);
          else ctx.leaf = 'none';
          return;
        }
        case 'mod_morph': {
          const active = this.activeMods();
          const hit = b.mods.some((m) => active.has(m) && !ctx.suppressMods.has(m));
          if (hit) {
            const keep = new Set(b.keepMods ?? []);
            const saved = new Set(ctx.suppressMods);
            for (const m of b.mods) if (!keep.has(m)) ctx.suppressMods.add(m);
            this.run(b.morphed, ctx);
            ctx.suppressMods = saved;
          } else this.run(b.default, ctx);
          return;
        }
        case 'layer_morph': {
          const bits = b.layers.map((l) => 1 << this.layerIdx(l));
          const match = b.match ?? 'any';
          const on =
            match === 'all'
              ? bits.every((x) => (this.mask & x) !== 0)
              : bits.some((x) => (this.mask & x) !== 0);
          this.run(on ? b.active : b.inactive, ctx);
          return;
        }
        case 'tap_dance': {
          const n = Math.max(1, Math.min(ctx.taps || 1, b.bindings.length));
          this.run(b.bindings[n - 1], ctx);
          return;
        }
        case 'macro': {
          const steps: Binding[] = [];
          if (b.steps) steps.push(...b.steps);
          else if (b.symbols !== undefined)
            for (const g of splitGraphemes(b.symbols)) steps.push({ kind: 'kp', symbol: g });
          if (b.then) steps.push(...b.then);
          const savedMode = ctx.mode;
          ctx.mode = 'tap';
          for (const step of steps) {
            this.run(step, ctx);
            this.recomputeMask();
          }
          ctx.mode = savedMode;
          ctx.leaf = 'macro';
          return;
        }
        case 'dead_key':
          ctx.leaf = 'dead_key';
          this.state.pendingDeadKey = b.diacritic;
          ctx.emittedKeycode = true;
          return;
        case 'unicode': {
          ctx.leaf = 'unicode';
          const shifted = this.effectiveShift(ctx, isAlphaSymbol(b.symbol));
          this.emit(ctx, shifted && b.shiftedSymbol ? b.shiftedSymbol : b.symbol, null);
          return;
        }
        case 'ref':
          ctx.leaf = 'none';
          return;
      }
    } finally {
      ctx.depth--;
    }
  }

  private layerIdx(id: string): number {
    const i = this.compiled.layerIndex.get(id);
    if (i === undefined) throw new Error(`Unknown layer ${id}`);
    return i;
  }
}

function classify(ctx: ExecContext, mode: 'tap' | 'hold'): KeyKind {
  if (mode === 'hold') return 'hold';
  const outer = ctx.outer;
  if (ctx.out.length && ctx.out.join('') === ' ') return 'space';
  if (outer === 'adaptive') return 'magic';
  if (outer === 'key_repeat' || ctx.leaf === 'key_repeat') return 'repeat';
  switch (ctx.leaf) {
    case 'sl':
    case 'tog':
    case 'to':
    case 'mo':
    case 'lt':
      return 'layer_tap';
    case 'sk':
    case 'mod':
    case 'caps_word':
    case 'auto_layer':
      return 'shift';
    default:
      return 'alpha';
  }
}

function labelFor(
  compiled: CompiledLayout,
  ctx: ExecContext,
  binding: Binding,
  _layer: number,
): string {
  const text = ctx.out.join('');
  if (text.length) return text === ' ' ? '␣' : text;
  const layerName = (id: string) => compiled.layers[compiled.layerIndex.get(id) ?? 0]?.name ?? id;
  const peel = (b: Binding): string => {
    switch (b.kind) {
      case 'sl':
        return `→${layerName(b.layer)}`;
      case 'mo':
        return `⇩${layerName(b.layer)}`;
      case 'lt':
        return ctx.mode === 'hold' ? `⇩${layerName(b.layer)}` : peel(b.tap);
      case 'tog':
        return `⇄${layerName(b.layer)}`;
      case 'to':
        return `⇒${layerName(b.layer)}`;
      case 'sk':
        return b.mod.includes('SHIFT') ? '⇧' : `◇${b.mod}`;
      case 'mod':
        return b.mod.includes('SHIFT') ? '⇧' : `◆${b.mod}`;
      case 'caps_word':
        return '⇪';
      case 'auto_layer':
        return `⇪${layerName(b.layer)}`;
      case 'key_repeat':
        return '⟳';
      case 'hold_tap':
        return ctx.mode === 'hold' ? peel(b.hold) : peel(b.tap);
      case 'mod_morph':
        return peel(b.default);
      case 'layer_morph':
        return peel(b.inactive);
      case 'adaptive':
        return b.default ? peel(b.default) : '✦';
      case 'tap_dance':
        return peel(b.bindings[0]);
      case 'macro':
        return b.symbols ?? '⋯';
      case 'kp':
        return b.symbol ?? b.keycode ?? '';
      case 'dead_key':
        return b.diacritic;
      case 'unicode':
        return b.symbol;
      case 'raw':
        return b.label;
      default:
        return '·';
    }
  };
  return peel(binding);
}

/** Peel morphs/hold-taps to the binding that would run for the given mode under the current machine state. */
export function peelBinding(machine: Machine, b: Binding, mode: 'tap' | 'hold'): Binding {
  switch (b.kind) {
    case 'hold_tap':
      return peelBinding(machine, mode === 'hold' ? b.hold : b.tap, mode);
    case 'lt':
      return mode === 'hold' ? { kind: 'mo', layer: b.layer } : peelBinding(machine, b.tap, mode);
    case 'mod_morph': {
      const active = machine.activeMods();
      return peelBinding(machine, b.mods.some((m) => active.has(m)) ? b.morphed : b.default, mode);
    }
    case 'layer_morph': {
      const bits = b.layers.map((l) => 1 << (machine.compiled.layerIndex.get(l) ?? 0));
      const match = b.match ?? 'any';
      const on =
        match === 'all'
          ? bits.every((x) => (machine.activeMask() & x) !== 0)
          : bits.some((x) => (machine.activeMask() & x) !== 0);
      return peelBinding(machine, on ? b.active : b.inactive, mode);
    }
    default:
      return b;
  }
}
