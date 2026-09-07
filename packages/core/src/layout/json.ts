import type {
  ActivatorDef,
  Binding,
  ComboDef,
  GeometryRef,
  LayerDef,
  Layout,
  TypingPathEntry,
} from './types.js';

/**
 * Canonical JSON for a layout: the exact document the reference implementation writes, and the
 * format used for storage, share links and hashing. `null`, `{}` and `[]` are dropped, except where
 * the reference keeps them (`keys.shift` is written as `null` when unset).
 */
export type LayoutJson = Record<string, unknown>;

function compact<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    out[k] = v;
  }
  return out;
}

/** Binding → JSON. Drops absent and empty fields; writes the defaults the reference writes. */
export function bindingToJson(b: Binding): Record<string, unknown> {
  const base: Record<string, unknown> = { kind: b.kind };
  let extra: Record<string, unknown> = {};
  switch (b.kind) {
    case 'kp':
      extra = { symbol: b.symbol, keycode: b.keycode, shifted: b.shifted };
      break;
    case 'mo':
    case 'to':
      extra = { layer: b.layer };
      break;
    case 'lt':
      extra = { layer: b.layer, tap: bindingToJson(b.tap) };
      break;
    case 'sl':
      extra = {
        layer: b.layer,
        quickRelease: b.quickRelease,
        ignoreModifiers: b.ignoreModifiers,
        releaseAfterMs: b.releaseAfterMs,
      };
      break;
    case 'tog':
      extra = { layer: b.layer, mode: b.mode ?? 'flip' };
      break;
    case 'sk':
      extra = {
        mod: b.mod,
        quickRelease: b.quickRelease,
        ignoreModifiers: b.ignoreModifiers,
        releaseAfterMs: b.releaseAfterMs,
      };
      break;
    case 'mod':
      extra = { mod: b.mod };
      break;
    case 'caps_word':
      extra = { continueList: b.continueList, mods: b.mods ?? [] };
      break;
    case 'auto_layer':
      extra = { layer: b.layer, continueList: b.continueList };
      break;
    case 'mod_morph':
      extra = {
        mods: b.mods,
        default: bindingToJson(b.default),
        morphed: bindingToJson(b.morphed),
        keepMods: b.keepMods ?? [],
      };
      break;
    case 'layer_morph':
      extra = {
        layers: b.layers,
        match: b.match ?? 'any',
        active: bindingToJson(b.active),
        inactive: bindingToJson(b.inactive),
      };
      break;
    case 'tap_dance':
      extra = { bindings: b.bindings.map(bindingToJson) };
      break;
    case 'macro':
      extra = {
        steps: b.steps?.map(bindingToJson),
        symbols: b.symbols,
        then: b.then?.map(bindingToJson),
        ref: b.ref,
      };
      break;
    case 'adaptive':
      extra = {
        default: b.default ? bindingToJson(b.default) : undefined,
        triggers: b.triggers?.map((t) => ({
          afterAny: t.afterAny,
          binding: bindingToJson(t.binding),
        })),
        strictModifiers: b.strictModifiers,
        deadKeys: b.deadKeys,
        ref: b.ref,
      };
      break;
    case 'hold_tap':
      extra = {
        tap: bindingToJson(b.tap),
        hold: bindingToJson(b.hold),
        flavor: b.flavor,
        tappingTermMs: b.tappingTermMs,
      };
      break;
    case 'dead_key':
      extra = { diacritic: b.diacritic };
      break;
    case 'unicode':
      extra = { symbol: b.symbol, shiftedSymbol: b.shiftedSymbol };
      break;
    case 'ref':
      extra = { ref: b.ref };
      break;
    default:
      extra = {};
  }
  return compact({ ...base, ...extra });
}

function geometryToJson(g: GeometryRef): Record<string, unknown> {
  if ('preset' in g) {
    const offsets = g.columnOffsets ?? {};
    return compact({ preset: g.preset, columnOffsets: offsets });
  }
  return compact({ custom: g.custom, family: g.family, name: g.name });
}

function layerToJson(l: LayerDef): Record<string, unknown> {
  const bindings: Record<string, unknown> = {};
  for (const [k, b] of Object.entries(l.bindings)) bindings[k] = bindingToJson(b);
  return compact({ id: l.id, name: l.name, shiftedTwin: l.shiftedTwin, bindings });
}

function comboToJson(c: ComboDef): Record<string, unknown> {
  return compact({
    id: c.id,
    keys: c.keys,
    binding: bindingToJson(c.binding),
    layers: c.layers,
    role: c.role ?? 'command',
    timeoutMs: c.timeoutMs,
    slowRelease: c.slowRelease,
  });
}

function pathToJson(e: TypingPathEntry): Record<string, unknown> {
  return compact({
    producer: e.producer,
    enabled: e.enabled ?? true,
    when: e.when?.afterAny ? { afterAny: e.when.afterAny } : undefined,
  });
}

function activatorToJson(a: ActivatorDef): Record<string, unknown> {
  const mods = a.requires?.mods ?? [];
  return compact({
    from: a.from,
    via: a.via,
    requires: mods.length ? { mods } : undefined,
  });
}

/** The canonical document for a layout. Stable across encode → decode → encode. */
export function toCanonicalJson(layout: Layout): LayoutJson {
  const typingPaths: Record<string, unknown> = {};
  for (const [sym, entries] of Object.entries(layout.typingPaths ?? {})) {
    typingPaths[sym] = entries.map(pathToJson);
  }
  const activators: Record<string, unknown> = {};
  for (const [layer, defs] of Object.entries(layout.activators ?? {})) {
    activators[layer] = defs.map(activatorToJson);
  }
  const behaviors: Record<string, unknown> = {};
  for (const [name, b] of Object.entries(layout.behaviors ?? {})) {
    behaviors[name] = bindingToJson(b);
  }
  const behaviorDefaults: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(layout.behaviorDefaults ?? {})) {
    if (v) behaviorDefaults[k] = compact(v as Record<string, unknown>);
  }

  return compact({
    format: layout.format,
    id: layout.id,
    name: layout.name,
    author: layout.author,
    description: layout.description,
    languages: layout.languages,
    hostLocale: layout.hostLocale ?? 'symbols',
    geometry: geometryToJson(layout.geometry),
    fingering:
      layout.fingering === undefined || layout.fingering === 'standard'
        ? undefined
        : layout.fingering === 'angle-mod'
          ? 'angle-mod'
          : layout.fingering,
    keys: { space: layout.keys.space, shift: layout.keys.shift ?? null },
    behaviorDefaults,
    layers: layout.layers.map(layerToJson),
    behaviors,
    combos: (layout.combos ?? []).map(comboToJson),
    conditionalLayers: (layout.conditionalLayers ?? []).map((c) => ({ if: c.if, then: c.then })),
    typingPaths,
    repeatPolicy: {
      doubledLetters: layout.repeatPolicy?.doubledLetters === 'tapTwice' ? 'tapTwice' : 'repeatKey',
    },
    activators,
  });
}

/** JSON text of the canonical document. */
export function encodeLayout(layout: Layout): string {
  return JSON.stringify(toCanonicalJson(layout));
}
