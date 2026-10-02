import { describe, expect, it } from 'vitest';
import { compileLayout } from '../layout/compile.js';
import type { Layout } from '../layout/types.js';
import { magicRomak, romak24 } from '../layouts/romak.js';
import { Machine } from './machine.js';

function mini(layers: Layout['layers'], extra: Partial<Layout> = {}): Layout {
  return {
    format: 'layoutmaster/layout@1',
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
