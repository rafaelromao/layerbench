import { type PointerEvent as ReactPointerEvent, useCallback, useRef } from 'react';

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

function keyAt(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined;
  return (target.closest('g[data-key]') as HTMLElement | null)?.dataset.key;
}

function keyUnder(x: number, y: number): string | undefined {
  return keyAt(document.elementFromPoint(x, y));
}

/**
 * Dragging one key onto another swaps them. Pointer events cover mouse, pen and touch alike, and a
 * plain press still selects: only a pointer that actually moved counts as a drag.
 */
export function useKeyDrag(onSwap?: (from: string, to: string) => void): KeyDrag {
  const from = useRef<string | undefined>(undefined);
  const moved = useRef(false);
  const suppressClick = useRef(false);

  const clearTargets = useCallback((svg: SVGSVGElement) => {
    for (const g of svg.querySelectorAll('g[data-key].lm-drop-target')) {
      g.classList.remove('lm-drop-target');
    }
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    const key = keyAt(e.target);
    if (!key) return;
    from.current = key;
    moved.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!from.current) return;
      moved.current = true;
      const svg = e.currentTarget;
      svg.classList.add('lm-dragging');
      clearTargets(svg);
      const over = keyUnder(e.clientX, e.clientY);
      if (over && over !== from.current) {
        svg.querySelector(`g[data-key="${over}"]`)?.classList.add('lm-drop-target');
      }
    },
    [clearTargets],
  );

  const finish = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const start = from.current;
      const dragged = moved.current;
      from.current = undefined;
      moved.current = false;
      svg.classList.remove('lm-dragging');
      clearTargets(svg);
      if (!start || !dragged) return;
      const to = keyUnder(e.clientX, e.clientY);
      if (!to || to === start) return;
      // A drop must not also register as a click on the key underneath.
      suppressClick.current = true;
      onSwap?.(start, to);
    },
    [clearTargets, onSwap],
  );

  const consumeClick = useCallback(() => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  }, []);

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
    consumeClick,
  };
}
