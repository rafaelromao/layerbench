import { describe, expect, it } from 'vitest';
import { bindingModule, featureModule, moduleUrl, ZMK_MODULES } from './firmware.js';
import type { BindingKind } from './types.js';

/** The kinds stock ZMK has a behaviour for. */
const STOCK: BindingKind[] = [
  'kp',
  'trans',
  'none',
  'mo',
  'lt',
  'sl',
  'tog',
  'to',
  'sk',
  'mod',
  'caps_word',
  'key_repeat',
  'mod_morph',
  'tap_dance',
  'macro',
  'hold_tap',
  'dead_key',
];

describe('the ZMK module a binding needs', () => {
  it('is none for a kind stock ZMK has', () => {
    for (const kind of STOCK) expect(bindingModule(kind), kind).toBeNull();
  });

  it('names the module for an adaptive key, an auto layer, a layer morph and a Unicode key', () => {
    expect(bindingModule('adaptive')).toBe('adaptiveKey');
    expect(bindingModule('auto_layer')).toBe('autoLayer');
    expect(bindingModule('layer_morph')).toBe('layerMorph');
    expect(bindingModule('unicode')).toBe('unicode');
  });

  it("names zmk-sentence-case for a sentence space and a sentence morph, the module's own", () => {
    expect(bindingModule('sentence_space')).toBe('sentenceCase');
    expect(bindingModule('sentence_morph')).toBe('sentenceCase');
  });
});

describe('the ZMK module a feature needs', () => {
  it('is zmk-sentence-case for sentence case, and none for caps word', () => {
    expect(featureModule('sentenceCase')).toBe('sentenceCase');
    expect(featureModule('capsWord')).toBeNull();
  });
});

describe('the ZMK modules', () => {
  it('link each to its repository on GitHub', () => {
    expect(moduleUrl('sentenceCase')).toBe('https://github.com/rafaelromao/zmk-sentence-case');
  });

  it('are the five the kinds of key and the features need', () => {
    expect(Object.values(ZMK_MODULES)).toEqual([
      'urob/zmk-adaptive-key',
      'urob/zmk-auto-layer',
      'rafaelromao/zmk-layer-morph',
      'rafaelromao/zmk-sentence-case',
      'urob/zmk-unicode',
    ]);
  });
});
