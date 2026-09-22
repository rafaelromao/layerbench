export interface Anchor {
  /** Distance from the wrapper's left edge to the centre of the key; the popover is centred on it. */
  left: number;
  top: number;
  above: boolean;
}

const GAP = 6;
const MARGIN = 8;

/**
 * How much of the page the reader can actually see. On a phone the on-screen keyboard covers the
 * bottom of the window without changing `innerHeight`, so measuring that would put the editor
 * underneath the very keyboard being used to type into it.
 */
function visibleHeight(): number {
  if (typeof window === 'undefined') return 0;
  return window.visualViewport?.height ?? window.innerHeight;
}

/**
 * Where to put the in-place editor for a key.
 *
 * Both rectangles are measured rather than derived from the viewBox: the keyboard is drawn with
 * `height: auto` under a `max-height`, so once the height clamp bites the drawing is scaled down
 * and letterboxed inside a full-width element, and a scale computed from the element's width alone
 * is wrong by half a key. Measuring is also right through the rotation on the thumb keys, and
 * needs no `getScreenCTM` — which jsdom does not implement.
 */
export function anchorKey(
  wrapper: HTMLElement,
  keyEl: Element,
  popover: HTMLElement | null,
  viewportHeight = visibleHeight(),
): Anchor {
  const k = keyEl.getBoundingClientRect();
  const w = wrapper.getBoundingClientRect();
  const centre = k.left - w.left + k.width / 2;
  const below = k.bottom - w.top + GAP;

  const width = popover?.offsetWidth ?? 0;
  const height = popover?.offsetHeight ?? 0;
  const room = wrapper.clientWidth;

  let left = centre;
  if (room > 0 && width > 0) {
    const half = width / 2;
    left =
      width + MARGIN * 2 > room
        ? room / 2
        : Math.min(Math.max(centre, half + MARGIN), room - half - MARGIN);
  }

  // Whether the editor fits is a question about the window, not about the board: the board is only
  // as tall as the drawing, and the editor is free to hang below it. Opening upwards is only worth
  // doing when the window has no room underneath and does have room above — on a phone, where the
  // board is short and high up, neither is true and the editor stays where it is.
  const fitsBelow = viewportHeight === 0 || k.bottom + GAP + height <= viewportHeight;
  const fitsAbove = k.top - GAP - height >= 0;
  const above = height > 0 && !fitsBelow && fitsAbove;
  return { left, top: above ? k.top - w.top - height - GAP : below, above };
}
