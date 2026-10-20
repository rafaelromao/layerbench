import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
} from 'react';

/** Plain drag exchanges the two keys; holding a modifier puts a copy down and keeps the original. */
export type DragMode = 'swap' | 'copy';

export interface KeyDrop {
  from: string;
  /** The key the drag ended on. */
  to: string;
  mode: DragMode;
}

export interface KeyDragOptions {
  /** The legend to draw under the pointer, so it is clear what is being carried. */
  legendOf?: (keyId: string) => string;
  /** Called once a gesture becomes a drag, so a view can put an open editor away. */
  onDragStart?: (keyId: string) => void;
  /**
   * A finger rested on a key and lifted without moving: the touch way to pick a key beside the ones
   * already picked. Resting and then moving is still a drag.
   */
  onLongPress?: (keyId: string) => void;
}

export interface KeyDrag {
  /** Spread onto the SVG element that contains the keys. */
  handlers: {
    onPointerDown: (e: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerMove: (e: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerUp: (e: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<SVGSVGElement>) => void;
    onContextMenu: (e: ReactMouseEvent<SVGSVGElement>) => void;
  };
  /** True when the click that follows a drop should be ignored. */
  consumeClick: () => boolean;
}

/** Take the drop highlight off whatever is carrying it. */
export function clearDropTargets(): void {
  for (const el of document.querySelectorAll('.lb-drop-target')) {
    el.classList.remove('lb-drop-target', 'lb-drop-copy');
  }
}

/**
 * Put the drop highlight on a key, so it is clear where a release would land. The key is looked
 * for on the board being dragged on, when given, since a page can draw another board too.
 */
export function paintDropTarget(
  keyId: string,
  mode: DragMode = 'swap',
  board?: Element | null,
): void {
  const el = (board ?? document).querySelector(`g[data-key="${keyId}"]`);
  el?.classList.add('lb-drop-target');
  if (mode === 'copy') el?.classList.add('lb-drop-copy');
}

/** How far the pointer must travel before a press becomes a drag rather than a click. */
export const THRESHOLD = 4;
/** A touch has to rest on a key first, so the board can still be scrolled past with a finger. */
export const TOUCH_HOLD_MS = 350;

function keyAt(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined;
  return (target.closest('g[data-key]') as HTMLElement | null)?.dataset.key;
}

/**
 * The key of the board being dragged on that lies under the pointer, or nothing: a key of another
 * board on the page does not take a drop.
 */
export function targetUnder(x: number, y: number, board?: Element | null): string | undefined {
  const el = document.elementFromPoint(x, y);
  if (!(el instanceof Element)) return undefined;
  const keyEl = el.closest('g[data-key]') as HTMLElement | null;
  if (!keyEl || (board && !board.contains(keyEl))) return undefined;
  return keyEl.dataset.key;
}

/**
 * Dragging a key onto another key swaps the two or, with a modifier, copies over it. Pointer events
 * cover mouse, pen and touch alike, and a plain press still selects — only a pointer that travelled
 * counts as a drag.
 */
export function useKeyDrag(
  onDrop?: (drop: KeyDrop) => void,
  options: KeyDragOptions = {},
): KeyDrag {
  const from = useRef<string | undefined>(undefined);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  /** A touch is not allowed to drag until it has rested; a mouse or pen may drag at once. */
  const armed = useRef(true);
  /** A touch that rested on its key long enough to drag it, or to count as a long press. */
  const rested = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The press under way is a finger's. */
  const touch = useRef(false);
  const ghost = useRef<HTMLDivElement | null>(null);
  const suppressClick = useRef(false);
  // Options are read through a ref so a new object on every render does not re-make the handlers.
  const opts = useRef(options);
  opts.current = options;

  const clearGhost = useCallback(() => {
    ghost.current?.remove();
    ghost.current = null;
  }, []);

  const clearTargets = useCallback(clearDropTargets, []);

  const reset = useCallback(
    (svg: SVGSVGElement | null) => {
      if (holdTimer.current !== null) clearTimeout(holdTimer.current);
      holdTimer.current = null;
      if (from.current) {
        svg?.querySelector(`g[data-key="${from.current}"]`)?.classList.remove('lb-key-source');
      }
      from.current = undefined;
      origin.current = null;
      dragging.current = false;
      armed.current = true;
      rested.current = false;
      touch.current = false;
      svg?.classList.remove('lb-dragging');
      clearTargets();
      clearGhost();
    },
    [clearGhost, clearTargets],
  );

  // A drag interrupted by an unmount must not leave its ghost behind.
  useEffect(() => () => clearGhost(), [clearGhost]);

  const paintGhost = useCallback((x: number, y: number, mode: DragMode) => {
    const el = ghost.current;
    if (!el) return;
    el.className = `lb-key-ghost${mode === 'copy' ? ' lb-key-ghost-copy' : ''}`;
    el.style.transform = `translate(${x}px, ${y}px)`;
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    // A drop that no click followed would otherwise leave this armed, and swallow an unrelated
    // click much later on.
    suppressClick.current = false;
    const key = keyAt(e.target);
    if (!key) return;
    from.current = key;
    origin.current = { x: e.clientX, y: e.clientY };
    dragging.current = false;
    // The pointer is not captured yet: a captured pointer's click is dispatched to the capturing
    // element, so capturing here would send every plain click to the board instead of the key.

    touch.current = e.pointerType === 'touch';
    if (touch.current) {
      armed.current = false;
      rested.current = false;
      holdTimer.current = setTimeout(() => {
        armed.current = true;
        rested.current = true;
      }, TOUCH_HOLD_MS);
    } else {
      armed.current = true;
    }
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const start = origin.current;
      if (!from.current || !start) return;
      const travelled = Math.hypot(e.clientX - start.x, e.clientY - start.y);

      if (!armed.current) {
        // A finger that moves before it has rested is scrolling the page, not dragging a key.
        if (travelled > THRESHOLD) reset(e.currentTarget);
        return;
      }
      if (!dragging.current) {
        if (travelled < THRESHOLD) return;
        dragging.current = true;
        const svg = e.currentTarget;
        // Now it is a drag, the board keeps the pointer even when it leaves the board.
        svg.setPointerCapture?.(e.pointerId);
        svg.classList.add('lb-dragging');
        svg.querySelector(`g[data-key="${from.current}"]`)?.classList.add('lb-key-source');
        const el = document.createElement('div');
        el.textContent = opts.current.legendOf?.(from.current) ?? from.current;
        el.setAttribute('aria-hidden', 'true');
        document.body.appendChild(el);
        ghost.current = el;
        opts.current.onDragStart?.(from.current);
      }

      const mode: DragMode = e.altKey ? 'copy' : 'swap';
      paintGhost(e.clientX, e.clientY, mode);
      clearTargets();
      const over = targetUnder(e.clientX, e.clientY, e.currentTarget);
      if (over === undefined || over === from.current) return;
      paintDropTarget(over, mode, e.currentTarget);
    },
    [clearTargets, paintGhost, reset],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const start = from.current;
      const dragged = dragging.current;
      const longPress = !dragged && rested.current;
      const to = dragged ? targetUnder(e.clientX, e.clientY, e.currentTarget) : undefined;
      reset(e.currentTarget);
      if (start && longPress && opts.current.onLongPress) {
        // The click that follows would pick the key alone, undoing what the press just did.
        suppressClick.current = true;
        opts.current.onLongPress(start);
        return;
      }
      if (!start || !dragged) return;
      // A drop must not also register as a click on whatever is underneath.
      suppressClick.current = true;
      if (to === undefined || to === start) return;
      onDrop?.({ from: start, to, mode: e.altKey ? 'copy' : 'swap' });
    },
    [onDrop, reset],
  );

  const onPointerCancel = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      // A cancelled gesture is one the user backed out of; it must not land a drop.
      const dragged = dragging.current;
      reset(e.currentTarget);
      if (dragged) suppressClick.current = true;
    },
    [reset],
  );

  const onContextMenu = useCallback((e: ReactMouseEvent<SVGSVGElement>) => {
    // A finger resting on a key, to drag it or to pick it beside others, is not asking for the
    // browser's menu.
    if (touch.current && from.current) e.preventDefault();
  }, []);

  const consumeClick = useCallback(() => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  }, []);

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu },
    consumeClick,
  };
}

export interface CharDrag {
  /** Spread onto the element a character is dragged from. */
  handlers: (char: string) => {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
  };
  /** True when the click that follows a drag should be ignored. */
  consumeClick: () => boolean;
}

/**
 * Dragging a character from outside the board onto one of its keys, as the missing-keys tray does:
 * the same ghost and the same drop highlight as a key dragged, on the board `board` finds. The
 * element dragged from keeps the pointer, so a finger can carry it as well as a mouse.
 */
export function useCharDrag(
  board: () => Element | null,
  onDrop: (drop: { char: string; to: string }) => void,
  legendOf: (char: string) => string = (c) => c,
): CharDrag {
  const press = useRef<{ char: string; x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const ghost = useRef<HTMLDivElement | null>(null);
  const suppressClick = useRef(false);
  const latest = useRef({ board, onDrop, legendOf });
  latest.current = { board, onDrop, legendOf };

  const reset = useCallback(() => {
    press.current = null;
    dragging.current = false;
    ghost.current?.remove();
    ghost.current = null;
    clearDropTargets();
  }, []);

  // A drag interrupted by an unmount must not leave its ghost behind.
  useEffect(() => () => reset(), [reset]);

  const handlers = useCallback(
    (char: string) => ({
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        // One character at a time, carried by the main button or the first finger.
        if (!e.isPrimary || e.button !== 0 || press.current) return;
        suppressClick.current = false;
        press.current = { char, x: e.clientX, y: e.clientY };
        dragging.current = false;
        // Captured, the pointer stays with the chip all the way to the key it is let go over.
        e.currentTarget.setPointerCapture?.(e.pointerId);
      },
      onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
        const start = press.current;
        if (!start || start.char !== char) return;
        if (!dragging.current) {
          if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < THRESHOLD) return;
          dragging.current = true;
          const el = document.createElement('div');
          el.className = 'lb-key-ghost';
          el.textContent = latest.current.legendOf(char);
          el.setAttribute('aria-hidden', 'true');
          document.body.appendChild(el);
          ghost.current = el;
        }
        if (ghost.current) {
          ghost.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        }
        clearDropTargets();
        const on = latest.current.board();
        const over = targetUnder(e.clientX, e.clientY, on);
        if (over !== undefined) paintDropTarget(over, 'swap', on);
      },
      onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
        const start = press.current;
        const dragged = dragging.current;
        const to = dragged ? targetUnder(e.clientX, e.clientY, latest.current.board()) : undefined;
        reset();
        if (!start || !dragged) return;
        // A drop must not also count as a tap on the chip.
        suppressClick.current = true;
        if (to !== undefined) latest.current.onDrop({ char: start.char, to });
      },
      onPointerCancel: (_e: ReactPointerEvent<HTMLElement>) => {
        if (dragging.current) suppressClick.current = true;
        reset();
      },
    }),
    [reset],
  );

  const consumeClick = useCallback(() => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  }, []);

  return { handlers, consumeClick };
}
