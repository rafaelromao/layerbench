import {
  type AdaptiveTrigger,
  type Binding,
  bindingToJson,
  type Mod,
  stableStringify,
} from '@layerbench/core';
import { type BindingTextContext, parseBindingText } from '../binding-text.js';
import { type KindOfKey, kindOf } from './kinds.js';

/**
 * What the key inspector's controls do to a binding, in one place. A binding is read as its kind of
 * key: what each of its controls shows, and the change each of them makes. A change gives the
 * binding it makes, or the binding it was given when it would change nothing, so whoever commits it
 * can tell that nothing happened.
 */

type Of<K extends Binding['kind']> = Extract<Binding, { kind: K }>;

/** What one control does: the binding it makes of the value it is given. */
export type Change<V> = (value: V) => Binding;

/** How a layer key brings its layer on. */
export type LayerMode = 'mo' | 'sl' | 'tog' | 'to' | 'auto_layer';
/** How a modifier key acts: held, or one-shot. */
export type ModMode = 'mod' | 'sk';
/** What changes a morph: a modifier held, or a layer on. */
export type MorphBy = 'mod_morph' | 'layer_morph';
/** A modifier as a morph is changed by it, left or right alike. */
export type MorphFamily = 'shift' | 'ctrl' | 'alt' | 'gui';
/** How a macro is written: the letters it types, or its steps one by one. */
export type MacroForm = 'text' | 'steps';

/** The rows an author can add to a macro's steps, in the order they are offered. */
export const ROW_KINDS = ['text', 'sl', 'sk', 'ref'] as const;
export type RowKind = (typeof ROW_KINDS)[number];

/**
 * One row of a macro's steps: text to type, a layer or a modifier to arm for the next key, a
 * behaviour to run. A step no row can hold whole is a fixed row, kept as it is and only moved or
 * removed, so a macro read into rows and written back does what it did. Rows are reordered and
 * can be alike, so each carries an identity of its own.
 */
export type MacroRow = { id: string } & (
  | { kind: 'text'; text: string }
  | { kind: 'sl'; layer: string }
  | { kind: 'sk'; mod: Mod }
  | { kind: 'ref'; ref: string }
  | { kind: 'fixed'; step: Binding }
);
type Nothing = Record<never, never>;

/** A list of parts inside a key: an adaptive key's branches, a tap dance's taps. */
export interface ListChanges<C> {
  /** The changes to one item of the list. */
  at(i: number): C;
  add(): Binding;
  /** Gives the key back as it was where it would leave fewer items than the key needs. */
  remove(i: number): Binding;
  move(i: number, to: number): Binding;
}

/** One branch of an adaptive key: after which symbols or tags, and what it does then. */
export interface BranchView {
  after: string;
  tags: string;
  then: Binding;
}

export interface BranchChanges {
  after: Change<string>;
  tags: Change<string>;
  then: Change<Binding>;
}

/** An adaptive key and an alt repeat show the same controls; the alt repeat has no default. */
interface AdaptiveShape {
  binding: Of<'adaptive'>;
  view: { default: Binding | undefined; branches: BranchView[]; strict: boolean };
  set: { default: Change<Binding>; branches: ListChanges<BranchChanges>; strict: Change<boolean> };
}

/** For each kind of key: the bindings it stands for, what its controls show, and their changes. */
interface Shapes {
  symbol: {
    binding: Of<'kp'>;
    /** `symbol` is the keycode where there is one, and a space is `SPACE`. */
    view: { symbol: string; shifted: string; tag: string; shiftedByDefault: string };
    set: { symbol: Change<string>; shifted: Change<string>; tag: Change<string> };
  };
  layer: {
    binding: Of<LayerMode>;
    view: { layer: string; mode: LayerMode };
    set: { layer: Change<string>; mode: Change<LayerMode> };
  };
  modifier: {
    binding: Of<ModMode>;
    view: { mod: Mod; acts: ModMode };
    set: { mod: Change<Mod>; acts: Change<ModMode> };
  };
  taphold: {
    binding: Of<'lt' | 'hold_tap'>;
    /** A layer tap's hold is the momentary layer key it amounts to. */
    view: { tap: Binding; hold: Binding; flavor: string; term: string };
    set: {
      tap: Change<Binding>;
      hold: Change<Binding>;
      flavor: Change<string>;
      term: Change<string>;
    };
  };
  repeat: { binding: Of<'key_repeat'>; view: Nothing; set: Nothing };
  adaptive: AdaptiveShape;
  altrepeat: AdaptiveShape;
  macro: {
    binding: Of<'macro'>;
    /**
     * As text, `then` is the one layer armed after it, and `thenIsMore` says it runs something
     * else after the text, which only its steps can show.
     */
    view: { form: MacroForm; symbols: string; then: string; thenIsMore: boolean; tag: string };
    set: {
      form: Change<MacroForm>;
      symbols: Change<string>;
      then: Change<string>;
      tag: Change<string>;
      rows: Change<MacroRow[]>;
    };
  };
  tapdance: {
    binding: Of<'tap_dance'>;
    view: { taps: Binding[] };
    set: { taps: ListChanges<Change<Binding>> };
  };
  morph: {
    binding: Of<'mod_morph' | 'layer_morph'>;
    /** A modifier morph has a family and no layers; a layer morph, layers and no family. */
    view: {
      by: MorphBy;
      family: MorphFamily | null;
      layers: string[];
      plain: Binding;
      becomes: Binding;
    };
    set: {
      by: Change<MorphBy>;
      family: Change<MorphFamily>;
      /** Adds the layer, or takes it away while another is left. */
      toggleLayer: Change<string>;
      plain: Change<Binding>;
      becomes: Change<Binding>;
    };
  };
  capsword: {
    binding: Of<'caps_word'>;
    /** The symbols that do not end the word, between spaces. */
    view: { continues: string };
    set: { continues: Change<string> };
  };
  unicode: {
    binding: Of<'unicode'>;
    view: { symbol: string; shifted: string };
    set: { symbol: Change<string>; shifted: Change<string> };
  };
  deadkey: {
    binding: Of<'dead_key'>;
    view: { accent: string; shifted: string };
    set: { accent: Change<string>; shifted: Change<string> };
  };
  behaviour: {
    binding: Of<'ref'> | Of<'adaptive'> | Of<'macro'>;
    view: { runs: string };
    set: { runs: Change<string> };
  };
  transparent: { binding: Of<'trans'>; view: Nothing; set: Nothing };
  nothing: { binding: Of<'none'> | undefined; view: Nothing; set: Nothing };
  imported: { binding: Of<'raw'>; view: { label: string; source: string }; set: Nothing };
}

/**
 * A binding as its kind of key shows it. `set.kind` makes it another kind of key, keeping what
 * carries over: the symbol of a key made a tap-hold stays its tap.
 */
export type KeyFields = {
  [K in KindOfKey]: {
    kind: K;
    binding: Shapes[K]['binding'];
    view: Shapes[K]['view'];
    set: Shapes[K]['set'] & { kind: Change<KindOfKey> };
  };
}[KindOfKey];

/** The fields of one kind of key, for a body that only ever shows that kind. */
export type FieldsOf<K extends KindOfKey> = Extract<KeyFields, { kind: K }>;

/** Read a binding as its kind of key, with a change for each of its controls. */
export function keyFields(binding: Binding | undefined, ctx: BindingTextContext): KeyFields {
  const kind = kindOf(binding);
  const read = readers[kind] as Reader<KindOfKey>;
  const { view, set } = read(binding as never, ctx);
  const toKind = (to: KindOfKey) =>
    to === kind && binding ? binding : same(binding, convert(ctx, binding, to));
  return { kind, binding, view, set: { ...set, kind: toKind } } as KeyFields;
}

/** The symbols a field lists, between spaces. */
export const words = (text: string): string[] => text.split(/\s+/).filter(Boolean);

// ---------------------------------------------------------------------------- what changed

/** The same binding as written, by what a saved layout would hold: absent and empty are alike. */
function written(b: Binding): string {
  return stableStringify(bindingToJson(b));
}

/** The binding given back when the change made would change nothing. */
function same(before: Binding | undefined, after: Binding): Binding {
  return before !== undefined && written(before) === written(after) ? before : after;
}

/** A control's change, which gives the binding back when it would change nothing. */
function change<V>(b: Binding, make: (value: V) => Binding): Change<V> {
  return (value) => same(b, make(value));
}

/**
 * A part's change. A part's own changes give the part back when they change nothing, so the key is
 * given back for the very part it holds, and anything else is a change: even one a saved layout
 * would write alike, as a macro in the part switched to steps with none yet.
 */
function inPart(
  b: Binding,
  current: Binding | undefined,
  make: (next: Binding) => Binding,
): Change<Binding> {
  return (next) => (next === current ? b : make(next));
}

/** A text field's change. Committing what the field already shows changes nothing. */
function field(b: Binding, shown: string, make: (text: string) => Binding): Change<string> {
  return (text) => (text === shown ? b : same(b, make(text)));
}

/** Drop a field entirely rather than store it empty, so the document stays as it was written. */
function withOptional<B extends Binding>(b: B, key: keyof B & string, value: string): B {
  const out = { ...b } as Record<string, unknown>;
  if (value === '') delete out[key];
  else out[key] = value;
  return out as B;
}

/**
 * The changes to a list of parts: each item's own, and adding, removing and moving one. A key keeps
 * at least `least` items.
 */
function list<T, C>(
  b: Binding,
  items: readonly T[],
  put: (items: T[]) => Binding,
  fresh: () => T,
  at: (i: number) => C,
  least = 0,
): ListChanges<C> {
  const has = (i: number) => i >= 0 && i < items.length;
  return {
    at,
    add: () => put([...items, fresh()]),
    remove: (i) =>
      has(i) && items.length > least ? same(b, put(items.filter((_, j) => j !== i))) : b,
    move: (i, to) => {
      if (!has(i) || !has(to) || i === to) return b;
      const next = [...items];
      [next[i], next[to]] = [next[to], next[i]];
      return same(b, put(next));
    },
  };
}

/** A list field: the words given, or no field at all. */
function withWords<B extends Binding>(b: B, key: keyof B & string, text: string): B {
  const out = { ...b } as Record<string, unknown>;
  if (words(text).length > 0) out[key] = words(text);
  else delete out[key];
  return out as B;
}

/** The first layer above the base is the likeliest a key means when it names none. */
function likeliestLayer(ctx: BindingTextContext): string {
  return ctx.layers[1]?.id ?? ctx.layers[0].id;
}

// ---------------------------------------------------------------------------- reading a key

type Reader<K extends KindOfKey> = (
  b: Shapes[K]['binding'],
  ctx: BindingTextContext,
) => Pick<Shapes[K], 'view' | 'set'>;

const NONE = { view: {}, set: {} };

const readers: { [K in KindOfKey]: Reader<K> } = {
  symbol(b, ctx) {
    const view = {
      symbol: symbolText(b),
      shifted: b.shifted ?? '',
      tag: b.tag ?? '',
      shiftedByDefault: (b.symbol ?? '').toUpperCase(),
    };
    return {
      view,
      set: {
        symbol: field(b, view.symbol, (text) => typed(b, text, ctx)),
        shifted: field(b, view.shifted, (v) => withOptional(b, 'shifted', v)),
        tag: field(b, view.tag, (v) => withOptional(b, 'tag', v)),
      },
    };
  },
  layer: (b) => ({
    view: { layer: b.layer, mode: b.kind },
    set: {
      layer: change(b, (layer: string) => ({ ...b, layer })),
      // The options belong to one way of coming on, so another way starts afresh.
      mode: change(b, (mode: LayerMode) => (mode === b.kind ? b : { kind: mode, layer: b.layer })),
    },
  }),
  modifier: (b) => ({
    view: { mod: b.mod, acts: b.kind },
    set: {
      mod: change(b, (mod: Mod) => ({ ...b, mod })),
      acts: change(b, (acts: ModMode) => (acts === b.kind ? b : { kind: acts, mod: b.mod })),
    },
  }),
  taphold(b) {
    const hold: Binding = b.kind === 'lt' ? { kind: 'mo', layer: b.layer } : b.hold;
    const flavor = b.kind === 'hold_tap' ? b.flavor : undefined;
    const term = b.kind === 'hold_tap' ? b.tappingTermMs : undefined;
    const view = {
      tap: b.tap,
      hold,
      flavor: flavor ?? '',
      term: term === undefined ? '' : String(term),
    };
    return {
      view,
      set: {
        tap: inPart(b, b.tap, (tap) => tapHold(b, tap, hold, flavor, term)),
        hold: inPart(b, hold, (next) => tapHold(b, b.tap, next, flavor, term)),
        flavor: change(b, (f: string) => tapHold(b, b.tap, hold, f || undefined, term)),
        term: field(b, view.term, (text) => tapHold(b, b.tap, hold, flavor, milliseconds(text))),
      },
    };
  },
  repeat: () => NONE,
  adaptive: (b) => adaptive(b),
  altrepeat: (b) => adaptive(b),
  macro(b) {
    const then = b.then ?? [];
    const armed = then.length === 1 && then[0].kind === 'sl' ? then[0].layer : '';
    const view = {
      form: b.steps === undefined ? ('text' as const) : ('steps' as const),
      symbols: b.symbols ?? '',
      then: armed,
      thenIsMore: then.length > 0 && armed === '',
      tag: b.tag ?? '',
    };
    return {
      view,
      set: {
        // Not by what a saved layout would hold: a macro with no text and one with no steps are
        // written alike there, and switching between them is still the switch shown.
        form: (form: MacroForm) =>
          form === view.form ? b : form === 'steps' ? asSteps(b) : asText(b),
        symbols: field(b, view.symbols, (symbols) => ({ ...b, symbols })),
        then: change(b, (layer: string) => {
          const out = { ...b };
          if (layer) out.then = [{ kind: 'sl', layer }];
          else delete out.then;
          return out;
        }),
        tag: field(b, view.tag, (v) => withOptional(b, 'tag', v)),
        // Rows read what a macro runs after its steps as steps too, so rows that make the same
        // presses are the macro as it was, however it was written.
        rows: (rows: MacroRow[]) => {
          const next = withRows(b, rows);
          return presses(next) === presses(b) && next.tag === b.tag ? b : next;
        },
      },
    };
  },
  tapdance(b) {
    const taps = b.bindings;
    const put = (bindings: Binding[]): Binding => ({ ...b, bindings });
    const tap = (i: number) =>
      inPart(b, taps[i], (next) =>
        i < taps.length ? put(taps.map((old, j) => (j === i ? next : old))) : b,
      );
    // A tap dance keeps its one tap: with none it would do nothing at all.
    return { view: { taps }, set: { taps: list(b, taps, put, emptySymbol, tap, 1) } };
  },
  morph(b, ctx) {
    const plain = b.kind === 'mod_morph' ? b.default : b.inactive;
    const becomes = b.kind === 'mod_morph' ? b.morphed : b.active;
    const view = {
      by: b.kind,
      family: b.kind === 'mod_morph' ? familyOf(b.mods) : null,
      layers: b.kind === 'layer_morph' ? b.layers : [],
      plain,
      becomes,
    };
    return {
      view,
      set: {
        by: change(b, (by: MorphBy) => morphBy(b, by, plain, becomes, ctx)),
        family: change(b, (family: MorphFamily) =>
          b.kind === 'mod_morph' ? { ...b, mods: [...FAMILY_MODS[family]] } : b,
        ),
        toggleLayer: change(b, (layer: string) => {
          if (b.kind !== 'layer_morph') return b;
          const layers = b.layers.includes(layer)
            ? b.layers.filter((l) => l !== layer)
            : [...b.layers, layer];
          // A layer morph on no layer at all would never morph; the last one stays.
          return layers.length > 0 ? { ...b, layers } : b;
        }),
        plain: inPart(b, plain, (next) =>
          b.kind === 'mod_morph' ? { ...b, default: next } : { ...b, inactive: next },
        ),
        becomes: inPart(b, becomes, (next) =>
          b.kind === 'mod_morph' ? { ...b, morphed: next } : { ...b, active: next },
        ),
      },
    };
  },
  capsword(b) {
    const view = { continues: (b.continueList ?? []).join(' ') };
    return {
      view,
      set: { continues: field(b, view.continues, (text) => withWords(b, 'continueList', text)) },
    };
  },
  unicode(b) {
    const view = { symbol: b.symbol, shifted: b.shiftedSymbol ?? '' };
    return {
      view,
      set: {
        symbol: field(b, view.symbol, (symbol) => ({ ...b, symbol })),
        shifted: field(b, view.shifted, (v) => withOptional(b, 'shiftedSymbol', v)),
      },
    };
  },
  deadkey: (b) => ({
    view: { accent: b.diacritic, shifted: b.shifted ?? '' },
    set: {
      // An accent that was the shifted one is now the key's own, so shift arms no other.
      accent: change(b, (diacritic: string) =>
        diacritic === b.shifted ? { kind: 'dead_key', diacritic } : { ...b, diacritic },
      ),
      shifted: change(b, (v: string) => withOptional(b, 'shifted', v)),
    },
  }),
  behaviour: (b) => ({
    view: { runs: b.ref ?? '' },
    set: { runs: change(b, (ref: string) => ({ kind: 'ref', ref })) },
  }),
  transparent: () => NONE,
  nothing: () => NONE,
  imported: (b) => ({ view: { label: b.label, source: b.source ?? '' }, set: {} }),
};

// ---------------------------------------------------------------------------- tap-holds

/**
 * ZMK's `&lt` is a layer on hold over a tap, with no timing of its own. A key written as one stays
 * one while it can; anything more is a general hold-tap. A hold-tap is never quietly rewritten
 * into a layer tap, so the document keeps the shape it was written in.
 */
function tapHold(
  b: Of<'lt' | 'hold_tap'>,
  tap: Binding,
  hold: Binding,
  flavor: string | undefined,
  term: number | undefined,
): Binding {
  if (b.kind === 'lt' && hold.kind === 'mo' && flavor === undefined && term === undefined) {
    return { kind: 'lt', layer: hold.layer, tap };
  }
  const out: Of<'hold_tap'> = { kind: 'hold_tap', tap, hold };
  if (flavor !== undefined) out.flavor = flavor;
  if (term !== undefined) out.tappingTermMs = term;
  return out;
}

/** A tapping term is a positive number of milliseconds; anything else is the firmware's own. */
function milliseconds(text: string): number | undefined {
  const ms = Number.parseInt(text, 10);
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

// ---------------------------------------------------------------------------- adaptive keys

const emptySymbol = (): Binding => ({ kind: 'kp', symbol: '' });

/**
 * Branches of an adaptive key: after these symbols (or a key with this tag), do this instead. They
 * are tried from the top and the first that matches wins, so a branch that needs a tag goes above a
 * plain one for the same symbol — which is how an alt repeat gets a second stage.
 */
function adaptive(b: Of<'adaptive'>): Pick<AdaptiveShape, 'view' | 'set'> {
  const triggers = b.triggers ?? [];
  const branches = triggers.map((t) => ({
    after: (t.afterAny ?? []).join(' '),
    tags: (t.afterTags ?? []).join(' '),
    then: t.binding,
  }));
  const put = (next: AdaptiveTrigger[]): Binding => ({ ...b, triggers: next });
  const branch = (i: number): BranchChanges => {
    const t = triggers[i];
    const shown = branches[i] ?? { after: '', tags: '' };
    const replace = (next: AdaptiveTrigger) =>
      t ? put(triggers.map((old, j) => (j === i ? next : old))) : b;
    return {
      after: field(b, shown.after, (text) => {
        const next: AdaptiveTrigger = { ...t, afterAny: words(text) };
        // With a tag to go on, no symbols means any symbol; without one, a branch with no symbols
        // simply never fires — which the document can still hold.
        if (next.afterAny?.length === 0 && t?.afterTags?.length) delete next.afterAny;
        return replace(next);
      }),
      tags: field(b, shown.tags, (text) => {
        const next: AdaptiveTrigger = { ...t };
        if (words(text).length > 0) {
          next.afterTags = words(text);
          // With a tag to go on, no symbols means any symbol from a tagged key.
          if (next.afterAny?.length === 0) delete next.afterAny;
        } else {
          delete next.afterTags;
          next.afterAny = next.afterAny ?? [];
        }
        return replace(next);
      }),
      then: inPart(b, t?.binding, (binding) => replace({ ...t, binding })),
    };
  };
  return {
    view: { default: b.default, branches, strict: b.strictModifiers ?? false },
    set: {
      default: inPart(b, b.default, (d) => ({ ...b, default: d })),
      branches: list(b, triggers, put, () => ({ afterAny: [], binding: emptySymbol() }), branch),
      strict: change(b, (on: boolean) => {
        const out = { ...b };
        if (on) out.strictModifiers = true;
        else delete out.strictModifiers;
        return out;
      }),
    },
  };
}

// ---------------------------------------------------------------------------- morphs

/** The modifiers each family stands for, in the order a morph's family is read. */
const FAMILY_MODS: Record<MorphFamily, Mod[]> = {
  shift: ['LSHIFT', 'RSHIFT'],
  ctrl: ['LCTRL', 'RCTRL'],
  alt: ['LALT', 'RALT'],
  gui: ['LGUI', 'RGUI'],
};

function familyOf(mods: Mod[]): MorphFamily | null {
  const found = Object.entries(FAMILY_MODS).find(([, family]) =>
    family.some((m) => mods.includes(m)),
  );
  return found ? (found[0] as MorphFamily) : null;
}

/** A morph changed another way keeps what it types, and starts on shift or the likeliest layer. */
function morphBy(
  b: Of<'mod_morph' | 'layer_morph'>,
  by: MorphBy,
  plain: Binding,
  becomes: Binding,
  ctx: BindingTextContext,
): Binding {
  if (by === b.kind) return b;
  return by === 'mod_morph'
    ? { kind: by, mods: [...FAMILY_MODS.shift], default: plain, morphed: becomes }
    : { kind: by, layers: [likeliestLayer(ctx)], inactive: plain, active: becomes };
}

// ---------------------------------------------------------------------------- macros

/** Text split the way the simulator types it: one key press per character, composed. */
function characters(text: string): string[] {
  return Array.from(text.normalize('NFC'));
}

const press = (symbol: string): Binding => ({ kind: 'kp', symbol });

/** A step that is one character typed and nothing more, which text can say as it is. */
function isCharacter(step: Binding): step is Of<'kp'> & { symbol: string } {
  if (step.kind !== 'kp' || !step.symbol) return false;
  const split = characters(step.symbol);
  return (
    split.length === 1 && split[0] === step.symbol && written(step) === written(press(step.symbol))
  );
}

/**
 * Whether characters typed one after another read back as themselves: text is split back into
 * characters composed, so `e` then a combining accent would come back as one press of `é`.
 */
function typedApart(chars: string[]): boolean {
  const back = characters(chars.join(''));
  return back.length === chars.length && back.every((c, i) => c === chars[i]);
}

function tagOf(b: Of<'macro'>): { tag?: string } {
  return b.tag ? { tag: b.tag } : {};
}

/** A macro written as steps: its letters one press each, then what it ran after them. */
function asSteps(b: Of<'macro'>): Binding {
  if (b.steps !== undefined) return b;
  const steps = [...characters(b.symbols ?? '').map(press), ...(b.then ?? [])];
  return { kind: 'macro', steps, ...tagOf(b) };
}

/**
 * A macro written as text: the characters its steps start with, and the rest run after them. The
 * simulator types a macro's text and then runs what comes after it, so nothing it does changes.
 */
function asText(b: Of<'macro'>): Binding {
  if (b.steps === undefined) return b;
  const typed: string[] = [];
  for (const step of b.steps) {
    if (!isCharacter(step) || !typedApart([...typed, step.symbol])) break;
    typed.push(step.symbol);
  }
  const after = [...b.steps.slice(typed.length), ...(b.then ?? [])];
  return {
    kind: 'macro',
    symbols: typed.join(''),
    ...(after.length > 0 ? { then: after } : {}),
    ...tagOf(b),
  };
}

/** Rows made while editing need identities no row read from a macro already has. */
let nextRowId = 0;
function rowId(): string {
  nextRowId += 1;
  return `row-${nextRowId}`;
}

function stepsOf(row: MacroRow): Binding[] {
  switch (row.kind) {
    case 'text':
      return characters(row.text).map(press);
    case 'sl':
      return [{ kind: 'sl', layer: row.layer }];
    case 'sk':
      return [{ kind: 'sk', mod: row.mod }];
    case 'ref':
      return [{ kind: 'macro', ref: row.ref }];
    case 'fixed':
      return [row.step];
  }
}

/** The row a step reads as: one that writes it back as it is, or a fixed row that keeps it. */
function rowOf(step: Binding): MacroRow {
  const id = rowId();
  const row: MacroRow =
    step.kind === 'sl'
      ? { id, kind: 'sl', layer: step.layer }
      : step.kind === 'sk'
        ? { id, kind: 'sk', mod: step.mod }
        : step.kind === 'macro' && step.ref
          ? { id, kind: 'ref', ref: step.ref }
          : { id, kind: 'fixed', step };
  const back = stepsOf(row);
  return back.length === 1 && written(back[0]) === written(step)
    ? row
    : { id, kind: 'fixed', step };
}

/**
 * Read a macro's steps into rows, characters typed one after another as one text row. What it runs
 * after its steps is read as steps too, as it runs in that order, so every step it holds is a row.
 */
export function macroRows(macro: Of<'macro'>): MacroRow[] {
  const rows: MacroRow[] = [];
  for (const step of [...(macro.steps ?? []), ...(macro.then ?? [])]) {
    const last = rows[rows.length - 1];
    if (!isCharacter(step)) rows.push(rowOf(step));
    else if (last?.kind === 'text' && typedApart([...characters(last.text), step.symbol])) {
      last.text += step.symbol;
    } else rows.push({ id: rowId(), kind: 'text', text: step.symbol });
  }
  return rows;
}

/** A new row of a kind, that already does something: a layer or behaviour row never names none. */
export function freshRow(kind: RowKind, ctx: BindingTextContext, id = rowId()): MacroRow {
  switch (kind) {
    case 'text':
      return { id, kind, text: '' };
    case 'sl':
      return { id, kind, layer: likeliestLayer(ctx) };
    case 'sk':
      return { id, kind, mod: 'LSHIFT' };
    case 'ref':
      return { id, kind, ref: ctx.behaviors[0] ?? '' };
  }
}

/** What a macro does, press by press, however it is written. */
function presses(m: Of<'macro'>): string {
  const typed = m.steps ?? characters(m.symbols ?? '').map(press);
  return [...typed, ...(m.then ?? [])].map(written).join('\n');
}

/** The macro its rows make, all of it steps. With no rows left it types nothing, written as text. */
function withRows(b: Of<'macro'>, rows: MacroRow[]): Of<'macro'> {
  return rows.length > 0
    ? { kind: 'macro', steps: rows.flatMap(stepsOf), ...tagOf(b) }
    : { kind: 'macro', symbols: '', ...tagOf(b) };
}

// ---------------------------------------------------------------------------- symbols

/** How a key press is written in its field. A space has no visible spelling, so it takes its name. */
function symbolText(b: Of<'kp'>): string {
  if (b.keycode) return b.keycode;
  return b.symbol === ' ' ? 'SPACE' : (b.symbol ?? '');
}

/**
 * Read a field back as a key press. One character is itself; a longer word is tried as a keycode
 * first, the way the text line reads it, so `SPACE` and `N1` resolve while `ão` stays itself.
 */
function typed(b: Of<'kp'>, text: string, ctx: BindingTextContext): Binding {
  const { symbol: _s, keycode: _k, shifted: _sh, ...rest } = b;
  const next: Of<'kp'> = { ...rest, ...pressOf(text, ctx) };
  // A resolved keycode brings its own shifted symbol; one typed literally keeps the old.
  if (next.shifted === undefined && b.shifted !== undefined) next.shifted = b.shifted;
  if (!next.keycode) delete next.keycode;
  if (!next.shifted) delete next.shifted;
  return next;
}

function pressOf(text: string, ctx: BindingTextContext): Partial<Of<'kp'>> {
  if ([...text].length <= 1 || text.startsWith('&')) return { symbol: text };
  const parsed = parseBindingText(text, ctx);
  if (!parsed.ok || parsed.binding.kind !== 'kp') return { symbol: text };
  const { symbol, keycode, shifted } = parsed.binding;
  return { symbol, keycode, shifted };
}

// ---------------------------------------------------------------------------- kind changes

/** The plain key press a binding amounts to, where it has one: what is worth keeping. */
function tapOf(b: Binding | undefined): Binding | undefined {
  switch (b?.kind) {
    case 'kp':
    case 'key_repeat':
      return b;
    case 'lt':
    case 'hold_tap':
      return tapOf(b.tap);
    case 'mod_morph':
      return tapOf(b.default);
    case 'layer_morph':
      return tapOf(b.inactive);
    case 'tap_dance':
      return tapOf(b.bindings[0]);
    case 'adaptive':
      return tapOf(b.default);
    default:
      return undefined;
  }
}

function layerOf(b: Binding | undefined): string | undefined {
  switch (b?.kind) {
    case 'mo':
    case 'sl':
    case 'tog':
    case 'to':
    case 'auto_layer':
    case 'lt':
      return b.layer;
    case 'hold_tap':
      return layerOf(b.hold);
    default:
      return undefined;
  }
}

function modOf(b: Binding | undefined): Mod | undefined {
  switch (b?.kind) {
    case 'sk':
    case 'mod':
      return b.mod;
    case 'hold_tap':
      return modOf(b.hold);
    default:
      return undefined;
  }
}

/** The adaptive key or alt repeat a binding is, or carries as the tap of a tap-hold. */
function adaptiveOf(b: Binding | undefined): Of<'adaptive'> | undefined {
  switch (b?.kind) {
    case 'adaptive':
      return b.ref ? undefined : b;
    case 'lt':
    case 'hold_tap':
      return adaptiveOf(b.tap);
    default:
      return undefined;
  }
}

const EMPTY_SYMBOL: Binding = { kind: 'kp', symbol: '' };

/**
 * Turn a binding into another kind, keeping whatever carries over: the symbol of a key made into
 * a tap-hold stays its tap, the layer of a layer key made into a tap-hold becomes its hold. A kind
 * change is a first step, never a loss of what the key already did that the new kind can hold.
 */
function convert(ctx: BindingTextContext, current: Binding | undefined, to: KindOfKey): Binding {
  const tapped = tapOf(current);
  const tap = tapped ?? EMPTY_SYMBOL;
  const layer = layerOf(current) ?? likeliestLayer(ctx);
  const mod = modOf(current) ?? 'LSHIFT';
  const symbol = tap.kind === 'kp' ? tap : EMPTY_SYMBOL;
  const adaptive = adaptiveOf(current);
  switch (to) {
    case 'symbol':
      return symbol;
    case 'layer':
      return { kind: 'mo', layer };
    case 'modifier':
      return { kind: 'mod', mod };
    case 'taphold': {
      // An adaptive key, an alt repeat or a repeat key stays the tap, as a symbol does.
      const keptTap = adaptive ?? (current?.kind === 'key_repeat' ? current : symbol);
      // A modifier key keeps its modifier on hold — a home-row mod — and anything else gets a layer.
      return modOf(current) && !layerOf(current)
        ? { kind: 'hold_tap', tap: keptTap, hold: { kind: 'mod', mod } }
        : { kind: 'lt', layer, tap: keptTap };
    }
    case 'repeat':
      return { kind: 'key_repeat' };
    case 'adaptive':
      // An adaptive key that is a tap-hold's tap comes out of it, branches and all.
      if (adaptive) {
        return {
          ...adaptive,
          default: adaptive.default?.kind === 'key_repeat' ? EMPTY_SYMBOL : adaptive.default,
        };
      }
      return {
        kind: 'adaptive',
        default: tapped?.kind === 'kp' ? tapped : EMPTY_SYMBOL,
        triggers: [],
      };
    case 'altrepeat':
      if (adaptive) return { ...adaptive, default: { kind: 'key_repeat' } };
      return { kind: 'adaptive', default: { kind: 'key_repeat' }, triggers: [] };
    case 'macro':
      return { kind: 'macro', symbols: symbol.kind === 'kp' ? (symbol.symbol ?? '') : '' };
    case 'tapdance':
      return { kind: 'tap_dance', bindings: [tap, EMPTY_SYMBOL] };
    case 'morph':
      return { kind: 'mod_morph', mods: ['LSHIFT', 'RSHIFT'], default: tap, morphed: EMPTY_SYMBOL };
    case 'capsword':
      return { kind: 'caps_word' };
    case 'unicode':
      return { kind: 'unicode', symbol: symbol.kind === 'kp' ? (symbol.symbol ?? '') : '' };
    case 'deadkey':
      return { kind: 'dead_key', diacritic: '´' };
    case 'behaviour':
      return ctx.behaviors.length > 0 ? { kind: 'ref', ref: ctx.behaviors[0] } : { kind: 'none' };
    case 'transparent':
      return { kind: 'trans' };
    case 'imported':
      return current ?? { kind: 'none' };
    default:
      return { kind: 'none' };
  }
}
