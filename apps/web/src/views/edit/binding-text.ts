import {
  type Binding,
  type CompiledLayout,
  type HostLocale,
  MODS,
  type Mod,
  tapLabel,
  translateKeycode,
} from '@layerbench/core';
import { type BindingFields, EMPTY_FIELDS } from './binding-form.js';

/**
 * A ZMK-flavoured text form for a binding, so a key can be edited by typing on it.
 *
 * `&kp A`, `&lt num a`, `&sl sym`, `&mo num`, `&trans` are spelled as ZMK spells them; the kinds
 * this model has and ZMK does not (`&auto_layer`, `&dead`, `&uni`) follow the same `&name args`
 * shape. A bare token with no `&` is shorthand for `&kp`, so typing `ç` still just works.
 *
 * Everything here goes through `BindingFields`, never straight to a `Binding`, so
 * `bindingFromFields` stays the one place a binding is constructed from text.
 */
export interface BindingTextContext {
  layers: { id: string; name: string }[];
  behaviors: string[];
  hostLocale: HostLocale;
}

export type ParseResult = { ok: true; fields: BindingFields } | { ok: false; error: string };

export interface BindingText {
  /** The binding as text. When `exact` is false this is a legend to read, not a source to edit. */
  text: string;
  /** False when committing this text back would drop something the binding carries. */
  exact: boolean;
  /** Why it cannot be typed. Shown by the editor when it locks itself. */
  why?: string;
}

export interface Suggestion {
  /** The full text the input should hold once this is taken. */
  insert: string;
  label: string;
  hint?: string;
}

/** ZMK writes a modifier several ways; all of them mean one of the eight the model has. */
const MOD_ALIASES: Record<string, Mod> = {
  LS: 'LSHIFT',
  LSFT: 'LSHIFT',
  LSHFT: 'LSHIFT',
  LSHIFT: 'LSHIFT',
  RS: 'RSHIFT',
  RSFT: 'RSHIFT',
  RSHFT: 'RSHIFT',
  RSHIFT: 'RSHIFT',
  LC: 'LCTRL',
  LCTL: 'LCTRL',
  LCTRL: 'LCTRL',
  RC: 'RCTRL',
  RCTL: 'RCTRL',
  RCTRL: 'RCTRL',
  LA: 'LALT',
  LALT: 'LALT',
  LOPT: 'LALT',
  RA: 'RALT',
  RALT: 'RALT',
  ROPT: 'RALT',
  LG: 'LGUI',
  LGUI: 'LGUI',
  LCMD: 'LGUI',
  LWIN: 'LGUI',
  RG: 'RGUI',
  RGUI: 'RGUI',
  RCMD: 'RGUI',
  RWIN: 'RGUI',
};

/** Behaviour names the syntax knows, and the spelling each one is written back as. */
const BEHAVIORS: Record<string, string> = {
  kp: 'kp',
  trans: 'trans',
  none: 'none',
  mo: 'mo',
  lt: 'lt',
  sl: 'sl',
  tog: 'tog',
  to: 'to',
  sk: 'sk',
  caps_word: 'caps_word',
  capsword: 'caps_word',
  caps: 'caps_word',
  key_repeat: 'key_repeat',
  repeat: 'key_repeat',
  auto_layer: 'auto_layer',
  autolayer: 'auto_layer',
  macro: 'macro',
  dead_key: 'dead_key',
  dead: 'dead_key',
  unicode: 'unicode',
  uni: 'unicode',
  ref: 'ref',
};

const LAYER_BEHAVIORS = ['mo', 'sl', 'to', 'tog', 'auto_layer'];

function err(error: string): ParseResult {
  return { ok: false, error };
}

function ok(fields: Partial<BindingFields>): ParseResult {
  return { ok: true, fields: { ...EMPTY_FIELDS, ...fields } as BindingFields };
}

function asMod(token: string): Mod | undefined {
  return MOD_ALIASES[token.toUpperCase()];
}

/** Resolve a layer argument, which may be written as the id, the name, or the index ZMK uses. */
function resolveLayer(token: string, ctx: BindingTextContext): string | undefined {
  const lower = token.toLowerCase();
  const byId = ctx.layers.find((l) => l.id.toLowerCase() === lower);
  if (byId) return byId.id;
  const byName = ctx.layers.find((l) => l.name.toLowerCase() === lower);
  if (byName) return byName.id;
  if (/^\d+$/.test(token)) return ctx.layers[Number(token)]?.id;
  return undefined;
}

function layerError(token: string, ctx: BindingTextContext): string {
  const names = ctx.layers.map((l) => l.id).join(', ');
  return token === ''
    ? `name a layer: ${names}`
    : `no layer called \`${token}\` — try one of: ${names}`;
}

/**
 * A `kp` argument. Under the `symbols` host locale the simulator never reads `keycode`, so a
 * keycode has to be resolved to the symbol it types or the key would silently type nothing.
 */
function keycodeFields(token: string, ctx: BindingTextContext): Partial<BindingFields> {
  if (ctx.hostLocale !== 'symbols') return { kind: 'kp', keycode: token };
  const plain = translateKeycode('us', token);
  if (!plain || plain.deadKey || plain.symbol === '') return { kind: 'kp', symbol: token };
  const shifted = translateKeycode('us', token, ['LSHIFT']);
  const alt = shifted && !shifted.deadKey ? shifted.symbol : '';
  return {
    kind: 'kp',
    symbol: plain.symbol,
    // Only worth recording when shift does something the default upper-casing would not.
    shifted: alt && alt !== plain.symbol.toUpperCase() ? alt : '',
  };
}

/** A trailing `tag:<name>` is stripped before the behaviour's own arguments are read. */
function takeTag(rest: string): { rest: string; tag: string } {
  const m = /\s+tag:([^\s]+)$/.exec(rest);
  if (!m) return { rest, tag: '' };
  return { rest: rest.slice(0, m.index).trim(), tag: m[1] };
}

export function parseBindingText(text: string, ctx: BindingTextContext): ParseResult {
  const raw = text.trim();
  if (raw === '') return err('Type a binding, for example `&kp A`, `&lt num a` or `ç`');

  if (!raw.startsWith('&')) {
    const { rest, tag } = takeTag(raw);
    // A single grapheme is meant literally; anything longer is read as a keycode name first, so
    // `N1` and `SPACE` resolve while `ç` and `ão` stay themselves.
    if ([...rest].length <= 1) return ok({ kind: 'kp', symbol: rest, tag });
    return ok({ ...keycodeFields(rest, ctx), tag });
  }

  const m = /^&([A-Za-z_][A-Za-z0-9_]*)\s*([\s\S]*)$/.exec(raw);
  if (!m) return err(`\`${raw}\` is not a binding — a behaviour is \`&\` and a name`);
  const written = m[1];
  const name = BEHAVIORS[written.toLowerCase()];
  const { rest, tag } = takeTag(m[2].trim());

  if (name === undefined) {
    const behavior =
      ctx.behaviors.find((b) => b === written) ??
      ctx.behaviors.find((b) => b.toLowerCase() === written.toLowerCase());
    if (behavior) return ok({ kind: 'ref', ref: behavior });
    const known = ctx.behaviors.length > 0 ? ` or a behaviour: ${ctx.behaviors.join(', ')}` : '';
    return err(
      `\`&${written}\` is not a behaviour — try \`&kp\`, \`&mo\`, \`&lt\`, \`&trans\`${known}`,
    );
  }

  switch (name) {
    case 'kp': {
      if (rest === '') return err('`&kp` needs a keycode or a symbol, for example `&kp A`');
      const mod = asMod(rest);
      if (mod) return ok({ kind: 'mod', mod });
      return ok({ ...keycodeFields(rest, ctx), tag });
    }
    case 'trans':
    case 'none':
    case 'key_repeat':
    case 'caps_word':
      return ok({ kind: name });
    case 'mo':
    case 'sl':
    case 'to':
    case 'tog':
    case 'auto_layer': {
      const layer = resolveLayer(rest, ctx);
      if (!layer) return err(layerError(rest, ctx));
      return ok({ kind: name, layer });
    }
    case 'lt': {
      const [layerToken = '', ...tail] = rest.split(/\s+/);
      const layer = resolveLayer(layerToken, ctx);
      if (!layer) return err(layerError(layerToken, ctx));
      const tap = tail.join(' ');
      if (tap === '') return err('`&lt` needs a layer and a tap, for example `&lt num a`');
      const tapFields = [...tap].length <= 1 ? { symbol: tap } : keycodeFields(tap, ctx);
      return ok({ kind: 'lt', layer, symbol: '', keycode: '', ...tapFields, tag });
    }
    case 'sk': {
      const mod = asMod(rest);
      if (!mod) return err(`\`${rest}\` is not a modifier — try ${MODS.join(', ')}`);
      return ok({ kind: 'sk', mod });
    }
    case 'macro': {
      const then = /\s+then\s+([^\s]+)$/.exec(rest);
      const symbols = then ? rest.slice(0, then.index) : rest;
      if (symbols.trim() === '') return err('`&macro` needs text, for example `&macro ão`');
      if (!then) return ok({ kind: 'macro', symbol: symbols, tag });
      const layer = resolveLayer(then[1], ctx);
      if (!layer) return err(layerError(then[1], ctx));
      return ok({ kind: 'macro', symbol: symbols, thenLayer: layer, tag });
    }
    case 'dead_key':
      if (rest === '') return err('`&dead` needs a diacritic, for example `&dead ´`');
      return ok({ kind: 'dead_key', symbol: rest });
    case 'unicode': {
      const [symbol = '', shifted = ''] = rest.split(/\s+/);
      if (symbol === '') return err('`&uni` needs a symbol, for example `&uni →`');
      return ok({ kind: 'unicode', symbol, shifted });
    }
    default: {
      if (rest === '') return err('`&ref` needs a behaviour name');
      const behavior =
        ctx.behaviors.find((b) => b === rest) ??
        ctx.behaviors.find((b) => b.toLowerCase() === rest.toLowerCase());
      if (!behavior) return err(`no behaviour called \`${rest}\``);
      return ok({ kind: 'ref', ref: behavior });
    }
  }
}

/** How a `kp` argument is written back. A space has no visible spelling, so it takes its name. */
function keycodeText(b: { symbol?: string; keycode?: string }): string | null {
  if (b.keycode) return b.keycode;
  const symbol = b.symbol ?? '';
  if (symbol === ' ') return 'SPACE';
  if (symbol === '' || /\s/.test(symbol)) return null;
  return symbol;
}

function layerId(compiled: CompiledLayout, id: string): string {
  return compiled.layers.find((l) => l.id === id)?.id ?? id;
}

function withTag(text: string, tag: string | undefined): string {
  return tag ? `${text} tag:${tag}` : text;
}

/** The text for a binding the syntax covers exactly, or `null` when it does not cover it. */
function exactText(compiled: CompiledLayout, b: Binding): string | null {
  switch (b.kind) {
    case 'kp': {
      const token = keycodeText(b);
      return token === null ? null : withTag(`&kp ${token}`, b.tag);
    }
    case 'trans':
    case 'none':
    case 'key_repeat':
      return `&${b.kind}`;
    case 'caps_word':
      return b.continueList !== undefined || (b.mods !== undefined && b.mods.length > 0)
        ? null
        : '&caps_word';
    case 'mo':
    case 'to':
      return `&${b.kind} ${layerId(compiled, b.layer)}`;
    case 'sl':
      return b.quickRelease !== undefined ||
        b.ignoreModifiers !== undefined ||
        b.releaseAfterMs !== undefined
        ? null
        : `&sl ${layerId(compiled, b.layer)}`;
    case 'tog':
      return b.mode !== undefined && b.mode !== 'flip'
        ? null
        : `&tog ${layerId(compiled, b.layer)}`;
    case 'auto_layer':
      return b.continueList !== undefined ? null : `&auto_layer ${layerId(compiled, b.layer)}`;
    case 'lt': {
      if (b.tap.kind !== 'kp' || b.tap.shifted !== undefined) return null;
      const token = keycodeText(b.tap);
      return token === null
        ? null
        : withTag(`&lt ${layerId(compiled, b.layer)} ${token}`, b.tap.tag);
    }
    case 'sk':
      return b.quickRelease !== undefined ||
        b.ignoreModifiers !== undefined ||
        b.releaseAfterMs !== undefined
        ? null
        : `&sk ${b.mod}`;
    case 'mod':
      return `&kp ${b.mod}`;
    case 'macro': {
      if (b.ref !== undefined || b.steps !== undefined || !b.symbols) return null;
      const then = b.then;
      if (then === undefined) return withTag(`&macro ${b.symbols}`, b.tag);
      if (then.length !== 1 || then[0].kind !== 'sl') return null;
      return withTag(`&macro ${b.symbols} then ${layerId(compiled, then[0].layer)}`, b.tag);
    }
    case 'dead_key':
      return `&dead ${b.diacritic}`;
    case 'unicode':
      return b.shiftedSymbol ? `&uni ${b.symbol} ${b.shiftedSymbol}` : `&uni ${b.symbol}`;
    case 'ref':
      return `&${b.ref}`;
    default:
      // adaptive, mod_morph, layer_morph, tap_dance and hold_tap are authored elsewhere.
      return null;
  }
}

/** What to tell the user when a binding cannot be typed: what it is, in a few words. */
function whyNot(b: Binding): string {
  switch (b.kind) {
    case 'adaptive':
      return 'an adaptive key, with branches';
    case 'hold_tap':
      return 'a hold-tap';
    case 'mod_morph':
      return 'a mod-morph';
    case 'layer_morph':
      return 'a layer-morph';
    case 'tap_dance':
      return 'a tap dance';
    case 'macro':
      return b.ref !== undefined
        ? 'a macro that refers to a behaviour'
        : 'a macro built from steps';
    case 'caps_word':
      return 'a caps word carrying its own continue list';
    case 'sl':
    case 'sk':
      return 'a one-shot carrying release options';
    case 'tog':
      return 'a toggle that locks in one direction';
    case 'auto_layer':
      return 'an auto layer carrying its own continue list';
    case 'lt':
      return 'a layer tap whose tap is more than a plain key press';
    case 'kp':
      return 'a key press whose symbol contains a space';
    case 'raw':
      return `an imported key (${b.source ?? b.label}) that LayerBench keeps but does not simulate`;
    default:
      return 'a binding this syntax has no spelling for';
  }
}

/**
 * Write a binding as text, saying whether the text is the whole binding. When `exact` is false the
 * text line starts empty rather than offering the text: committing it back would quietly drop what
 * the syntax has no room for, and on a layout full of adaptive keys that would be one Enter away.
 */
export function bindingText(compiled: CompiledLayout, b: Binding | undefined): BindingText {
  if (!b) return { text: '', exact: true };
  const text = exactText(compiled, b);
  if (text !== null) return { text, exact: true };
  return { text: tapLabel(compiled, b) || b.kind, exact: false, why: whyNot(b) };
}

/** Completions for the text being typed: behaviour names, then that behaviour's own argument. */
export function suggest(text: string, ctx: BindingTextContext): Suggestion[] {
  const raw = text.trimStart();

  // An empty field offers the whole list. On a phone that is the difference between the editor
  // being usable and not: `&` lives on the symbol page of the on-screen keyboard, so a menu that
  // only appears once you have typed one is a menu nobody reaches.
  const behavior = /^&([A-Za-z_][A-Za-z0-9_]*)?$/.exec(raw);
  if (raw === '' || behavior) {
    const prefix = (behavior?.[1] ?? '').toLowerCase();
    const builtins = [...new Set(Object.values(BEHAVIORS))]
      .filter((name) => name.startsWith(prefix))
      .map((name) => ({ insert: `&${name}`, label: `&${name}`, hint: 'behaviour' }));
    const named = ctx.behaviors
      .filter((name) => name.toLowerCase().startsWith(prefix))
      .map((name) => ({ insert: `&${name}`, label: `&${name}`, hint: 'this layout' }));
    return [...builtins, ...named];
  }

  const withLayer = /^&([A-Za-z_][A-Za-z0-9_]*)\s+([^\s]*)$/.exec(raw);
  if (withLayer) {
    const name = BEHAVIORS[withLayer[1].toLowerCase()];
    const prefix = withLayer[2].toLowerCase();
    if (name !== undefined && (LAYER_BEHAVIORS.includes(name) || name === 'lt')) {
      // An argument already written in full needs no menu; offering it again is a dead end.
      if (ctx.layers.some((l) => l.id.toLowerCase() === prefix)) return [];
      return ctx.layers
        .filter((l) => l.id.toLowerCase().startsWith(prefix))
        .map((l) => ({
          // A layer tap still wants its tap key, so the space that takes it comes along.
          insert: `&${withLayer[1]} ${l.id}${name === 'lt' ? ' ' : ''}`,
          label: l.id,
          hint: l.name,
        }));
    }
    if (name === 'sk' || name === 'kp') {
      if (MODS.some((mod) => mod.toLowerCase() === prefix)) return [];
      return MODS.filter((mod) => mod.toLowerCase().startsWith(prefix)).map((mod) => ({
        insert: `&${withLayer[1]} ${mod}`,
        label: mod,
        hint: 'modifier',
      }));
    }
  }

  return [];
}
