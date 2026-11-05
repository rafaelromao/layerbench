import { type ComponentProps, type ReactNode, useEffect, useRef } from 'react';

/** One notch of a wheel that counts lines, in pixels. */
const LINE_PX = 16;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Every editor panel but the Board, as one strip of cards at one height, scrolled sideways inside
 * its panel. The mouse wheel scrolls it too while the pointer is over it, up to either end, where
 * the page takes the wheel back.
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
      // Sideways gestures already scroll it, a pinch zooms, and a text area scrolls itself.
      if (e.defaultPrevented || e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if ((e.target as Element | null)?.closest?.('textarea')) return;
      const room = el.scrollWidth - el.clientWidth;
      if (room <= 0) return;
      const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? el.clientWidth : 1;
      const by = e.deltaY * unit;
      // At the end the wheel pushes toward, the page scrolls on instead of being held here.
      if ((by < 0 && el.scrollLeft <= 0) || (by > 0 && el.scrollLeft >= room - 1)) return;
      e.preventDefault();
      el.scrollLeft += by;
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
export function Card({
  current = false,
  className = '',
  ...rest
}: ComponentProps<'li'> & {
  /** The card is the one picked, or the one on the board. */
  current?: boolean;
}) {
  return <li className={`lb-card ${current ? 'lb-card-current' : ''} ${className}`} {...rest} />;
}

/** What the panel says under its carousel; two lines are kept for it, so every panel ends alike. */
export function CarouselHint({ children }: { children: ReactNode }) {
  return <p className="lb-carousel-hint text-[11px] opacity-60">{children}</p>;
}

/**
 * Scroll a carousel sideways, and only it, until `card` is in view, centred when it was not. The
 * page does not move: a card picked from the board below it is brought to the eye, not the other
 * way round.
 */
export function revealInCarousel(card: HTMLElement) {
  const strip = card.closest<HTMLElement>('.lb-carousel');
  if (!strip) return;
  const at = strip.getBoundingClientRect();
  const it = card.getBoundingClientRect();
  const left = it.left - at.left + strip.scrollLeft;
  if (left >= strip.scrollLeft && left + it.width <= strip.scrollLeft + strip.clientWidth) return;
  const to = Math.max(0, left - (strip.clientWidth - it.width) / 2);
  if (strip.scrollTo) {
    strip.scrollTo({ left: to, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  } else {
    strip.scrollLeft = to;
  }
}
