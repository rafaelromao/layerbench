import { describe, expect, it } from 'vitest';
import { fitLabel, graphemes, legendNumber, textWidth } from './fit-label.js';

const SIZES = [22, 19, 16, 14, 12, 10] as const;
// A 1U key: 58 units wide, less padding on either side.
const WIDTH = 48;
const HEIGHT = 40;

describe('fitLabel', () => {
  it('keeps a short legend at full size', () => {
    expect(fitLabel('a', WIDTH, HEIGHT, SIZES)).toEqual({
      size: 22,
      lines: ['a'],
      overflow: false,
    });
    expect(fitLabel('ão', WIDTH, HEIGHT, SIZES).size).toBe(22);
  });

  it('steps the size down until the legend fits', () => {
    const fit = fitLabel('Numb', WIDTH, HEIGHT, SIZES);
    expect(fit.overflow).toBe(false);
    expect(fit.size).toBeLessThan(22);
    expect(textWidth('Numb', fit.size)).toBeLessThanOrEqual(WIDTH);
  });

  it('breaks at a space onto two lines before giving up', () => {
    const fit = fitLabel('caps word', WIDTH, HEIGHT, SIZES);
    expect(fit.lines).toEqual(['caps', 'word']);
    expect(fit.overflow).toBe(false);
  });

  it('cuts what cannot fit, and says so, so a legend can carry the rest', () => {
    const fit = fitLabel('antidisestablishment', WIDTH, HEIGHT, SIZES);
    expect(fit.overflow).toBe(true);
    expect(fit.lines).toHaveLength(1);
    expect(fit.lines[0].endsWith('…')).toBe(true);
    expect(textWidth(fit.lines[0], fit.size)).toBeLessThanOrEqual(WIDTH);
  });

  it('costs symbols outside ASCII more than letters', () => {
    expect(textWidth('⇧', 10)).toBeGreaterThan(textWidth('a', 10));
  });

  it('counts a letter and its combining accent as one character', () => {
    expect(graphemes('◌́')).toHaveLength(1);
    expect(graphemes('ão')).toHaveLength(2);
  });

  it('numbers legends in circled digits, then plainly', () => {
    expect(legendNumber(1)).toBe('①');
    expect(legendNumber(20)).toBe('⑳');
    expect(legendNumber(21)).toBe('21');
  });
});
