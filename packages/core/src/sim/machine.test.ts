import { describe, expect, it } from 'vitest';
import { compileLayout } from '../layout/compile.js';
import type { Layout } from '../layout/types.js';
import { magicRomak, romak24 } from '../layouts/romak.js';
import { Machine } from './machine.js';

function mini(layers: Layout['layers'], extra: Partial<Layout> = {}): Layout {
  return {
    format: 'layerbench/layout@1',
    name: 'mini',
    geometry: { preset: '3x5+2' },
    keys: { space: 'L0' },
    layers,
    ...extra,
  };
}

function machineFor(layout: Layout) {
  const compiled = compileLayout(layout);
  const m = new Machine(compiled);
  const pos = (id: string) => compiled.keyIndex.get(id)!;
  const tap = (id: string) => m.perform({ type: 'tap', pos: pos(id) })[0];
  const hold = (id: string) => m.perform({ type: 'hold_press', pos: pos(id) })[0];
  const release = (id: string) => m.perform({ type: 'hold_release', pos: pos(id) })[0];
  return { compiled, m, pos, tap, hold, release };
}

describe('Machine — one-shot layers', () => {
  it('sticky layer is consumed by exactly one press', () => {
    const { m, tap, compiled } = machineFor(romak24);
    expect(tap('R0').leafKind).toBe('sl');
    expect(m.isLayerActive(compiled.layerIndex.get('alpha2')!)).toBe(true);
    const q = tap('LTR');
    expect(q.symbols).toBe('q');
    expect(q.layer).toBe(compiled.layerIndex.get('alpha2'));
    expect(m.isLayerActive(compiled.layerIndex.get('alpha2')!)).toBe(false);
    expect(tap('LHM').symbols).toBe('s');
  });

  it('sticky layer + modifier press consumes the one-shot without output (wasted)', () => {
    const layout = mini([
      {
        id: 'base',
        bindings: {
          LHP: { kind: 'kp', symbol: 'a' },
          LHR: { kind: 'sl', layer: 'one' },
          LHM: { kind: 'sk', mod: 'LSHIFT' },
          L0: { kind: 'kp', symbol: ' ' },
        },
      },
      { id: 'one', bindings: { LHP: { kind: 'kp', symbol: 'b' } } },
    ]);
    const { m, tap, compiled } = machineFor(layout);
    tap('LHR');
    const ev = tap('LHM'); // sticky shift: transparent on layer one → resolves on base as a modifier press
    expect(ev.symbols).toBe('');
    expect(ev.wastedOneShot).toBe(true);
    expect(m.isLayerActive(compiled.layerIndex.get('one')!)).toBe(false);
    // the sticky shift itself stays armed
    expect(tap('LHP').symbols).toBe('A');
  });

  it('a one-shot consumed by a transparent key falling to base is wasted', () => {
    const { tap } = machineFor(romak24);
    tap('R0');
    const ev = tap('L0'); // space: transparent on alpha2 → base
    expect(ev.symbols).toBe(' ');
    expect(ev.wastedOneShot).toBe(true);
  });

  it('macro arms a one-shot layer (ç → Ç extension) and the next press resolves there', () => {
    const { tap, compiled } = machineFor(romak24);
    tap('R0');
    const c = tap('LBM');
    expect(c.symbols).toBe('ç');
    const a = tap('RHI');
    expect(a.symbols).toBe('ã');
    expect(a.layer).toBe(compiled.layerIndex.get('ccedil'));
    expect(tap('RTM').symbols).toBe('o');
  });

  it('lastSymbol is not changed by layer taps and repeat re-sends it', () => {
    const { tap, m } = machineFor(romak24);
    tap('RHM'); // a
    expect(m.state.lastSymbol).toBe('a');
    tap('R0');
    expect(m.state.lastSymbol).toBe('a');
    tap('R0'); // consumes + re-arms
    tap('L0'); // space consumes one-shot (wasted); lastSymbol now ' '
    expect(m.state.lastSymbol).toBe(' ');
  });
});

describe('Machine — adaptive keys', () => {
  it('magic key outputs h by default and v after vowels', () => {
    const { tap } = machineFor(magicRomak);
    tap('LBM'); // c
    expect(tap('RBI').symbols).toBe('h');
    tap('RHM'); // a
    expect(tap('RBI').symbols).toBe('v');
  });

  it('alt repeat: a branch for a tagged accent first, the plain ones after it', () => {
    const { tap } = machineFor(magicRomak);
    tap('RHM'); // a
    tap('R0');
    expect(tap('RHR').symbols).toBe('é'); // an accent, tagged alpha2
    // after the tagged é, the tagged branch → x
    expect(tap('L1').symbols).toBe('x');
    // x carries no tag; the plain branch after x → arms alpha2
    const ev = tap('L1');
    expect(ev.symbols).toBe('');
    expect(ev.leafKind).toBe('sl');
  });

  it('macro sets lastSymbol to its last emitted grapheme (qu → u → ê)', () => {
    const { tap } = machineFor(magicRomak);
    tap('R0');
    expect(tap('LTM').symbols).toBe('qu');
    expect(tap('L1').symbols).toBe('ê');
  });
});

describe('Machine — toggles, to-layer, locking, conditional layers', () => {
  const layout = mini(
    [
      {
        id: 'base',
        bindings: {
          LHP: { kind: 'kp', symbol: 'a' },
          LHR: { kind: 'tog', layer: 'one' },
          LHM: { kind: 'to', layer: 'two' },
          LHI: { kind: 'mo', layer: 'one' },
          LHC: { kind: 'mo', layer: 'two' },
          L0: { kind: 'kp', symbol: ' ' },
        },
      },
      { id: 'one', bindings: { LHP: { kind: 'kp', symbol: 'b' } } },
      { id: 'two', bindings: { LHP: { kind: 'kp', symbol: 'c' } } },
      { id: 'three', bindings: { LHP: { kind: 'kp', symbol: 'd' } } },
    ],
    { conditionalLayers: [{ if: ['one', 'two'], then: 'three' }] },
  );

  it('tog flips and locks; a mo release cannot deactivate a locked layer', () => {
    const { tap, hold, release, m, compiled } = machineFor(layout);
    hold('LHI'); // mo one
    tap('LHR'); // tog one → locked
    release('LHI');
    expect(m.isLayerActive(compiled.layerIndex.get('one')!)).toBe(true);
    expect(tap('LHP').symbols).toBe('b');
    tap('LHR'); // tog off
    expect(tap('LHP').symbols).toBe('a');
  });

  it('to-layer deactivates every other layer except base', () => {
    const { tap, m, compiled } = machineFor(layout);
    tap('LHR'); // one on
    tap('LHM'); // to two
    expect(m.isLayerActive(compiled.layerIndex.get('one')!)).toBe(false);
    expect(m.isLayerActive(compiled.layerIndex.get('two')!)).toBe(true);
    expect(tap('LHP').symbols).toBe('c');
  });

  it('conditional layer is forced on when both if-layers are active and off otherwise', () => {
    const { hold, release, tap, m, compiled } = machineFor(layout);
    hold('LHI');
    expect(m.isLayerActive(compiled.layerIndex.get('three')!)).toBe(false);
    hold('LHC');
    expect(m.isLayerActive(compiled.layerIndex.get('three')!)).toBe(true);
    expect(tap('LHP').symbols).toBe('d');
    release('LHC');
    expect(m.isLayerActive(compiled.layerIndex.get('three')!)).toBe(false);
  });
});

describe('Machine — combos, caps word, holds', () => {
  it('combo fires only when the highest active layer is in its layer list', () => {
    const { m, tap, compiled } = machineFor(romak24);
    const q = compiled.combos.findIndex((c) => c.id === 'ns');
    expect(m.perform({ type: 'chord', combo: q })[0].symbols).toBe('q');
    tap('R0'); // alpha2 armed → highest layer is alpha2
    expect(m.comboAvailable(q)).toBe(false);
    expect(m.perform({ type: 'chord', combo: q })[0].symbols).toBe('');
  });

  it('caps word ends on a non-continue key', () => {
    const layout = mini([
      {
        id: 'base',
        bindings: {
          LHP: { kind: 'kp', symbol: 'a' },
          LHR: { kind: 'kp', symbol: ',' },
          LHM: { kind: 'caps_word' },
          L0: { kind: 'kp', symbol: ' ' },
        },
      },
    ]);
    const { tap } = machineFor(layout);
    tap('LHM');
    expect(tap('LHP').symbols).toBe('A');
    expect(tap('LHP').symbols).toBe('A');
    expect(tap('LHR').symbols).toBe(',');
    expect(tap('LHP').symbols).toBe('a');
  });

  it('hold press activates the layer until release', () => {
    const layout = mini([
      {
        id: 'base',
        bindings: {
          LHP: { kind: 'kp', symbol: 'a' },
          LHI: { kind: 'lt', layer: 'one', tap: { kind: 'kp', symbol: 't' } },
          L0: { kind: 'kp', symbol: ' ' },
        },
      },
      { id: 'one', bindings: { LHP: { kind: 'kp', symbol: 'b' } } },
    ]);
    const { tap, hold, release } = machineFor(layout);
    expect(tap('LHI').symbols).toBe('t');
    const h = hold('LHI');
    expect(h.kind).toBe('hold_press');
    expect(h.symbols).toBe('');
    expect(tap('LHP').symbols).toBe('b');
    const r = release('LHI');
    expect(r.kind).toBe('hold_release');
    expect(tap('LHP').symbols).toBe('a');
  });

  it('sticky shift capitalizes exactly one key', () => {
    const { tap } = machineFor(romak24);
    tap('R1');
    expect(tap('RHM').symbols).toBe('A');
    expect(tap('RHM').symbols).toBe('a');
  });
});

describe('Machine — what kind of key a press is', () => {
  const magic = {
    kind: 'adaptive' as const,
    default: { kind: 'kp' as const, symbol: 'h' },
    triggers: [{ afterAny: ['a'], binding: { kind: 'kp' as const, symbol: 'v' } }],
  };
  const board = () =>
    machineFor(
      mini([
        {
          id: 'base',
          bindings: {
            LHP: { kind: 'kp', symbol: 'a' },
            // A magic key on the tap of a tap-hold, of a layer-tap, and of a morph's plain arm.
            LHR: { kind: 'hold_tap', tap: magic, hold: { kind: 'mod', mod: 'LGUI' } },
            LHM: { kind: 'lt', layer: 'num', tap: magic },
            LHI: {
              kind: 'mod_morph',
              mods: ['LSHIFT', 'RSHIFT'],
              default: magic,
              morphed: { kind: 'kp', symbol: 'x' },
            },
            LTI: {
              kind: 'hold_tap',
              tap: { kind: 'key_repeat' },
              hold: { kind: 'mo', layer: 'num' },
            },
            LTM: { kind: 'tap_dance', bindings: [{ kind: 'kp', symbol: 'b' }, magic] },
            RHI: { kind: 'adaptive', default: { kind: 'key_repeat' }, triggers: magic.triggers },
            R1: { kind: 'mod', mod: 'LSHIFT' },
            L0: {
              kind: 'hold_tap',
              tap: {
                kind: 'adaptive',
                default: { kind: 'kp', symbol: ' ' },
                triggers: [
                  {
                    afterAny: ['.'],
                    binding: {
                      kind: 'macro',
                      steps: [
                        { kind: 'kp', symbol: ' ' },
                        { kind: 'sk', mod: 'LSHIFT' },
                      ],
                    },
                  },
                ],
              },
              hold: { kind: 'mo', layer: 'num' },
            },
          },
        },
        { id: 'num', bindings: { '*': { kind: 'trans' } } },
      ]),
    );

  it('is a magic key when the magic key is the tap of a tap-hold or a layer-tap, as its legend says', () => {
    const { tap, hold } = board();
    for (const key of ['LHR', 'LHM']) {
      const t = tap(key);
      expect(t.symbols, key).toBe('h');
      expect(t.keyKind, key).toBe('magic');
    }
    tap('LHP'); // a
    expect(tap('LHR')).toMatchObject({ symbols: 'v', keyKind: 'magic' });
    // Held, it is the hold, whatever the tap is.
    expect(hold('LHR').keyKind).toBe('hold');
    expect(hold('LHM').keyKind).toBe('hold');
  });

  it('is what the arm a morph or a tap dance runs is', () => {
    const { tap, hold, m, pos } = board();
    expect(tap('LHI').keyKind).toBe('magic');
    hold('R1');
    // The shift that chose the arm is not applied to it, as in ZMK's mod-morph.
    expect(tap('LHI')).toMatchObject({ symbols: 'x', keyKind: 'alpha' });
    const twice = m.perform({ type: 'tap', pos: pos('LTM'), taps: 2 });
    expect(twice.at(-1)?.keyKind).toBe('magic');
  });

  it('is a repeat key when a tap-hold taps the repeat key', () => {
    const { tap } = board();
    tap('LHP');
    expect(tap('LTI')).toMatchObject({ symbols: 'a', keyKind: 'repeat' });
  });

  it('is a magic key when it is an alt repeat, repeating or not, as its legend says', () => {
    const { tap } = board();
    tap('LHP'); // a: the branch types v
    expect(tap('RHI')).toMatchObject({ symbols: 'v', keyKind: 'magic' });
    // after v nothing matches, so it repeats
    expect(tap('RHI')).toMatchObject({ symbols: 'v', keyKind: 'magic' });
  });

  it('stays a space key when sentence case wraps the space on a tap-hold', () => {
    const { tap } = board();
    expect(tap('L0').keyKind).toBe('space');
  });
});

describe('MachineState.matches — two presses that leave the board alike', () => {
  const layout = mini([
    {
      id: 'base',
      bindings: {
        L0: { kind: 'kp', symbol: ' ' },
        LHP: { kind: 'kp', symbol: 'a' },
        LHR: { kind: 'sl', layer: 'one' },
        LHM: { kind: 'sl', layer: 'one' },
        LHI: { kind: 'sl', layer: 'one', quickRelease: false },
        LBI: { kind: 'mo', layer: 'one' },
      },
    },
    { id: 'one', bindings: { '*': { kind: 'trans' }, LHP: { kind: 'kp', symbol: 'b' } } },
  ]);

  /** The state after a press from a fresh board, as a snapshot. */
  function after(press: (t: ReturnType<typeof machineFor>) => void) {
    const t = machineFor(layout);
    press(t);
    return t.m.state.snapshot();
  }

  it('holds for one-shots of the same layer tapped on different keys', () => {
    const t = machineFor(layout);
    t.tap('LHM');
    expect(t.m.state.matches(after((u) => u.tap('LHR')))).toBe(true);
  });

  it('fails when the one-shot ends differently, a letter was typed, or a key is held', () => {
    const t = machineFor(layout);
    t.tap('LHI');
    expect(t.m.state.matches(after((u) => u.tap('LHR')))).toBe(false);
    const typed = machineFor(layout);
    typed.tap('LHP');
    expect(typed.m.state.matches(after(() => {}))).toBe(false);
    const held = machineFor(layout);
    held.hold('LBI');
    expect(held.m.state.matches(after(() => {}))).toBe(false);
    expect(held.m.state.matches(after((u) => u.hold('LBI')))).toBe(true);
  });
});
