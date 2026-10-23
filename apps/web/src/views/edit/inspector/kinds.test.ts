import { bindingModule } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { ALL_KINDS, kindInfo, kindOf, PART_KINDS, TAP_KINDS, tileHint } from './kinds.js';

describe('the kinds of key a part can be', () => {
  it('offers an adaptive key and an alt repeat for the tap of a tap-hold, and not for any part', () => {
    expect(TAP_KINDS).toEqual([...PART_KINDS, 'adaptive', 'altrepeat']);
    expect(PART_KINDS).not.toContain('adaptive');
  });
});

describe('the ZMK module a kind needs', () => {
  it('is the module of the bindings the kind stands for', () => {
    expect(kindInfo(kindOf({ kind: 'adaptive' })).module).toBe(bindingModule('adaptive'));
    expect(kindInfo(kindOf({ kind: 'adaptive', default: { kind: 'key_repeat' } })).module).toBe(
      bindingModule('adaptive'),
    );
    expect(kindInfo(kindOf({ kind: 'unicode', symbol: '→' })).module).toBe(
      bindingModule('unicode'),
    );
    expect(kindInfo(kindOf({ kind: 'sentence_space' })).module).toBe(
      bindingModule('sentence_space'),
    );
  });

  it('is on no other tile: a layer key or a morph needs one only as some of its kinds', () => {
    expect(ALL_KINDS.filter((k) => k.module).map((k) => k.kind)).toEqual([
      'adaptive',
      'altrepeat',
      'sentencespace',
      'unicode',
    ]);
  });

  it('is said when a tile is pointed at', () => {
    expect(tileHint(kindInfo('adaptive'))).toBe(
      'adapts to the key before it, with the ZMK module urob/zmk-adaptive-key',
    );
    expect(tileHint(kindInfo('macro'))).toBe('types several things in one press');
  });
});
