import {
  bundledLayout,
  compileLayout,
  explain,
  type Layout,
  magicRomak,
  withoutFeatures,
} from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { comboPlace, typingCombos } from '../../components/Keyboard.js';
import { playFrames } from './playback.js';

const compiled = compileLayout(magicRomak);
const OPTS = { caseMode: 'fold', crossWord: 'reset' } as const;
const at = (id: string) => compiled.keyIndex.get(id) as number;
const layer = (id: string) => compiled.layerIndex.get(id) as number;

describe('playing a word on the board', () => {
  it('shows each press on the layer it lands on, one after another', () => {
    const frames = playFrames(explain(compiled, 'ação', OPTS).steps, compiled);
    expect(
      frames.map((f) => [compiled.layers[f.layer].id, f.keys.map((k) => compiled.keys[k].id)]),
    ).toEqual([
      ['alpha1', ['RHM']],
      ['alpha1', ['R0']],
      ['alpha2', ['LBM']],
      ['ccedil', ['LHI']],
    ]);
  });

  it('keeps a held key shown as held while the keys it reaches are pressed', () => {
    const frames = playFrames(explain(compiled, '7', OPTS).steps, compiled);
    // Hold the space thumb, tap 7 on Numbers; the release ends the hold and is not a frame.
    expect(frames).toEqual([
      { step: 0, layer: layer('alpha1'), keys: [at('L0')], held: [], combo: null },
      { step: 1, layer: layer('num'), keys: [at('RTI')], held: [at('L0')], combo: null },
    ]);
  });

  it('presses every key of a combo at once, and names the combo', () => {
    const frames = playFrames(explain(compiled, 'à', OPTS).steps, compiled);
    const last = frames[frames.length - 1];
    expect(last.combo).toBe('agrave');
    expect(last.keys.map((k) => compiled.keys[k].id).sort()).toEqual(['RHM', 'RHR']);
    expect(last.layer).toBe(layer('alpha2'));
  });
});

describe('the combos a board shows', () => {
  it('shows the combos that type on the layer drawn, and not the shortcuts', () => {
    // The keymap's: the accents as dead keys, and what `?` and `!` type when held.
    expect(typingCombos(compiled, layer('alpha2')).map((c) => c.label)).toEqual([
      '-',
      '¨',
      '´',
      '`',
      '^',
      '~',
      '? / ¿',
      '! / ¡',
      ':',
      'à',
    ]);
    // The accents are drawn as dead keys, not as the letters a combo types.
    expect(
      typingCombos(compiled, layer('alpha2'))
        .filter((c) => c.dead)
        .map((c) => c.label),
    ).toEqual(['¨', '´', '`', '^', '~']);
    // Alpha 1's letter combos are marked as shortcuts, which the analysis never uses: only `;` types.
    expect(typingCombos(compiled, layer('alpha1')).map((c) => c.label)).toEqual([';']);
  });

  it('shows the combo a Special layout with the default layers presses for Accents', () => {
    const sturdy = compileLayout(bundledLayout('magic-sturdy') as Layout);
    expect(typingCombos(sturdy, 0)).toEqual([
      {
        id: 'accents',
        index: 0,
        // The outer thumbs pressed together.
        keys: ['L1', 'R1'].map((id) => sturdy.keyIndex.get(id)),
        label: 'Acce',
        active: false,
      },
    ]);
  });

  it('marks the combo being played', () => {
    const combos = typingCombos(compiled, layer('alpha2'), 'agrave');
    expect(combos.filter((c) => c.active).map((c) => c.label)).toEqual(['à']);
  });
});

describe("a pill's combo in the layout", () => {
  it('is found by its id and keys when typing combos are left out of the analysis', () => {
    // A combo that types before Magic Sturdy's Accents combo, which only reaches a layer and stays.
    const sturdy = bundledLayout('magic-sturdy') as Layout;
    const layout: Layout = {
      ...sturdy,
      combos: [
        {
          id: 'q',
          keys: ['LHI', 'LHP'],
          binding: { kind: 'kp', symbol: 'q' },
          layers: ['base'],
          role: 'typing',
        },
        ...(sturdy.combos ?? []),
      ],
    };
    const full = compileLayout(layout);
    const typed = compileLayout(withoutFeatures(layout, ['combos']));
    expect(typed.combos.map((c) => c.id)).toEqual(['accents']);
    expect(comboPlace(full, typed, 0)).toBe(1);
    expect(comboPlace(full, full, 0)).toBe(0);
    expect(comboPlace(full, typed, 5)).toBeNull();
  });

  it('tells twins apart by their layers, then by their order', () => {
    const qwerty = bundledLayout('qwerty') as Layout;
    const twin = (layer: string, symbol: string) => ({
      id: 'twin',
      keys: ['LHI', 'LHP'],
      binding: { kind: 'kp' as const, symbol },
      layers: [layer],
      role: 'command' as const,
    });
    const typing = { ...twin('base', 'q'), id: 'q', keys: ['RHI', 'RHM'], role: 'typing' as const };
    const second = qwerty.layers[1].id;
    const layout: Layout = {
      ...qwerty,
      combos: [typing, twin(second, 'b'), twin('base', 'a'), ...(qwerty.combos ?? [])],
    };
    const full = compileLayout(layout);
    const typed = compileLayout(withoutFeatures(layout, ['combos']));
    const at = (id: string, layer: string) =>
      typed.combos.findIndex(
        (c) => c.id === id && c.layerMask === 1 << (typed.layerIndex.get(layer) as number),
      );
    expect(comboPlace(full, typed, at('twin', 'base'))).toBe(2);
    expect(comboPlace(full, typed, at('twin', second))).toBe(1);
  });

  it('skips a twin the analysis left out for the one it kept', () => {
    const qwerty = bundledLayout('qwerty') as Layout;
    const twin = (binding: Layout['layers'][number]['bindings'][string]) => ({
      id: 'twin',
      keys: ['LHI', 'LHP'],
      binding,
      layers: ['base'],
      role: 'typing' as const,
    });
    const layout: Layout = {
      ...qwerty,
      combos: [
        twin({ kind: 'kp', symbol: 'q' }),
        twin({ kind: 'sl', layer: qwerty.layers[1].id }),
        ...(qwerty.combos ?? []),
      ],
    };
    const full = compileLayout(layout);
    const typed = compileLayout(withoutFeatures(layout, ['combos']));
    expect(typed.combos[0].binding.kind).toBe('sl');
    expect(comboPlace(full, typed, 0)).toBe(1);
  });
});
