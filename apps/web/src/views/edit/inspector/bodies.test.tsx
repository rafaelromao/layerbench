import { type Binding, compileLayout, type Layout } from '@layerbench/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BindingEditor, type EditorScope } from './bodies.js';

const layout: Layout = {
  format: 'layerbench/layout@1',
  name: 'T',
  geometry: { preset: '3x5+2' },
  keys: { space: 'R0' },
  layers: [
    { id: 'base', name: 'Base', bindings: {} },
    { id: 'num', name: 'Num', bindings: {} },
  ],
};
const compiled = compileLayout(layout);
const scope: EditorScope = {
  compiled,
  text: { layers: compiled.layers.map((l) => ({ id: l.id, name: l.name })), hostLocale: 'symbols' },
};

const kp = (symbol: string): Binding => ({ kind: 'kp', symbol });

/** The links the editor shows for a key. */
function links(value: Binding): (string | null)[] {
  render(<BindingEditor scope={scope} value={value} onChange={vi.fn()} />);
  return screen.queryAllByRole('link').map((a) => a.getAttribute('href'));
}

describe('a key ZMK needs a module for', () => {
  it.each<[string, Binding, string]>([
    ['an adaptive key', { kind: 'adaptive', default: kp('h') }, 'urob/zmk-adaptive-key'],
    [
      'an alt repeat',
      { kind: 'adaptive', default: { kind: 'key_repeat' } },
      'urob/zmk-adaptive-key',
    ],
    ['an auto layer', { kind: 'auto_layer', layer: 'num' }, 'urob/zmk-auto-layer'],
    [
      'a morph on a layer',
      { kind: 'layer_morph', layers: ['num'], active: kp('b'), inactive: kp('a') },
      'rafaelromao/zmk-layer-morph',
    ],
    ['a Unicode key', { kind: 'unicode', symbol: '→' }, 'urob/zmk-unicode'],
    [
      'a tap-hold whose tap is an adaptive key',
      {
        kind: 'hold_tap',
        tap: { kind: 'adaptive', default: kp('h') },
        hold: { kind: 'mo', layer: 'num' },
      },
      'urob/zmk-adaptive-key',
    ],
  ])('links the module of %s', (_, value, repo) => {
    expect(links(value)).toEqual([`https://github.com/${repo}`]);
    expect(screen.getByRole('link', { name: repo })).toHaveAttribute('target', '_blank');
  });
});

describe('a key stock ZMK has', () => {
  it.each<[string, Binding]>([
    ['a symbol', kp('a')],
    ['a momentary layer', { kind: 'mo', layer: 'num' }],
    ['a one-shot layer', { kind: 'sl', layer: 'num' }],
    ['a toggle', { kind: 'tog', layer: 'num' }],
    ['a one-shot modifier', { kind: 'sk', mod: 'LSHIFT' }],
    ['a tap-hold', { kind: 'hold_tap', tap: kp('a'), hold: { kind: 'mod', mod: 'LCTRL' } }],
    ['a repeat', { kind: 'key_repeat' }],
    ['a macro', { kind: 'macro', symbols: 'qu' }],
    ['a tap dance', { kind: 'tap_dance', bindings: [kp('a'), kp('b')] }],
    [
      'a morph with a modifier',
      { kind: 'mod_morph', mods: ['LSHIFT', 'RSHIFT'], default: kp(','), morphed: kp(';') },
    ],
    ['caps word', { kind: 'caps_word' }],
    ['a dead key', { kind: 'dead_key', diacritic: '´' }],
  ])('names no module for %s', (_, value) => {
    expect(links(value)).toEqual([]);
  });
});

describe('a morph on a layer', () => {
  it('says it changes while any of its layers is on, as zmk-layer-morph does', () => {
    const morph: Binding = {
      kind: 'layer_morph',
      layers: ['num'],
      active: kp('b'),
      inactive: kp('a'),
    };
    render(<BindingEditor scope={scope} value={morph} onChange={vi.fn()} />);
    expect(screen.getByText('Changes while any of these is on.')).toBeInTheDocument();
  });
});
