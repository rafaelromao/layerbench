import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef } from 'react';

/** Where a drag ended: another key, or a layer tab that takes the binding to that layer. */
export type DropTarget = { kind: 'key'; keyId: string } | { kind: 'layer'; layerId: string };

/** Plain drag exchanges the two keys; holding a modifier puts a copy down and keeps the original. */
export type DragMode = 'swap' | 'copy';

export interface KeyDrop {
  from: string;
  to: DropTarget;
  mode: DragMode;
}

export interface KeyDragOptions {
  /** The legend to draw under the pointer, so it is clear what is being carried. */
  legendOf?: (keyId: string) => string;
  /** Called once a gesture becomes a drag, so a view can put an open editor away. */
  onDragStart?: (keyId: string) => void;
}

export interface KeyDrag {
  /** Spread onto the SVG element that contains the keys. */
  handlers: {
    onPointerDown: (e: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerMove: (e: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerUp: (e: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<SVGSVGElement>) => void;
  };
  /** True when the click that follows a drop should be ignored. */
  consumeClick: () => boolean;
}

/** Take the drop highlight off whatever is carrying it. */
export function clearDropTargets(): void {
  for (const el of document.querySelectorAll('.lm-drop-target')) {
    el.classList.remove('lm-drop-target', 'lm-drop-copy');
  }
}

/** Put the drop highlight on a target, so it is clear where a release would land. */
export function paintDropTarget(target: DropTarget, mode: DragMode = 'swap'): void {
  const selector =
    target.kind === 'key'
      ? `g[data-key="${target.keyId}"]`
      : `[data-layer-drop="${target.layerId}"]`;
  const el = document.querySelector(selector);
  el?.classList.add('lm-drop-target');
  if (mode === 'copy') el?.classList.add('lm-drop-copy');
}

/** How far the pointer must travel before a press becomes a drag rather than a click. */
const THRESHOLD = 4;
/** A touch has to rest on a key first, so the board can still be scrolled past with a finger. */
const TOUCH_HOLD_MS = 350;

function keyAt(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined;
  return (target.closest('g[data-key]') as HTMLElement | null)?.dataset.key;
}

/** What lies under the pointer: a key, a layer tab, or nothing that takes a drop. */
export function targetUnder(x: number, y: number): DropTarget | undefined {
  const el = document.elementFromPoint(x, y);
  if (!(el instanceof Element)) return undefined;
  const key = (el.closest('g[data-key]') as HTMLElement | null)?.dataset.key;
  if (key !== undefined) return { kind: 'key', keyId: key };
  const layer = (el.closest('[data-layer-drop]') as HTMLElement | null)?.dataset.layerDrop;
  if (layer !== undefined) return { kind: 'layer', layerId: layer };
  return undefined;
}

/**
 * Dragging a key puts its binding somewhere else: onto another key, which swaps the two or copies
 * over it, or onto a layer tab, which sends it to that layer. Pointer events cover mouse, pen and
 * touch alike, and a plain press still selects — only a pointer that travelled counts as a drag.
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
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        svg?.querySelector(`g[data-key="${from.current}"]`)?.classList.remove('lm-key-source');
      }
      from.current = undefined;
      origin.current = null;
      dragging.current = false;
      armed.current = true;
      svg?.classList.remove('lm-dragging');
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
    el.className = `lm-key-ghost${mode === 'copy' ? ' lm-key-ghost-copy' : ''}`;
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
    e.currentTarget.setPointerCapture?.(e.pointerId);

    if (e.pointerType === 'touch') {
      armed.current = false;
      holdTimer.current = setTimeout(() => {
        armed.current = true;
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
        svg.classList.add('lm-dragging');
        svg.querySelector(`g[data-key="${from.current}"]`)?.classList.add('lm-key-source');
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
      const over = targetUnder(e.clientX, e.clientY);
      if (!over || (over.kind === 'key' && over.keyId === from.current)) return;
      paintDropTarget(over, mode);
    },
    [clearTargets, paintGhost, reset],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const start = from.current;
      const dragged = dragging.current;
      const to = dragged ? targetUnder(e.clientX, e.clientY) : undefined;
      reset(e.currentTarget);
      if (!start || !dragged) return;
      // A drop must not also register as a click on whatever is underneath.
      suppressClick.current = true;
      if (!to) return;
      if (to.kind === 'key' && to.keyId === start) return;
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

  const consumeClick = useCallback(() => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  }, []);

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    consumeClick,
  };
}
