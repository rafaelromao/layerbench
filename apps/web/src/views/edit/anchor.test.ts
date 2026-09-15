import { describe, expect, it } from 'vitest';
import { anchorKey } from './anchor.js';

type Rect = { left: number; top: number; width: number; height: number };

function el(rect: Rect, client?: { width: number; height: number }): HTMLElement {
  return {
    getBoundingClientRect: () => ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
    }),
    clientWidth: client?.width ?? 0,
    clientHeight: client?.height ?? 0,
  } as unknown as HTMLElement;
}

const popover = (width: number, height: number) =>
  ({ offsetWidth: width, offsetHeight: height }) as unknown as HTMLElement;

describe('anchorKey', () => {
  const wrapper = el({ left: 100, top: 50, width: 700, height: 300 }, { width: 700, height: 300 });

  it('centres on the key and sits just below it', () => {
    const key = el({ left: 300, top: 100, width: 50, height: 50 });
    expect(anchorKey(wrapper, key, popover(200, 90))).toMatchObject({
      left: 225,
      top: 106,
      above: false,
    });
  });

  it('keeps the editor inside the wrapper at either edge', () => {
    const atLeft = el({ left: 100, top: 100, width: 50, height: 50 });
    expect(anchorKey(wrapper, atLeft, popover(200, 90)).left).toBe(108);
    const atRight = el({ left: 760, top: 100, width: 50, height: 50 });
    expect(anchorKey(wrapper, atRight, popover(200, 90)).left).toBe(592);
  });

  it('opens upwards for a key with no room below it in the window', () => {
    const thumb = el({ left: 300, top: 300, width: 50, height: 50 });
    const a = anchorKey(wrapper, thumb, popover(200, 90), 400);
    expect(a.above).toBe(true);
    expect(a.top).toBe(154);
  });

  it('stays below when there is no room above either, rather than opening off the top', () => {
    // A phone: the board is short and near the top of a screen the editor does not fit under.
    const high = el({ left: 300, top: 60, width: 50, height: 50 });
    const a = anchorKey(wrapper, high, popover(200, 90), 130);
    expect(a.above).toBe(false);
    expect(a.top).toBeGreaterThan(0);
  });

  it('hangs below the board rather than flipping because the board is short', () => {
    const shortBoard = el(
      { left: 100, top: 50, width: 700, height: 80 },
      { width: 700, height: 80 },
    );
    const k = el({ left: 300, top: 70, width: 50, height: 50 });
    expect(anchorKey(shortBoard, k, popover(200, 90), 900).above).toBe(false);
  });

  it('survives a layout engine that measures nothing', () => {
    // jsdom reports zeroes for every box; the editor must still open, just unpositioned.
    const none = el({ left: 0, top: 0, width: 0, height: 0 });
    expect(anchorKey(none, none, null)).toEqual({ left: 0, top: 6, above: false });
  });
});
