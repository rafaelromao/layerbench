import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Card, Carousel, revealInCarousel } from './Card.js';

/** A strip as wide as `scrollWidth`, shown `clientWidth` of it: jsdom has no layout of its own. */
function strip(scrollWidth: number, clientWidth: number) {
  render(
    <Carousel label="Strip">
      <Card>
        <textarea aria-label="Text" />
      </Card>
    </Carousel>,
  );
  const el = screen.getByRole('list', { name: 'Strip' });
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
  return el;
}

function wheel(target: Element, init: WheelEventInit) {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('the wheel over a carousel', () => {
  it('scrolls it sideways, and keeps the page where it is', () => {
    const el = strip(1000, 400);
    const event = wheel(el, { deltaY: 120 });
    expect(event.defaultPrevented).toBe(true);
    expect(el.scrollLeft).toBe(120);
    wheel(el, { deltaY: -50 });
    expect(el.scrollLeft).toBe(70);
  });

  it('counts a notch of lines, and a page, as the wheel reports them', () => {
    const el = strip(2000, 400);
    wheel(el, { deltaY: 3, deltaMode: 1 });
    expect(el.scrollLeft).toBe(48);
    wheel(el, { deltaY: 1, deltaMode: 2 });
    expect(el.scrollLeft).toBe(448);
  });

  it('gives the wheel back to the page at either end', () => {
    const el = strip(1000, 400);
    expect(wheel(el, { deltaY: -50 }).defaultPrevented).toBe(false);
    el.scrollLeft = 600;
    expect(wheel(el, { deltaY: 50 }).defaultPrevented).toBe(false);
    // Away from the end it still takes it.
    expect(wheel(el, { deltaY: -50 }).defaultPrevented).toBe(true);
  });

  it('leaves alone a sideways gesture, a pinch, and a text area', () => {
    const el = strip(1000, 400);
    expect(wheel(el, { deltaX: 80, deltaY: 10 }).defaultPrevented).toBe(false);
    expect(wheel(el, { deltaY: 80, ctrlKey: true }).defaultPrevented).toBe(false);
    expect(wheel(screen.getByLabelText('Text'), { deltaY: 80 }).defaultPrevented).toBe(false);
    expect(el.scrollLeft).toBe(0);
  });

  it('leaves alone a strip whose cards all fit', () => {
    const el = strip(400, 400);
    expect(wheel(el, { deltaY: 80 }).defaultPrevented).toBe(false);
  });
});

describe('bringing a card into view', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A strip 300 wide with a card 176 wide at `left`, as the browser would lay them out. */
  function laidOut(left: number, scrolled = 0) {
    render(
      <Carousel label="Strip">
        <Card>card</Card>
      </Carousel>,
    );
    const el = screen.getByRole('list', { name: 'Strip' });
    const card = el.querySelector('li') as HTMLElement;
    Object.defineProperty(el, 'clientWidth', { configurable: true, value: 300 });
    el.scrollLeft = scrolled;
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 300 } as DOMRect);
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
      left: left - scrolled,
      width: 176,
    } as DOMRect);
    const scrollTo = vi.fn();
    el.scrollTo = scrollTo;
    return { card, scrollTo };
  }

  it('centres a card that is out of view, and scrolls nothing else', () => {
    const { card, scrollTo } = laidOut(900);
    revealInCarousel(card);
    expect(scrollTo).toHaveBeenCalledWith({ left: 900 - (300 - 176) / 2, behavior: 'smooth' });
  });

  it('leaves a card that is in view where it is', () => {
    const { card, scrollTo } = laidOut(100);
    revealInCarousel(card);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('brings back a card scrolled past', () => {
    const { card, scrollTo } = laidOut(50, 400);
    revealInCarousel(card);
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, behavior: 'smooth' });
  });
});
