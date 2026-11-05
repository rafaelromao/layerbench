import { type ComponentProps, type ReactNode, useEffect, useRef } from 'react';

/** One notch of a wheel that counts lines, in pixels. */
const LINE_PX = 16;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Whether `target`, inside `strip`, is in something that scrolls up or down and has room to. */
function scrollsItself(target: Element | null, strip: Element, down: boolean): boolean {
  for (let n = target; n && n !== strip; n = n.parentElement) {
    if (n.scrollHeight <= n.clientHeight) continue;
    const { overflowY } = getComputedStyle(n);
    if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
    if (down ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0) return true;
  }
  return false;
}

/**
 * Every editor panel but the Board, as one strip of slides at one height, scrolled sideways inside
 * its panel. The mouse wheel scrolls it too while the pointer is over it, and keeps the page where
 * it is, at either end as well: the page moves only when the pointer is off the strip.
 */
export function Carousel({
  label,
  className = '',
  ...rest
}: ComponentProps<'ul'> & { label: string }) {
  const strip = useRef<HTMLUListElement>(null);

  // A native listener: React's own wheel handler is passive, and cannot stop the page scrolling.
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Sideways gestures already scroll it, a pinch zooms, and a text area, or a slide with more
      // than it holds, scrolls itself while it has room to.
      if (e.defaultPrevented || e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const target = e.target as Element | null;
      if (target?.closest?.('textarea') || scrollsItself(target, el, e.deltaY > 0)) return;
      // A strip whose slides all fit has nothing to scroll, and leaves the wheel to the page.
      if (el.scrollWidth - el.clientWidth <= 0) return;
      const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? el.clientWidth : 1;
      e.preventDefault();
      el.scrollLeft += e.deltaY * unit;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <ul
      ref={strip}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard.
      tabIndex={0}
      aria-label={label}
      className={`lb-carousel ${className}`}
      {...rest}
    />
  );
}

/** One item of a carousel. */
export function Slide({
  current = false,
  className = '',
  ...rest
}: ComponentProps<'li'> & {
  /** The slide is the one picked, or the one on the board. */
  current?: boolean;
}) {
  return <li className={`lb-slide ${current ? 'lb-slide-current' : ''} ${className}`} {...rest} />;
}

/**
 * A symbol on a key's shape, with what it holds under it. A long legend, a word or a macro, is set
 * smaller to fit; the symbol is what is drawn, so a screen reader is given the slide's own words.
 */
export function Keycap({
  symbol,
  hold,
  small = false,
  as = 'span',
  className = '',
  ...rest
}: Omit<ComponentProps<'span'>, 'children'> & {
  symbol: string;
  hold?: string;
  small?: boolean;
  /** The heading of a slide that is about this symbol. */
  as?: 'span' | 'h3';
}) {
  const Tag = as as 'span';
  const long = [...symbol].length > 2;
  return (
    <Tag
      className={`lb-keycap ${small ? 'lb-keycap-sm' : ''} ${long ? 'lb-keycap-long' : ''} ${className}`}
      {...rest}
    >
      <span className="lb-keycap-tap">{symbol}</span>
      {hold ? <span className="lb-keycap-hold">{hold}</span> : null}
    </Tag>
  );
}

/** What the panel says under its carousel; two lines are kept for it, and more where the width needs. */
export function CarouselHint({ children }: { children: ReactNode }) {
  return <p className="lb-carousel-hint text-[11px] opacity-60">{children}</p>;
}

/**
 * Scroll a carousel sideways, and only it, until `slide` is in view, centred when it was not. The
 * page does not move: a slide picked from the board below it is brought to the eye, not the other
 * way round.
 */
export function revealInCarousel(slide: HTMLElement) {
  const strip = slide.closest<HTMLElement>('.lb-carousel');
  if (!strip) return;
  const at = strip.getBoundingClientRect();
  const it = slide.getBoundingClientRect();
  const left = it.left - at.left + strip.scrollLeft;
  if (left >= strip.scrollLeft && left + it.width <= strip.scrollLeft + strip.clientWidth) return;
  const to = Math.max(0, left - (strip.clientWidth - it.width) / 2);
  if (strip.scrollTo) {
    strip.scrollTo({ left: to, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  } else {
    strip.scrollLeft = to;
  }
}
