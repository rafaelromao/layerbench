import { type RefObject, useEffect, useRef } from 'react';

/**
 * Closes something open — a menu, a list of suggestions, a dialog — when the pointer goes down
 * anywhere outside it, or Escape is pressed. A tap on a phone and a click at a desk both start
 * with `pointerdown`, and listening in the capture phase means a control that stops propagation
 * cannot keep the menu open by accident.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  { active = true, closeOnEscape = true }: { active?: boolean; closeOnEscape?: boolean } = {},
): void {
  // The latest callback, so a caller passing a fresh closure each render does not re-subscribe.
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    if (!active) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = ref.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) dismiss.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') dismiss.current();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, active, closeOnEscape]);
}
