import { describe, expect, it } from 'vitest';
import { compileLayout } from '../layout/compile.js';
import type { Binding, Layout } from '../layout/types.js';
import { documentedLayouts } from '../layouts/index.js';
import { magicRomak, romak24 } from '../layouts/romak.js';
import { describeReach, discoverActivators, type ReachKey, reachKeys } from './activators.js';

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });

const magic = compileLayout(magicRomak);
const layerOf = (c: typeof magic, id: string) => c.layerIndex.get(id) as number;
const keyId = (c: typeof magic, pos: number) => c.keys[pos].id;

/** What the board marks on a layer: each key, and how it is pressed to get there. */
function marks(c: typeof magic, layer: string): string[] {
  return reachKeys(c, layerOf(c, layer)).map((k) => `${keyId(c, k.pos)} ${k.how}`);
}

/** A small board with the layers a test needs. */
function board(layers: Layout['layers'], extra: Partial<Layout> = {}): Layout {
  return {
    format: 'layoutmaster/layout@1',
    name: 'Board',
    hostLocale: 'symbols',
    geometry: { preset: '3x5+2' },
    keys: { space: 'L0' },
    layers,
    ...extra,
  };
}

describe('the keys that reach a layer', () => {
  it('marks nothing on the base layer, which is always on', () => {
    expect(reachKeys(magic, 0)).toEqual([]);
  });

  it("marks Magic Romak's thumbs, the ç macro and the alt repeat where each leads", () => {
    expect(marks(magic, 'alpha2')).toEqual(['L1 tapped', 'R0 tapped']);
    expect(marks(magic, 'ccedil')).toEqual(['LBM tapped']);
    expect(marks(magic, 'num')).toEqual(['L0 held']);
    expect(marks(magic, 'sym')).toEqual(['R0 held']);
  });

  it('says how each one gets there', () => {
    const say = (layer: string, key: string) => {
      const k = reachKeys(magic, layerOf(magic, layer)).find(
        (x) => keyId(magic, x.pos) === key,
      ) as ReachKey;
      return describeReach(magic, layerOf(magic, layer), k);
    };
    expect(say('sym', 'R0')).toBe('held from Alpha 1 or Numbers to reach Symbols');
    expect(say('num', 'L0')).toBe('held from Alpha 1 to reach Numbers');
    expect(say('alpha2', 'R0')).toBe('tapped from Alpha 1 to reach Alpha 2');
    expect(say('alpha2', 'L1')).toBe(
      'tapped from Ç extension, or from Alpha 1 after v, x or j, to reach Alpha 2',
    );
    expect(say('ccedil', 'LBM')).toBe('tapped from Alpha 2 by the ç macro to reach Ç extension');
  });

  it('marks every key the simulator presses to reach a layer, from another layer', () => {
    for (const layout of documentedLayouts()) {
      const c = compileLayout(layout);
      for (const [target, list] of discoverActivators(c, c.layout.activators ?? {})) {
        if (c.conditionalLayers.some((x) => x.then === target)) continue;
        const marked = reachKeys(c, target);
        for (const a of list) {
          if (a.viaLayer === target) continue;
          const kind = c.layers[a.viaLayer].bindings[a.pos].kind;
          if (a.user && (kind === 'trans' || kind === 'none')) continue;
          const at = marked.find((k) => k.pos === a.pos);
          expect(
            at?.routes.some((r) => r.via === a.viaLayer && r.mode === a.mode),
            `${layout.id}: ${keyId(c, a.pos)} on ${c.layers[a.viaLayer].id} → ${c.layers[target].id}`,
          ).toBe(true);
        }
      }
    }
  });

  it("marks Romak 24's accent macros for its alt-repeat layer, and not its alt-repeat key", () => {
    const c = compileLayout(romak24);
    const marked = reachKeys(c, layerOf(c, 'altrep2'));
    expect(marked.every((k) => k.how === 'tapped')).toBe(true);
    expect(marked.every((k) => k.routes.every((r) => r.origin === 'macro'))).toBe(true);
    expect(marked.map((k) => keyId(c, k.pos))).not.toContain('L1');
    expect(marked.length).toBeGreaterThan(5);
  });

  it('reaches a layer that two others turn on through both thumbs, and not directly', () => {
    const c = compileLayout(
      board(
        [
          {
            id: 'base',
            bindings: {
              L0: { kind: 'mo', layer: 'nav' },
              R0: { kind: 'mo', layer: 'sym' },
              LHM: { kind: 'mo', layer: 'adj' },
            },
          },
          { id: 'nav', bindings: { '*': { kind: 'trans' } } },
          { id: 'sym', bindings: { '*': { kind: 'trans' } } },
          { id: 'adj', bindings: { '*': { kind: 'trans' } } },
        ],
        { conditionalLayers: [{ if: ['nav', 'sym'], then: 'adj' }] },
      ),
    );
    const adj = reachKeys(c, 3);
    expect(adj.map((k) => `${keyId(c, k.pos)} ${k.how}`)).toEqual(['L0 held', 'R0 held']);
    expect(describeReach(c, 3, adj[0])).toBe(
      'held from base to reach nav, which turns adj on together with sym',
    );
  });

  it('marks an auto layer, a macro step, a morphed arm and a second tap, but not a way out', () => {
    const c = compileLayout(
      board([
        {
          id: 'base',
          bindings: {
            LHM: { kind: 'auto_layer', layer: 'up' },
            LHI: { kind: 'macro', steps: [kp('x'), { kind: 'tog', layer: 'up' }] },
            LHR: {
              kind: 'mod_morph',
              mods: ['LSHIFT'],
              default: kp('a'),
              morphed: { kind: 'sl', layer: 'up' },
            },
            LHP: { kind: 'tap_dance', bindings: [kp('b'), { kind: 'to', layer: 'up' }] },
          },
        },
        { id: 'up', bindings: { '*': { kind: 'trans' }, RHI: { kind: 'tog', layer: 'up' } } },
      ]),
    );
    const up = reachKeys(c, 1);
    expect(up.map((k) => keyId(c, k.pos)).sort()).toEqual(['LHI', 'LHM', 'LHP', 'LHR']);
    const says = Object.fromEntries(up.map((k) => [keyId(c, k.pos), describeReach(c, 1, k)]));
    expect(says.LHR).toBe('tapped from base with left Shift to reach up');
    expect(says.LHP).toBe('tapped twice from base to reach up');
    expect(says.LHI).toBe('tapped from base by the x macro to reach up');
  });
});
