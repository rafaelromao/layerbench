import '@testing-library/jest-dom/vitest';
// jsdom ships no IndexedDB, so saved documents need an in-memory implementation.
import 'fake-indexeddb/auto';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without global test functions, so the automatic unmount does not register itself.
afterEach(cleanup);
// What one test leaves in this browser's storage (scores, preferences) must not reach the next.
afterEach(() => localStorage.clear());

/**
 * What these tests wait for is real work: an analysis running in the test's own thread, or a
 * document going through IndexedDB. Testing Library's one-second default was enough on an idle
 * machine and lost the race on a busy one, failing whichever test happened to be waiting.
 */
configure({ asyncUtilTimeout: 10_000 });

/**
 * jsdom gaps the interface relies on. Each one is a browser feature the tests exercise indirectly,
 * so stubbing here keeps the tests about behavior rather than about the environment.
 */

/**
 * Media queries answer false by default, so a test runs as a mouse would. `setPointerKind('touch')`
 * makes the same run answer as a finger does, which is a different interface rather than the same
 * one at a different size: a finger cannot hover, and cannot type on a key.
 */
let pointerKind: 'mouse' | 'touch' = 'mouse';

export function setPointerKind(kind: 'mouse' | 'touch'): void {
  pointerKind = kind;
}

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    get matches() {
      return pointerKind === 'touch' && /hover:\s*none|pointer:\s*coarse/.test(query);
    },
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// Every test starts as a mouse unless it says otherwise.
afterEach(() => setPointerKind('mouse'));

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom parses <dialog> but does not open it. Toggling `open` is enough for the tests, which are
// about what the dialog contains, not about the browser's focus trap.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}

// Without a layout engine there is nothing under a point; tests that drag say what is.
if (!document.elementFromPoint) {
  document.elementFromPoint = () => null;
}

// jsdom has no layout engine, so pointer capture is a no-op rather than an error.
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => false;
}

// The in-place editor repositions itself when the board resizes; jsdom never resizes anything.
if (typeof ResizeObserver === 'undefined') {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
      this.pointerType = params.pointerType ?? 'mouse';
    }
  }
  (globalThis as { PointerEvent?: unknown }).PointerEvent = PointerEventPolyfill;
}
