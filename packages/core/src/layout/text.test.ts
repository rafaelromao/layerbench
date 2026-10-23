import { describe, expect, it } from 'vitest';
import { getGeometryPreset } from '../geometry/presets.js';
import { exportLayerText, importTextLayout, parseTextLayout } from './text.js';
import type { Binding } from './types.js';

const THIRTY = 'qwertyuiopasdfghjkl;zxcvbnm,./';

describe('parsing a text layout', () => {
  it('reads rows on lines, tokens split by spaces, and a fourth line of thumbs', () => {
    const parsed = parseTextLayout('q w e\na s d\nz x c\nspace');
    expect(parsed.rows).toEqual([
      ['q', 'w', 'e'],
      ['a', 's', 'd'],
      ['z', 'x', 'c'],
    ]);
    expect(parsed.thumbs).toEqual(['space']);
  });

  it('reads three rows without thumbs', () => {
    expect(parseTextLayout('q w\na s\nz x').thumbs).toEqual([]);
  });

  it('splits a long one-line layout on slashes', () => {
    const line = `${'q w e r t y u i o p'}/${'a s d f g h j k l ;'}/${'z x c v b n m , . ?'}`;
    expect(parseTextLayout(line).rows.map((r) => r.length)).toEqual([10, 10, 10]);
  });

  it('cuts a 30 character string into three rows of ten', () => {
    const parsed = parseTextLayout(THIRTY);
    expect(parsed.rows.map((r) => r.join(''))).toEqual(['qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./']);
    expect(parsed.extras).toEqual([]);
  });

  it('reads a cyanophage string with its outer keys and thumb', () => {
    const parsed = parseTextLayout("qwertyuiop-asdfghjkl;'zxcvbnm,./\\^");
    expect(parsed.rows.map((r) => r.length)).toEqual([10, 10, 10]);
    expect(parsed.extras).toEqual(['-', "'"]);
    expect(parsed.thumbs).toEqual([]);
    expect(parseTextLayout("qwertyuiop-asdfghjkl;'zxcvbnm,./\\_").thumbs).toEqual(['_']);
  });

  it('falls back to three even rows of whatever tokens it is given', () => {
    const parsed = parseTextLayout('a b c d e f g');
    expect(parsed.rows).toEqual([['a', 'b', 'c'], ['d', 'e', 'f'], ['g']]);
  });
});

describe('importing a text layout onto a geometry', () => {
  it('places 30 symbols on the 3x5+2 base layer and gives space a thumb key', () => {
    const { layout, overflow, warnings } = importTextLayout(THIRTY);
    expect(overflow).toEqual([]);
    expect(warnings).toEqual([]);
    const base = layout.layers[0].bindings;
    expect(Object.values(base).filter((b) => b.kind === 'kp' && b.symbol === 'q')).toHaveLength(1);
    expect(base[layout.keys?.space as string]).toEqual({ kind: 'kp', symbol: ' ' });
    expect(layout.name).toBe('My layout');
  });

  it('names the layout and lets a thumb token pick the space key', () => {
    const { layout } = importTextLayout(
      `${THIRTY.replace(/(.{10})/g, '$1\n')}x space`,
      '3x5+2',
      'Mine',
    );
    expect(layout.name).toBe('Mine');
    const ids = getGeometryPreset('3x5+2').textThumbs;
    expect(layout.keys?.space).toBe(ids[1]);
    expect(layout.layers[0].bindings[ids[0]]).toEqual({ kind: 'kp', symbol: 'x' });
  });

  it('moves space to a free thumb when the chosen one carries a letter', () => {
    const ids = getGeometryPreset('3x5+2').textThumbs;
    const { layout, warnings } = importTextLayout(`${THIRTY.replace(/(.{10})/g, '$1\n')}x y z`);
    // The middle thumb is the default space key, and `z` landed on it, so space goes to the free one.
    expect(layout.layers[0].bindings[ids[2]]).toEqual({ kind: 'kp', symbol: 'z' });
    expect(layout.keys?.space).toBe(ids[3]);
    expect(layout.layers[0].bindings[ids[3]]).toEqual({ kind: 'kp', symbol: ' ' });
    expect(warnings).toEqual([]);
  });

  it('warns when no thumb key is free for space', () => {
    const { warnings } = importTextLayout(`${THIRTY.replace(/(.{10})/g, '$1\n')}w x y z`);
    expect(warnings).toEqual(['No free thumb key for space; space shares a key']);
  });

  it('keeps tokens that do not fit as overflow', () => {
    const { overflow } = importTextLayout(`${THIRTY.replace(/(.{10})/g, '$1\n')}a b c d e f`);
    expect(overflow).toEqual(['e', 'f']);
  });

  it('places the outer keys of a cyanophage string on an ANSI board', () => {
    const { layout, overflow } = importTextLayout("qwertyuiop-asdfghjkl;'zxcvbnm,./\\^", 'ansi');
    const base = layout.layers[0].bindings;
    expect(overflow).toEqual([]);
    expect(base.RTO).toEqual({ kind: 'kp', symbol: '-' });
    expect(base.RHO).toEqual({ kind: 'kp', symbol: "'" });
    expect(base.LTP).toEqual({ kind: 'kp', symbol: 'q' });
    expect(base.RBP).toEqual({ kind: 'kp', symbol: '/' });
  });

  it('sends an extra outer symbol to overflow where the geometry has no outer key', () => {
    const { overflow } = importTextLayout("qwertyuiop-asdfghjkl;'zxcvbnm,./\\^", '3x5+2');
    expect(overflow).toEqual(['-', "'"]);
  });

  it('spreads a row that is shorter than the geometry from the inner keys out', () => {
    const { layout } = importTextLayout('q w e r\na s d f\nz x c v', 'ansi');
    const base = layout.layers[0].bindings;
    // Two tokens a hand, aligned to the innermost columns; the outer keys stay empty.
    expect(base.LTI).toEqual({ kind: 'kp', symbol: 'q' });
    expect(base.LTC).toEqual({ kind: 'kp', symbol: 'w' });
    expect(base.RTC).toEqual({ kind: 'kp', symbol: 'e' });
    expect(base.RTI).toEqual({ kind: 'kp', symbol: 'r' });
    expect(base.LTP).toBeUndefined();
    expect(base.RTP).toBeUndefined();
  });

  it('overflows a row longer than the geometry', () => {
    const { overflow } = importTextLayout(
      "q w e r t y u i o p [ ] \\ 1\na s d f g h j k l ; ' 1 2 3 4 5 6\nz x c v b n m , . / 1 2 3 4 5 6",
      'ansi',
    );
    // Each row's tokens are halved between the hands, and what a hand has no key for is left over.
    expect(overflow).toEqual([
      'y',
      'u',
      '1',
      'h',
      'j',
      'k',
      'l',
      '5',
      '6',
      'n',
      'm',
      ',',
      '4',
      '5',
      '6',
    ]);
  });
});

describe('exporting a layer as text', () => {
  const geometry = getGeometryPreset('3x5+2');

  it('labels each kind of binding', () => {
    const b: Record<string, Binding> = {
      [geometry.textRows[0][0]]: { kind: 'kp', symbol: 'a' },
      [geometry.textRows[0][1]]: { kind: 'kp', symbol: ' ' },
      [geometry.textRows[0][2]]: { kind: 'kp', keycode: 'B' },
      [geometry.textRows[0][3]]: { kind: 'kp' } as Binding,
      [geometry.textRows[0][4]]: { kind: 'macro', symbols: 'ing' } as Binding,
      [geometry.textRows[1][0]]: { kind: 'macro' } as Binding,
      [geometry.textRows[1][1]]: { kind: 'trans' },
      [geometry.textRows[1][2]]: { kind: 'none' },
      [geometry.textRows[1][3]]: { kind: 'sl', layer: 'nav' } as Binding,
      [geometry.textRows[1][4]]: { kind: 'sk' } as Binding,
      [geometry.textRows[2][0]]: { kind: 'mo', layer: 'nav' } as Binding,
    };
    const lines = exportLayerText(geometry, b).split('\n');
    expect(lines[0].split(' ').slice(0, 5)).toEqual(['a', '␣', 'B', '·', 'ing']);
    expect(lines[1].split(' ').slice(0, 5)).toEqual(['⋯', '_', '·', '→nav', '⇧']);
    expect(lines[2].split(' ')[0]).toBe('mo');
    expect(lines).toHaveLength(4);
  });
});
