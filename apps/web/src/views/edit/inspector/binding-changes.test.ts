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
import { keyFields } from './binding-changes.js';
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
