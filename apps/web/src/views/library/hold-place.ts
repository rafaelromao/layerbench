import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/** What the reader doing anything else is: any of these gives the page back to them. */
const TAKEN_OVER = ['wheel', 'touchstart', 'pointerdown', 'keydown', 'resize'] as const;

/** Less than this is the browser's rounding, not a card that moved. */
const NEGLIGIBLE = 0.5;

/** The window moved this far from where the hold left it: the reader scrolled it, not the hold. */
const SCROLLED_AWAY = 1;

interface Held {
  card: HTMLElement;
  /** Where the card's top was on the screen when it was held, which is where it is kept. */
  top: number;
}

/**
 * Keeps one card where it is on the screen while the list around it is ranked again. A language
 * chip puts the Library on another text, and the list is then sorted more than once: at once from
 * what is known of that text, then as each layout's score lands, then when those whose numbers
 * changed move together. The card whose chip was pressed is in a new place each time, and the page
 * would stay at the scroll it had; so after every render of the host the window is scrolled by the
 * distance the card has moved, before the browser paints. Held cards are compared with the place
 * they were first seen in, never the last one, so a page too short to scroll all the way catches up
 * when a later render makes room.
 *
 * It lasts until the reader takes the page back or presses another chip. Taking it back is a wheel,
 * a tap, a key, a resize, or the window being anywhere but where the hold left it (a dragged
 * scrollbar, Find in page, a link to an anchor: scrolling that fires none of the others). It holds
 * the card's height on the screen only: in a grid of columns, a card that is ranked into another
 * column moves sideways.
 *
 * While a card is held the browser's own scroll anchoring is off for the page. It follows some card
 * across the reorder to keep it still, which is a different card than the held one, and the two
 * would fight. The hold keeps the card still itself, so the page has no need of it; it is on again
 * when the hold ends.
 *
 * @returns `hold`, called with the card before the ranking changes; `null` lets go.
 */
export function useHoldPlace(): (card: HTMLElement | null) => void {
  const held = useRef<Held | null>(null);
  const stop = useRef<(() => void) | null>(null);
  /** Where the window was when the hold last left it: a scroll to anywhere else is the reader's. */
  const left = useRef(0);

  const release = useCallback(() => {
    held.current = null;
    stop.current?.();
    stop.current = null;
  }, []);

  const hold = useCallback(
    (card: HTMLElement | null) => {
      release();
      if (card === null) return;
      held.current = { card, top: card.getBoundingClientRect().top };
      left.current = window.scrollY;

      const onScroll = () => {
        if (Math.abs(window.scrollY - left.current) > SCROLLED_AWAY) release();
      };
      // A press fires `pointerdown` before its `click`, so pressing a chip on another card lets go
      // of this one first and then holds that one.
      for (const type of TAKEN_OVER) window.addEventListener(type, release, { passive: true });
      window.addEventListener('scroll', onScroll, { passive: true });

      const root = document.documentElement.style;
      const anchoring = root.getPropertyValue('overflow-anchor');
      root.setProperty('overflow-anchor', 'none');

      stop.current = () => {
        for (const type of TAKEN_OVER) window.removeEventListener(type, release);
        window.removeEventListener('scroll', onScroll);
        if (anchoring === '') root.removeProperty('overflow-anchor');
        else root.setProperty('overflow-anchor', anchoring);
      };
    },
    [release],
  );

  // Every commit of the host, with no dependencies: a re-sort and a card changing its height are
  // both a render, and neither can be told from the other here.
  useLayoutEffect(() => {
    const now = held.current;
    if (now === null) return;
    if (!now.card.isConnected) {
      release();
      return;
    }
    const moved = now.card.getBoundingClientRect().top - now.top;
    if (Math.abs(moved) < NEGLIGIBLE) return;
    // Instantly, whatever the page's scroll-behavior: a smooth scroll would show the jump.
    window.scrollTo({ left: window.scrollX, top: window.scrollY + moved, behavior: 'instant' });
    // Read back, not the `top` asked for: a window at the end of its range stops short of it.
    left.current = window.scrollY;
  });

  useEffect(() => release, [release]);

  return hold;
}
