import { describe, expect, it } from 'vitest';
import { compileLayout } from '../layout/compile.js';
import type { Binding, Layout, Mod } from '../layout/types.js';
import { bundledLayout, documentedLayouts } from '../layouts/index.js';
import {
  bindingReaches,
  blockedThumbs,
  describeReach,
  discoverActivators,
  type ReachKey,
  reachKeys,
  standInPeers,
} from './activators.js';
import { explain } from './resolver.js';

const magicRomak = bundledLayout('magic-romak')!;

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
    format: 'layerbench/layout@1',
    name: 'Board',
    hostLocale: 'symbols',
    geometry: { preset: '3x5+2' },
    keys: { space: 'L0' },
    layers,
    ...extra,
  };
}

describe('the keys that reach a layer', () => {
  it('takes a declared way in from the one route that fits its modifiers, taps and all', () => {
    const sl: Binding = { kind: 'sl', layer: 'up' };
    const c = compileLayout(
      board([
        {
          id: 'base',
          bindings: {
            // Shift and one tap reach up; two taps do too, with no modifier.
            LHP: {
              kind: 'tap_dance',
              bindings: [
                { kind: 'mod_morph', mods: ['LSHIFT'], default: kp('!'), morphed: sl },
                sl,
              ],
            },
          },
        },
        { id: 'up', bindings: { '*': { kind: 'trans' } } },
      ]),
    );
    const declared = (requires?: { mods: Mod[] }) =>
      (
        discoverActivators(c, {
          up: [{ via: 'key:base/LHP', ...(requires ? { requires } : {}) }],
        }).get(layerOf(c, 'up')) ?? []
      ).find((a) => a.user);
    const shifted = declared({ mods: ['LSHIFT'] });
    expect(shifted?.requiredMods).toEqual([['LSHIFT']]);
    expect(shifted?.taps).toBeUndefined();
    expect(declared()?.taps).toBe(2);
    // The board marks that same route as the declared one, not the key's other way in.
    const marked = compileLayout({
      ...board([...c.layout.layers]),
      activators: { up: [{ via: 'key:base/LHP', requires: { mods: ['LSHIFT'] } }] },
    });
    const [key] = reachKeys(marked, layerOf(marked, 'up'));
    expect(key.routes.find((r) => r.declared)).toMatchObject({ mods: [['LSHIFT']] });
    expect(key.routes.find((r) => r.declared)?.taps).toBeUndefined();
  });

  it('reads a tap dance inside a branch by the same taps, as the machine does, and a held one once', () => {
    const sl = (layer: string): Binding => ({ kind: 'sl', layer });
    const td = (...bindings: Binding[]): Binding => ({ kind: 'tap_dance', bindings });
    const c = compileLayout(
      board([
        {
          id: 'base',
          bindings: {
            // Two taps type @: the inner dance's second branch is never reached.
            LHP: td(td(kp('!'), sl('up')), kp('@')),
            // Two taps run the inner dance's second branch, to other.
            LHR: td(kp('!'), td(sl('up'), sl('other'))),
            // Held, a tap dance is its first branch: a layer held.
            LHM: td({ kind: 'mo', layer: 'up' }, sl('other')),
            // Three taps stay on the second branch, where the dance in it takes its third.
            LBP: td(kp('!'), td(kp('?'), kp('@'), sl('other'))),
            // In a tap-hold's hold too: its second branch is never run.
            LHI: { kind: 'hold_tap', tap: kp('i'), hold: td(kp('x'), sl('other')) },
          },
        },
        { id: 'up', bindings: { '*': { kind: 'trans' } } },
        { id: 'other', bindings: { '*': { kind: 'trans' } } },
      ]),
    );
    const says = (layer: string) =>
      reachKeys(c, layerOf(c, layer)).map(
        (k) => `${keyId(c, k.pos)}: ${describeReach(c, layerOf(c, layer), k)}`,
      );
    expect(says('up')).toEqual(['LHM: held from base to reach up']);
    expect(says('other').sort()).toEqual([
      'LBP: tapped three times from base to reach other',
      'LHM: tapped twice from base to reach other',
      'LHR: tapped twice from base to reach other',
    ]);
  });

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
    // After a sentence's end, its macro arms Shift with Alpha 2, as the keymap's sentence-morph.
    expect(say('alpha2', 'R0')).toBe(
      'tapped from Alpha 1, or from Alpha 1 after a sentence ends, by its macro, to reach Alpha 2',
    );
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
          const b = c.layers[a.viaLayer].bindings[a.pos];
          if (a.user && !bindingReaches(c, b, target, a.viaLayer)) continue;
          // A combo is marked on each of its keys.
          for (const pos of a.combo === undefined ? [a.pos] : c.combos[a.combo].keys) {
            const at = marked.find((k) => k.pos === pos);
            expect(
              at?.routes.some((r) => r.via === a.viaLayer && r.mode === a.mode),
              `${layout.id}: ${keyId(c, pos)} on ${c.layers[a.viaLayer].id} → ${c.layers[target].id}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('marks both keys of a combo that brings a layer on, each naming the other', () => {
    const c = compileLayout(
      board(
        [
          { id: 'base', bindings: { LHM: kp('s'), LHR: kp('r') } },
          { id: 'up', bindings: { '*': { kind: 'trans' }, RHI: kp('§') } },
        ],
        {
          combos: [
            {
              id: 'to-up',
              keys: ['LHR', 'LHM'],
              binding: { kind: 'sl', layer: 'up' },
              layers: ['base'],
              role: 'typing',
            },
          ],
        },
      ),
    );
    const up = layerOf(c, 'up');
    const [candidate] = discoverActivators(c, {}).get(up) ?? [];
    expect(candidate).toMatchObject({ combo: 0, viaLayer: 0, mode: 'tap' });
    // A combo is not a key another key could stand in for.
    expect(standInPeers(discoverActivators(c, {})).has(candidate)).toBe(false);
    expect(marks(c, 'up').sort()).toEqual(['LHM tapped', 'LHR tapped']);
    const lhr = reachKeys(c, up).find((k) => keyId(c, k.pos) === 'LHR') as ReachKey;
    expect(describeReach(c, up, lhr)).toBe('tapped from base together with LHM to reach up');
  });

  it('marks nothing for a command combo, which the analysis never presses', () => {
    const c = compileLayout(
      board(
        [
          { id: 'base', bindings: {} },
          { id: 'up', bindings: { '*': { kind: 'trans' } } },
        ],
        {
          combos: [{ id: 'to-up', keys: ['LHR', 'LHM'], binding: { kind: 'sl', layer: 'up' } }],
        },
      ),
    );
    expect(discoverActivators(c, {}).get(layerOf(c, 'up'))).toBeUndefined();
    expect(marks(c, 'up')).toEqual([]);
  });

  it('drops a declared key once it is rebound to do something else', () => {
    const layout = (l1: Binding) =>
      board(
        [
          {
            id: 'base',
            bindings: { L0: { kind: 'sl', layer: 'up' }, L1: { kind: 'sl', layer: 'mid' } },
          },
          { id: 'mid', bindings: { '*': { kind: 'trans' }, L1: l1 } },
          { id: 'up', bindings: { '*': { kind: 'trans' } } },
          { id: 'other', bindings: { '*': { kind: 'trans' } } },
        ],
        { activators: { up: [{ from: 'mid', via: 'key:mid/L1' }] } },
      );
    const say = (l1: Binding) => {
      const c = compileLayout(layout(l1));
      return reachKeys(c, 2).map((k) => `${keyId(c, k.pos)}: ${describeReach(c, 2, k)}`);
    };
    expect(say({ kind: 'sl', layer: 'up' })).toEqual([
      'L1: tapped from mid to reach up',
      'L0: tapped from base to reach up',
    ]);
    expect(say({ kind: 'sl', layer: 'other' })).toEqual(['L0: tapped from base to reach up']);
    expect(say(kp('a'))).toEqual(['L0: tapped from base to reach up']);
  });

  it('marks the accent macros that arm an alt-repeat layer, and not the alt-repeat key', () => {
    // As a keymap that arms a one-shot layer after every accent, for the repeat key to offer what
    // follows it.
    const accent = (symbol: string): Binding => ({
      kind: 'macro',
      symbols: symbol,
      then: [{ kind: 'sl', layer: 'altrep' }],
    });
    const c = compileLayout(
      board([
        {
          id: 'base',
          bindings: {
            L0: kp(' '),
            R0: { kind: 'sl', layer: 'alpha2' },
            L1: { kind: 'key_repeat' },
          },
        },
        {
          id: 'alpha2',
          bindings: {
            '*': { kind: 'trans' },
            ...Object.fromEntries(
              ['RTI', 'RHI', 'RBI', 'RTM', 'RHM', 'RBM'].map((id, i) => [id, accent('áãâéêó'[i])]),
            ),
          },
        },
        {
          id: 'altrep',
          bindings: {
            '*': { kind: 'trans' },
            L1: { kind: 'adaptive', default: { kind: 'key_repeat' }, triggers: [] },
          },
        },
      ]),
    );
    const marked = reachKeys(c, layerOf(c, 'altrep'));
    expect(marked.every((k) => k.how === 'tapped')).toBe(true);
    expect(marked.every((k) => k.routes.every((r) => r.origin === 'macro'))).toBe(true);
    expect(marked.map((k) => keyId(c, k.pos))).not.toContain('L1');
    expect(marked.length).toBeGreaterThan(5);
  });

  it('marks a key on a layer that types and then turns that layer on again, as a ç macro can', () => {
    const c = compileLayout(
      board([
        { id: 'base', bindings: { R0: { kind: 'sl', layer: 'alpha2' } } },
        {
          id: 'alpha2',
          name: 'Alpha 2',
          bindings: {
            '*': { kind: 'trans' },
            LHP: { kind: 'macro', symbols: 'ç', then: [{ kind: 'sl', layer: 'alpha2' }] },
            // Staying on, or leaving, is not a way back in.
            LHR: { kind: 'sl', layer: 'alpha2' },
            LHM: { kind: 'tap_dance', bindings: [kp('a'), { kind: 'sl', layer: 'alpha2' }] },
          },
        },
      ]),
    );
    const marked = reachKeys(c, 1);
    expect(marked.map((k) => `${keyId(c, k.pos)} ${k.how}`)).toEqual(['LHP tapped', 'R0 tapped']);
    expect(describeReach(c, 1, marked[0])).toBe(
      'tapped on Alpha 2 by the ç macro to reach Alpha 2 again',
    );
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

  it("marks an auto layer, a macro step, a morph's changed part and a second tap, but not a way out", () => {
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

  it('names the modifiers a morph needs: a family as one, a choice with or, morphs inside morphs with and', () => {
    const morph = (mods: Mod[], morphed: Binding): Binding => ({
      kind: 'mod_morph',
      mods,
      default: kp('a'),
      morphed,
    });
    const c = compileLayout(
      board([
        {
          id: 'base',
          bindings: {
            LHR: morph(['RSHIFT', 'LSHIFT'], { kind: 'sl', layer: 'up' }),
            LHM: morph(['LSHIFT', 'LALT'], { kind: 'sl', layer: 'up' }),
            LHI: morph(
              ['LSHIFT', 'RSHIFT'],
              morph(['LCTRL', 'RCTRL'], { kind: 'sl', layer: 'up' }),
            ),
          },
        },
        { id: 'up', bindings: { '*': { kind: 'trans' } } },
      ]),
    );
    const says = Object.fromEntries(
      reachKeys(c, 1).map((k) => [keyId(c, k.pos), describeReach(c, 1, k)]),
    );
    expect(says.LHR).toBe('tapped from base with Shift to reach up');
    expect(says.LHM).toBe('tapped from base with left Shift or left Alt to reach up');
    expect(says.LHI).toBe('tapped from base with Shift and Control to reach up');
  });
});

describe('the thumb keys a held thumb blocks', () => {
  const blocked = (c: typeof magic, layer: string) =>
    blockedThumbs(c, layerOf(c, layer)).map((p) => keyId(c, p));

  it("are the holding hand's on a layer one thumb holds, and every thumb on one both hold", () => {
    expect(blocked(magic, 'alpha1')).toEqual([]);
    expect(blocked(magic, 'num').sort()).toEqual(['L0', 'L1']);
    expect(blocked(magic, 'sym').sort()).toEqual(['R0', 'R1']);
    // Magic Romak has no Extras; Bird holds its Numbers and Symbols, so Extras, by a thumb of each
    // hand.
    const bird = compileLayout(documentedLayouts().find((l) => l.id === 'bird')!);
    expect(blocked(bird, 'extras').sort()).toEqual(['L0', 'L1', 'R0', 'R1']);
  });

  it('are none on a layer a thumb taps, or one a finger holds', () => {
    expect(blocked(magic, 'alpha2')).toEqual([]);
    // Romak taps its right outer thumb for Accents.
    const romak = compileLayout(documentedLayouts().find((l) => l.id === 'romak')!);
    expect(blocked(romak, 'accents')).toEqual([]);
    const c = compileLayout(
      board([
        { id: 'base', bindings: { LHM: { kind: 'mo', layer: 'nav' } } },
        { id: 'nav', bindings: { '*': { kind: 'trans' }, L1: kp('x') } },
      ]),
    );
    expect(blocked(c, 'nav')).toEqual([]);
  });

  it('are none where another way onto the layer leaves the thumb free', () => {
    const c = compileLayout(
      board([
        {
          id: 'base',
          bindings: { L0: { kind: 'mo', layer: 'nav' }, LHM: { kind: 'sl', layer: 'nav' } },
        },
        { id: 'nav', bindings: { '*': { kind: 'trans' } } },
      ]),
    );
    expect(blocked(c, 'nav')).toEqual([]);
  });

  it('are none on a layer a thumb arms, toggles or switches to on its hold, and then lets go', () => {
    for (const hold of [
      { kind: 'sl', layer: 'nav' },
      { kind: 'tog', layer: 'nav' },
      { kind: 'to', layer: 'nav' },
    ] as const) {
      const c = compileLayout(
        board([
          { id: 'base', bindings: { L0: { kind: 'hold_tap', tap: kp(' '), hold } } },
          { id: 'nav', bindings: { '*': { kind: 'trans' }, L1: kp('x') } },
        ]),
      );
      expect([hold.kind, blocked(c, 'nav')]).toEqual([hold.kind, []]);
      const r = explain(c, 'x', { caseMode: 'fold', crossWord: 'reset' });
      expect([hold.kind, r.coverage.unproducible.size]).toEqual([hold.kind, 0]);
    }
  });

  it('are the hand of a thumb that holds a layer-tap down, as of one that holds `mo`', () => {
    const c = compileLayout(
      board([
        { id: 'base', bindings: { L0: { kind: 'lt', layer: 'nav', tap: kp(' ') } } },
        { id: 'nav', bindings: { '*': { kind: 'trans' }, L1: kp('x') } },
      ]),
    );
    expect(blocked(c, 'nav').sort()).toEqual(['L0', 'L1']);
  });

  it('are none on a layer an auto layer, a macro or a morph that toggles on one part reaches', () => {
    const holds: Binding[] = [
      { kind: 'auto_layer', layer: 'nav' },
      { kind: 'macro', steps: [{ kind: 'sl', layer: 'nav' }] },
      {
        kind: 'mod_morph',
        mods: ['LSHIFT'],
        default: { kind: 'mo', layer: 'nav' },
        morphed: { kind: 'tog', layer: 'nav' },
      },
    ];
    for (const hold of holds) {
      const c = compileLayout(
        board([
          { id: 'base', bindings: { L0: { kind: 'hold_tap', tap: kp(' '), hold } } },
          { id: 'nav', bindings: { '*': { kind: 'trans' }, L1: kp('x') } },
        ]),
      );
      expect([hold.kind, blocked(c, 'nav')]).toEqual([hold.kind, []]);
    }
  });

  it('are only the hands every set of layers that brings a layer on holds', () => {
    const c = compileLayout(
      board(
        [
          {
            id: 'base',
            bindings: {
              L0: { kind: 'mo', layer: 'num' },
              R0: { kind: 'mo', layer: 'sym' },
              LHP: { kind: 'mo', layer: 'fn' },
            },
          },
          { id: 'num', bindings: { '*': { kind: 'trans' } } },
          { id: 'sym', bindings: { '*': { kind: 'trans' } } },
          { id: 'fn', bindings: { '*': { kind: 'trans' } } },
          { id: 'ex', bindings: { '*': { kind: 'trans' }, R1: kp('x') } },
        ],
        {
          conditionalLayers: [
            { if: ['num', 'sym'], then: 'ex' },
            { if: ['num', 'fn'], then: 'ex' },
          ],
        },
      ),
    );
    // Numbers and the finger holding Fn leave the right thumb free.
    expect(blocked(c, 'ex').sort()).toEqual(['L0', 'L1']);
  });

  it('type nothing in the analysis: what only they carry is unproducible', () => {
    const c = compileLayout(
      board([
        { id: 'base', bindings: { L0: { kind: 'mo', layer: 'nav' }, R0: kp(' ') } },
        { id: 'nav', bindings: { '*': { kind: 'trans' }, L1: kp('x'), R1: kp('y') } },
      ]),
    );
    const r = explain(c, 'x y', { caseMode: 'fold', crossWord: 'reset' });
    expect([...r.coverage.unproducible.keys()]).toEqual(['x']);
  });
});

describe('the keys that could each make the same layer tap', () => {
  const sl = (layer: string): Binding => ({ kind: 'sl', layer });
  const layout = board(
    [
      {
        id: 'base',
        bindings: {
          L0: kp(' '),
          RBI: sl('two'),
          RBM: sl('two'),
          RBR: sl('two'),
          LBI: { kind: 'mo', layer: 'two' },
          LBM: { kind: 'mod_morph', mods: ['LSHIFT'], default: kp('m'), morphed: sl('two') },
        },
      },
      { id: 'two', bindings: { '*': { kind: 'trans' }, LTM: kp('q') } },
    ],
    { activators: { two: [{ from: 'base', via: 'key:base/RBR' }] } },
  );
  const c = compileLayout(layout);
  const peers = standInPeers(discoverActivators(c, layout.activators ?? {}));
  const named = new Map(
    [...peers].map(([cand, list]) => [
      `${cand.user ? 'declared ' : ''}${keyId(c, cand.pos)}`,
      list.map((p) => keyId(c, p.pos)),
    ]),
  );

  it('lists, for each tap, the other keys tapped for the same layer after it', () => {
    // The declared way in comes first; as found on the board, RBR still follows RBI and RBM, for
    // when the declared one does not apply.
    expect(named.get('declared RBR')).toEqual(['RBI', 'RBM']);
    expect(named.get('RBI')).toEqual(['RBM', 'RBR']);
    expect(named.get('RBM')).toEqual(['RBR']);
    expect(named.has('RBR')).toBe(false);
  });

  it('leaves out a held key and a tap that needs a modifier', () => {
    const all = [...peers.values()].flat().map((p) => keyId(c, p.pos));
    expect(all).not.toContain('LBI');
    expect(all).not.toContain('LBM');
  });
});

describe("a layer reached from a tap-hold's hold", () => {
  it('marks the key held for a one-shot on its hold, and a plain one-shot tapped only', () => {
    const c = compileLayout(
      board([
        {
          id: 'base',
          bindings: {
            L0: kp(' '),
            LHM: { kind: 'hold_tap', tap: kp('a'), hold: { kind: 'sl', layer: 'up' } },
            RHM: { kind: 'sl', layer: 'up' },
          },
        },
        { id: 'up', bindings: { '*': { kind: 'trans' }, RHI: kp('x') } },
      ]),
    );
    expect(marks(c, 'up')).toEqual(['LHM held', 'RHM tapped']);
  });
});

describe('the macro a reach key is known by', () => {
  it('is read off its Plain part, past a layer morph too', () => {
    const macro: Binding = { kind: 'macro', steps: [kp('x'), { kind: 'sl', layer: 'up' }] };
    const c = compileLayout(
      board([
        {
          id: 'base',
          bindings: {
            LHR: { kind: 'layer_morph', layers: ['up'], inactive: macro, active: kp('y') },
          },
        },
        { id: 'up', bindings: { '*': { kind: 'trans' } } },
      ]),
    );
    const [key] = reachKeys(c, 1);
    expect(describeReach(c, 1, key)).toBe('tapped from base by the x macro to reach up');
  });
});
