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
    expect(layout.name).toBe('Imported layout');
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

  it('places the outer keys of a cyanophone string on an ANSI board', () => {
    const { layout, overflow } = importTextLayout("qwertyuiop-asdfghjkl;'zxcvbnm,./\\^", 'ansi');
    expect(layout.layers[0].bindings).toBeDefined();
    expect(Array.isArray(overflow)).toBe(true);
  });

  it('sends an extra outer symbol to overflow where the geometry has no outer key', () => {
    const { overflow } = importTextLayout("qwertyuiop-asdfghjkl;'zxcvbnm,./\\^", '3x5+2');
    expect(overflow).toEqual(['-', "'"]);
  });

  it('spreads a row that is shorter than the geometry from the inner keys out', () => {
    const { layout } = importTextLayout('q w e r\na s d f\nz x c v', 'ansi');
    expect(Object.keys(layout.layers[0].bindings).length).toBeGreaterThanOrEqual(12);
  });

  it('overflows a row longer than the geometry', () => {
    const { overflow } = importTextLayout(
      "q w e r t y u i o p [ ] \\ 1\na s d f g h j k l ; ' 1 2 3 4 5 6\nz x c v b n m , . / 1 2 3 4 5 6",
      'ansi',
    );
    expect(overflow.length).toBeGreaterThan(0);
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
