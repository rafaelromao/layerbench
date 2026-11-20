import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/** What the reader doing anything else is: any of these gives the page back to them. */
const TAKEN_OVER = ['wheel', 'touchstart', 'pointerdown', 'keydown', 'resize'] as const;

/** Less than this is the browser's rounding, not a card that moved. */
const NEGLIGIBLE = 0.5;

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
 * It lasts until the reader takes the page back (scrolling, a tap, a key, a resize) or presses
 * another chip, and holds the card's height on the screen only: in a grid of columns, a card that
 * is ranked into another column moves sideways.
 *
 * @returns `hold`, called with the card before the ranking changes; `null` lets go.
 */
export function useHoldPlace(): (card: HTMLElement | null) => void {
  const held = useRef<Held | null>(null);
  const stop = useRef<(() => void) | null>(null);

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
      // A press fires `pointerdown` before its `click`, so pressing a chip on another card lets go
      // of this one first and then holds that one.
      for (const type of TAKEN_OVER) window.addEventListener(type, release, { passive: true });
      stop.current = () => {
        for (const type of TAKEN_OVER) window.removeEventListener(type, release);
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
  });

  useEffect(() => release, [release]);

  return hold;
}
