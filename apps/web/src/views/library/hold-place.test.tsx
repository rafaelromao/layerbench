import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHoldPlace } from './hold-place.js';

/**
 * A page that scrolls: `scrollY` is where the window is, and a card at `at` in the page is on the
 * screen at `at - scrollY`. `scrollTo` moves the window the way a browser does, never above the top.
 */
function page() {
  const state = { scrollY: 0 };
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => state.scrollY });
  Object.defineProperty(window, 'scrollX', { configurable: true, get: () => 0 });
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(((options: ScrollToOptions) => {
    state.scrollY = Math.max(0, options.top ?? 0);
  }) as typeof window.scrollTo);
  /** A card in the document, `at` far down the page. */
  function card(at: number) {
    const el = document.createElement('article');
    const place = { at };
    el.getBoundingClientRect = () => ({ top: place.at - state.scrollY }) as DOMRect;
    document.body.append(el);
    return Object.assign(el, { place });
  }
  return { state, scrollTo, card };
}

let world: ReturnType<typeof page>;
const own = {
  scrollY: Object.getOwnPropertyDescriptor(window, 'scrollY'),
  scrollX: Object.getOwnPropertyDescriptor(window, 'scrollX'),
};

beforeEach(() => {
  world = page();
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  document.documentElement.style.removeProperty('overflow-anchor');
  vi.restoreAllMocks();
  // Back to jsdom's own: the properties above were defined on the window itself.
  for (const name of ['scrollY', 'scrollX'] as const) {
    const was = own[name];
    if (was) Object.defineProperty(window, name, was);
    else Reflect.deleteProperty(window, name);
  }
});

describe('a card held in place while the list is sorted again', () => {
  it('does nothing with no card held', () => {
    const { rerender } = renderHook(() => useHoldPlace());
    rerender();
    expect(world.scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls the window by the distance the card moved, at once', () => {
    const card = world.card(200);
    const { result, rerender } = renderHook(() => useHoldPlace());
    result.current(card);
    expect(world.scrollTo).not.toHaveBeenCalled();

    card.place.at = 520;
    rerender();
    expect(world.scrollTo).toHaveBeenCalledTimes(1);
    expect(world.scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 320, behavior: 'instant' });
    // On the screen where it was: 520 - 320.
    expect(card.getBoundingClientRect().top).toBe(200);

    // Nothing moved since: nothing to do.
    rerender();
    expect(world.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('follows the card through every re-sort, as scores land', () => {
    const card = world.card(300);
    const { result, rerender } = renderHook(() => useHoldPlace());
    result.current(card);
    for (const at of [900, 120, 640, 300]) {
      card.place.at = at;
      rerender();
      expect(card.getBoundingClientRect().top).toBe(at === 120 ? 120 : 300);
    }
  });

  it('keeps the place it was first seen in, so a page too short to scroll catches up later', () => {
    const card = world.card(200);
    const { result, rerender } = renderHook(() => useHoldPlace());
    result.current(card);

    // Ranked above where the page can scroll to: the window stops at the top.
    card.place.at = 100;
    rerender();
    expect(world.state.scrollY).toBe(0);
    expect(card.getBoundingClientRect().top).toBe(100);

    // Ranked lower again: it is brought back to where it was, not to where it had got to.
    card.place.at = 400;
    rerender();
    expect(world.state.scrollY).toBe(200);
    expect(card.getBoundingClientRect().top).toBe(200);
  });

  it('leaves a card that moved less than a pixel', () => {
    const card = world.card(200);
    const { result, rerender } = renderHook(() => useHoldPlace());
    result.current(card);
    card.place.at = 200.4;
    rerender();
    expect(world.scrollTo).not.toHaveBeenCalled();
  });

  it('measures from where the window is, not from the top of the page', () => {
    world.state.scrollY = 1000;
    const card = world.card(1200);
    const { result, rerender } = renderHook(() => useHoldPlace());
    result.current(card);
    card.place.at = 1500;
    rerender();
    expect(world.scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 1300, behavior: 'instant' });
  });

  it.each(['wheel', 'touchstart', 'pointerdown', 'keydown', 'resize'])(
    'lets go when the reader takes the page back: %s',
    (type) => {
      const card = world.card(200);
      const { result, rerender } = renderHook(() => useHoldPlace());
      result.current(card);
      window.dispatchEvent(new Event(type));

      card.place.at = 520;
      rerender();
      expect(world.scrollTo).not.toHaveBeenCalled();
    },
  );

  it('lets go when the window is scrolled to anywhere but where the hold left it', () => {
    const card = world.card(200);
    const { result, rerender } = renderHook(() => useHoldPlace());
    result.current(card);

    // A dragged scrollbar, Find in page, a link to an anchor: no wheel, tap or key.
    world.state.scrollY = 500;
    window.dispatchEvent(new Event('scroll'));

    card.place.at = 900;
    rerender();
    expect(world.scrollTo).not.toHaveBeenCalled();
  });

  it('keeps holding through the scroll it made itself', () => {
    const card = world.card(200);
    const { result, rerender } = renderHook(() => useHoldPlace());
    result.current(card);

    card.place.at = 520;
    rerender();
    // The browser reports the scroll the hold made, a frame later.
    window.dispatchEvent(new Event('scroll'));

    card.place.at = 700;
    rerender();
    expect(world.scrollTo).toHaveBeenCalledTimes(2);
    expect(world.scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 500, behavior: 'instant' });
  });

  it('keeps holding when the window stopped short of where it was sent', () => {
    const card = world.card(200);
    const { result, rerender } = renderHook(() => useHoldPlace());
    result.current(card);

    // Ranked above the top of the page: the window is sent to -100 and stops at 0.
    card.place.at = 100;
    rerender();
    window.dispatchEvent(new Event('scroll'));

    card.place.at = 400;
    rerender();
    expect(world.state.scrollY).toBe(200);
    expect(card.getBoundingClientRect().top).toBe(200);
  });

  it("turns the browser's scroll anchoring off while a card is held, and back on after", () => {
    const root = document.documentElement.style;
    const card = world.card(200);
    const { result } = renderHook(() => useHoldPlace());
    expect(root.getPropertyValue('overflow-anchor')).toBe('');

    result.current(card);
    expect(root.getPropertyValue('overflow-anchor')).toBe('none');

    window.dispatchEvent(new Event('wheel'));
    expect(root.getPropertyValue('overflow-anchor')).toBe('');
  });

  it('gives the page back the anchoring it had, when the hold ends any way', () => {
    const root = document.documentElement.style;
    root.setProperty('overflow-anchor', 'auto');
    const first = world.card(200);
    const second = world.card(700);
    const { result, unmount } = renderHook(() => useHoldPlace());

    // Holding another card while one is held does not keep the first one's 'none' as the original.
    result.current(first);
    result.current(second);
    expect(root.getPropertyValue('overflow-anchor')).toBe('none');
    result.current(null);
    expect(root.getPropertyValue('overflow-anchor')).toBe('auto');

    result.current(first);
    unmount();
    expect(root.getPropertyValue('overflow-anchor')).toBe('auto');
  });

  it('holds the card of the chip pressed last, not the one before', () => {
    const first = world.card(200);
    const second = world.card(700);
    const { result, rerender } = renderHook(() => useHoldPlace());
    result.current(first);
    result.current(second);

    first.place.at = 900;
    rerender();
    expect(world.scrollTo).not.toHaveBeenCalled();

    second.place.at = 900;
    rerender();
    expect(world.scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 200, behavior: 'instant' });
  });

  it('lets go when given no card', () => {
    const card = world.card(200);
    const { result, rerender } = renderHook(() => useHoldPlace());
    result.current(card);
    result.current(null);

    card.place.at = 520;
    rerender();
    expect(world.scrollTo).not.toHaveBeenCalled();
  });

  it('lets go of a card the list no longer has', () => {
    const card = world.card(200);
    const { result, rerender } = renderHook(() => useHoldPlace());
    result.current(card);
    card.remove();
    rerender();
    expect(world.scrollTo).not.toHaveBeenCalled();

    // And it is not held again if it comes back.
    document.body.append(card);
    card.place.at = 520;
    rerender();
    expect(world.scrollTo).not.toHaveBeenCalled();
  });

  it('stops listening to the window when the page is left', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const card = world.card(200);
    const { result, unmount } = renderHook(() => useHoldPlace());
    result.current(card);
    unmount();
    const removed = remove.mock.calls.map(([type]) => type);
    for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown', 'resize', 'scroll']) {
      expect(removed).toContain(type);
    }
  });
});
