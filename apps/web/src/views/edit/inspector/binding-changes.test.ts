import {
  applyEdit,
  type Binding,
  BUNDLED_LAYOUTS,
  bindingToJson,
  bundledLayout,
  type CompiledLayout,
  compileLayout,
  type Layout,
  stableStringify,
} from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import type { BindingTextContext } from '../binding-text.js';
import { type FieldsOf, keyFields } from './binding-changes.js';
import { type KindOfKey, kindOf, MORE_KINDS, PRIMARY_KINDS } from './kinds.js';

/** The context the key inspector builds for a layout. */
function contextOf(compiled: CompiledLayout): BindingTextContext {
  return {
    layers: compiled.layers.map((l) => ({ id: l.id, name: l.name })),
    behaviors: Object.keys(compiled.expanded.behaviors ?? {}),
    hostLocale: compiled.hostLocale,
  };
}

const romak = compileLayout(bundledLayout('magic-romak') as never);
// Magic Romak's adaptive keys sit on its keys rather than in named behaviours, so none are offered.
const ctx: BindingTextContext = { ...contextOf(romak), behaviors: [] };
const to = (b: Binding | undefined, kind: KindOfKey) => keyFields(b, ctx).set.kind(kind);

/** The fields of a binding that is that kind of key. */
function fieldsOf<K extends KindOfKey>(kind: K, b: Binding, context = ctx): FieldsOf<K> {
  const fields = keyFields(b, context);
  expect(fields.kind).toBe(kind);
  return fields as FieldsOf<K>;
}

const adaptiveKey: Binding = {
  kind: 'adaptive',
  default: { kind: 'kp', symbol: 'h' },
  triggers: [{ afterAny: ['a'], binding: { kind: 'kp', symbol: 'v' } }],
};

describe('changing what a key is', () => {
  it('keeps an adaptive key as the tap when the key becomes a tap-hold', () => {
    const held = to(adaptiveKey, 'taphold');
    expect(held).toEqual({ kind: 'lt', layer: 'alpha2', tap: adaptiveKey });
    expect(kindOf(held)).toBe('taphold');
    expect(to({ kind: 'key_repeat' }, 'taphold')).toEqual({
      kind: 'lt',
      layer: 'alpha2',
      tap: { kind: 'key_repeat' },
    });
  });

  it("takes a tap-hold's adaptive tap out, branches and all, when the key becomes an adaptive key", () => {
    const held: Binding = {
      kind: 'hold_tap',
      tap: adaptiveKey,
      hold: { kind: 'mod', mod: 'LGUI' },
    };
    expect(to(held, 'adaptive')).toEqual(adaptiveKey);
    expect(to(held, 'altrepeat')).toEqual({ ...adaptiveKey, default: { kind: 'key_repeat' } });
    expect(to(held, 'symbol')).toEqual({ kind: 'kp', symbol: 'h' });
  });

  it('turns an alt repeat with tagged branches into an adaptive key and back, keeping them', () => {
    const alt: Binding = {
      kind: 'adaptive',
      default: { kind: 'key_repeat' },
      triggers: [{ afterAny: ['e'], afterTags: ['alpha2'], binding: { kind: 'kp', symbol: 'x' } }],
    };
    expect(kindOf(alt)).toBe('altrepeat');
    const back = to(to(alt, 'adaptive'), 'altrepeat');
    expect(back).toEqual(alt);
  });

  it('makes a repeat key an alt repeat that repeats until it is given branches', () => {
    expect(to({ kind: 'key_repeat' }, 'altrepeat')).toEqual({
      kind: 'adaptive',
      default: { kind: 'key_repeat' },
      triggers: [],
    });
  });

  it('gives the key back as it was when it is already that kind', () => {
    expect(to(adaptiveKey, 'adaptive')).toBe(adaptiveKey);
  });

  it('turns any key of a bundled layout into any kind of key, and the layout still compiles', () => {
    const offered = [...PRIMARY_KINDS, ...MORE_KINDS].map((k) => k.kind);
    for (const layout of BUNDLED_LAYOUTS) {
      const compiled = compileLayout(layout);
      const context = contextOf(compiled);
      const kinds = offered.filter((k) => k !== 'behaviour' || context.behaviors.length > 0);
      const made = new Map<string, { layer: string; key: string; binding: Binding }>();
      for (const { layer, key, binding } of keysOf(layout)) {
        for (const kind of kinds) {
          const next = keyFields(binding, context).set.kind(kind);
          expect(kindOf(next), `${layout.id} ${layer}/${key} as ${kind}`).toBe(kind);
          made.set(stableStringify(bindingToJson(next)), { layer, key, binding: next });
        }
      }
      for (const { layer, key, binding } of made.values()) {
        const outcome = applyEdit(layout, { kind: 'bind', layer, keys: [key], binding });
        expect(outcome.status, `${layout.id} ${layer}/${key}`).not.toBe('refused');
      }
    }
  });
});

describe('what each kind of key shows, and what its controls change', () => {
  it('reads a symbol as the text line does: one character as itself, a longer word as a keycode', () => {
    const accented = fieldsOf('symbol', { kind: 'kp', symbol: 'a', shifted: 'Á' });
    // Typed literally, it keeps the shifted symbol it had; a keycode brings its own.
    expect(accented.set.symbol('ç')).toEqual({ kind: 'kp', symbol: 'ç', shifted: 'Á' });
    expect(accented.set.symbol('ão')).toEqual({ kind: 'kp', symbol: 'ão', shifted: 'Á' });
    expect(accented.set.symbol('N1')).toEqual({ kind: 'kp', symbol: '1', shifted: '!' });
    expect(accented.view.shiftedByDefault).toBe('A');
  });

  it('changes nothing when a field is committed as it is shown', () => {
    const space: Binding = { kind: 'kp', symbol: ' ' };
    const shown = fieldsOf('symbol', space);
    expect(shown.view.symbol).toBe('SPACE');
    expect(shown.set.symbol('SPACE')).toBe(space);
    // Even where the host would keep `SPACE` as a keycode rather than read it as a space.
    expect(fieldsOf('symbol', space, { ...ctx, hostLocale: 'us' }).set.symbol('SPACE')).toBe(space);
    expect(shown.set.tag('')).toBe(space);
  });

  it('drops an optional field emptied, rather than store it empty', () => {
    const tagged = fieldsOf('symbol', { kind: 'kp', symbol: 'u', shifted: 'Ú', tag: 'qu' });
    expect(tagged.set.tag('')).toEqual({ kind: 'kp', symbol: 'u', shifted: 'Ú' });
    expect(tagged.set.shifted('')).toEqual({ kind: 'kp', symbol: 'u', tag: 'qu' });
    const arrow = fieldsOf('unicode', { kind: 'unicode', symbol: '→', shiftedSymbol: '⇒' });
    expect(arrow.set.shifted('')).toEqual({ kind: 'unicode', symbol: '→' });
  });

  it("keeps a layer key's options for another layer, and starts afresh another way of coming on", () => {
    const oneShot: Binding = { kind: 'sl', layer: 'alpha2', quickRelease: true };
    const layer = fieldsOf('layer', oneShot);
    expect(layer.view).toEqual({ layer: 'alpha2', mode: 'sl' });
    expect(layer.set.layer('ccedil')).toEqual({ kind: 'sl', layer: 'ccedil', quickRelease: true });
    expect(layer.set.mode('mo')).toEqual({ kind: 'mo', layer: 'alpha2' });
    expect(layer.set.mode('sl')).toBe(oneShot);
    const sticky: Binding = { kind: 'sk', mod: 'LSHIFT', quickRelease: true };
    const modifier = fieldsOf('modifier', sticky);
    expect(modifier.set.mod('LCTRL')).toEqual({ kind: 'sk', mod: 'LCTRL', quickRelease: true });
    expect(modifier.set.acts('mod')).toEqual({ kind: 'mod', mod: 'LSHIFT' });
    expect(modifier.set.acts('sk')).toBe(sticky);
  });

  it("lists caps word's symbols that do not end the word, or none at all", () => {
    const caps = fieldsOf('capsword', { kind: 'caps_word' });
    expect(caps.set.continues('- _')).toEqual({ kind: 'caps_word', continueList: ['-', '_'] });
    const listed = fieldsOf('capsword', { kind: 'caps_word', continueList: ['-'] });
    expect(listed.view.continues).toBe('-');
    expect(listed.set.continues(' ')).toEqual({ kind: 'caps_word' });
  });

  it('gives a dead key the accent it was shifted to, and no shifted accent then', () => {
    const acute = fieldsOf('deadkey', { kind: 'dead_key', diacritic: '´', shifted: '¨' });
    expect(acute.set.accent('¨')).toEqual({ kind: 'dead_key', diacritic: '¨' });
    expect(acute.set.accent('`')).toEqual({ kind: 'dead_key', diacritic: '`', shifted: '¨' });
    expect(acute.set.shifted('')).toEqual({ kind: 'dead_key', diacritic: '´' });
  });

  it('runs another of the layout behaviours, and shows what an import kept', () => {
    const named = fieldsOf('behaviour', { kind: 'adaptive', ref: 'adaptiveHV' });
    expect(named.view.runs).toBe('adaptiveHV');
    expect(named.set.runs('altRepeat')).toEqual({ kind: 'ref', ref: 'altRepeat' });
    const kept = fieldsOf('imported', { kind: 'raw', label: 'BT1', source: '&bt BT_SEL 1' });
    expect(kept.view).toEqual({ label: 'BT1', source: '&bt BT_SEL 1' });
  });
});

/** Every key a layout binds, once for each distinct binding. */
function keysOf(layout: Layout): { layer: string; key: string; binding: Binding }[] {
  const seen = new Set<string>();
  const out: { layer: string; key: string; binding: Binding }[] = [];
  for (const layer of layout.layers) {
    for (const [key, binding] of Object.entries(layer.bindings)) {
      const written = stableStringify(bindingToJson(binding));
      if (key === '*' || seen.has(written)) continue;
      seen.add(written);
      out.push({ layer: layer.id, key, binding });
    }
  }
  return out;
}
