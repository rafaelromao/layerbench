import { bundledLayout, compileLayout, explain, type Layout, magicRomak } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { typingCombos } from '../../components/Keyboard.js';
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
      '◌̈',
      '◌́',
      '◌̀',
      '◌̂',
      '◌̃',
      '? / ¿',
      '! / ¡',
      ':',
      'à',
    ]);
    // Alpha 1's letter combos are marked as shortcuts, which the analysis never uses: only `;` types.
    expect(typingCombos(compiled, layer('alpha1')).map((c) => c.label)).toEqual([';']);
  });

  it('shows the combo every layout with the default layers presses for Dead keys', () => {
    const qwerty = compileLayout(bundledLayout('qwerty') as Layout);
    expect(typingCombos(qwerty, 0)).toEqual([
      {
        id: 'dead-keys',
        keys: ['LHR', 'LHM'].map((id) => qwerty.keyIndex.get(id)),
        label: 'DK',
        active: false,
      },
    ]);
  });

  it('marks the combo being played', () => {
    const combos = typingCombos(compiled, layer('alpha2'), 'agrave');
    expect(combos.filter((c) => c.active).map((c) => c.label)).toEqual(['à']);
  });
});
