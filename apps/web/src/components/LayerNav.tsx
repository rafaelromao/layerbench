import type { LayerColor } from '@layerbench/core';
import {
  type KeyboardEvent,
  type PointerEvent,
  type TouchEvent,
  useEffect,
  useRef,
  useState,
  type WheelEvent,
} from 'react';
import { layerColourOf } from './layer-colour.js';
import { TOUCH_HOLD_MS } from './use-key-drag.js';

export interface NavLayer {
  idx: number;
  id: string;
  name: string;
  color?: LayerColor;
}

export interface LayerNavProps {
  layers: readonly NavLayer[];
  /** The `idx` of the layer shown. */
  active: number;
  onSelect: (idx: number) => void;
  /** Lets the name be changed where it stands: double-click it, press F2 on it, or hold a finger on it. */
  onRename?: (id: string, name: string) => void;
  /** What the navigator is called, for a page that shows the layers of more than one layout. */
  label?: string;
  className?: string;
}

/** How long a finger rests on the name before it is renamed rather than left alone. */
const LONG_PRESS_MS = 550;

/**
 * Layer selection, the same on every page that shows a board: ‹ and › step through the layers, a
 * counter says where it is, and the layer's name is written in its colour. Arrow keys step too, and
 * `useLayerSwipe` lets a finger do it on the board itself. A layout with one layer shows only its
 * name. The layers do not wrap round: the first has nothing before it.
 */
export function LayerNav({
  layers,
  active,
  onSelect,
  onRename,
  label = 'Layers',
  className = '',
}: LayerNavProps) {
  const [renaming, setRenaming] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const name = useRef<HTMLButtonElement>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointer = useRef('mouse');
  /** Enter, Escape and the blur that follows either must settle one rename, not two. */
  const settled = useRef(false);

  useEffect(() => {
    if (!renaming) return;
    settled.current = false;
    field.current?.focus();
    field.current?.select();
  }, [renaming]);
  useEffect(
    () => () => {
      if (press.current) clearTimeout(press.current);
    },
    [],
  );

  const found = layers.findIndex((l) => l.idx === active);
  const at = found < 0 ? 0 : found;
  const layer = layers[at];
  if (!layer) return null;
  const many = layers.length > 1;
  const colour = layerColourOf(layer.idx, layer.color);

  const step = (delta: number) => {
    const next = layers[at + delta];
    if (next) onSelect(next.idx);
  };
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  };
  const finish = (value: string | null) => {
    if (settled.current) return;
    settled.current = true;
    setRenaming(false);
    if (value !== null) onRename?.(layer.id, value);
    // The name comes back where the field was; focus goes with it, so the keyboard is not lost.
    requestAnimationFrame(() => name.current?.focus());
  };

  const arrow = (delta: number, text: string, what: string) => {
    const edge = at + delta < 0 || at + delta >= layers.length;
    return (
      // Not `disabled`: a button that is focused when it dies takes the keyboard with it.
      <button
        type="button"
        aria-label={what}
        aria-disabled={edge}
        className={`btn btn-ghost btn-xs ${edge ? 'opacity-30' : ''}`}
        onClick={() => step(delta)}
      >
        {text}
      </button>
    );
  };

  const nameStyle = colour ? { color: colour } : undefined;
  const nameClass = 'min-w-0 max-w-[10rem] truncate text-sm font-medium';

  return (
    <fieldset
      aria-label={label}
      className={`flex min-w-0 items-center gap-1 ${className}`}
      onKeyDown={(e: KeyboardEvent<HTMLFieldSetElement>) => {
        // A field being typed in keeps its arrow keys.
        if (!many || e.target instanceof HTMLInputElement) return;
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          step(1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          step(-1);
        }
      }}
    >
      {many && arrow(-1, '‹', 'Previous layer')}
      {renaming ? (
        <input
          ref={field}
          aria-label={`Rename ${layer.name}`}
          className="input input-xs w-28"
          defaultValue={layer.name}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              finish(e.currentTarget.value);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              finish(null);
            }
          }}
          onBlur={(e) => finish(e.currentTarget.value)}
        />
      ) : onRename ? (
        <button
          ref={name}
          type="button"
          className={`${nameClass} cursor-text rounded px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary`}
          style={nameStyle}
          title="Double-click or press F2 to rename"
          // Enter and Space reach here with no pointer (detail 0): they are the keyboard's way in.
          onClick={(e) => e.detail === 0 && setRenaming(true)}
          onDoubleClick={() => setRenaming(true)}
          onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
            pointer.current = e.pointerType;
            if (e.pointerType !== 'touch') return;
            cancelPress();
            press.current = setTimeout(() => setRenaming(true), LONG_PRESS_MS);
          }}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
          // A finger held on the name would otherwise also open the browser's menu for it.
          onContextMenu={(e) => {
            if (pointer.current === 'touch') e.preventDefault();
          }}
          onKeyDown={(e) => {
            if (e.key === 'F2') {
              e.preventDefault();
              setRenaming(true);
            }
          }}
        >
          {layer.name}
        </button>
      ) : (
        <span className={nameClass} style={nameStyle}>
          {layer.name}
        </span>
      )}
      {many && (
        <span className="text-xs tabular-nums opacity-60" aria-live="polite">
          {at + 1} / {layers.length}
        </span>
      )}
      {many && arrow(1, '›', 'Next layer')}
    </fieldset>
  );
}

/** How far a finger must travel sideways, and how much more than it travels up or down. */
const SWIPE_MIN_PX = 48;
const SWIPE_STRAIGHTNESS = 1.5;
/** A swipe is quick; a finger resting longer on a key is on its way to dragging it. */
const SWIPE_MAX_MS = 800;
/** Wheel events this close together are one trackpad swipe, inertia and all. */
const WHEEL_GESTURE_GAP_MS = 200;
const WHEEL_MIN_PX = 30;

/**
 * Props for the element holding a board, so a swipe on it changes layer: a quick horizontal swipe
 * of a finger, or a sideways scroll on a trackpad. A finger that rests on a key first is dragging
 * it, and a gesture that panned or scrolled the board is not a swipe; vertical scrolling is never
 * touched. Touch events are only listened to, so the page scrolls and the board pans as ever.
 */
export function useLayerSwipe(
  layers: readonly { idx: number }[],
  active: number,
  onSelect: (idx: number) => void,
) {
  const start = useRef<{ x: number; y: number; at: number; onKey: boolean } | null>(null);
  const scrolled = useRef(false);
  const lastWheel = useRef(Number.NEGATIVE_INFINITY);
  const found = layers.findIndex((l) => l.idx === active);
  const at = found < 0 ? 0 : found;

  const step = (delta: number) => {
    const next = layers[at + delta];
    if (next) onSelect(next.idx);
  };

  return {
    onTouchStart(e: TouchEvent<HTMLElement>) {
      const t = e.touches[0];
      // A second finger makes it a pinch, or a pan with two.
      if (e.touches.length !== 1 || !t) {
        start.current = null;
        return;
      }
      scrolled.current = false;
      start.current = {
        x: t.clientX,
        y: t.clientY,
        at: performance.now(),
        onKey: e.target instanceof Element && e.target.closest('g[data-key]') !== null,
      };
    },
    onTouchEnd(e: TouchEvent<HTMLElement>) {
      const s = start.current;
      start.current = null;
      const t = e.changedTouches[0];
      if (!s || !t || scrolled.current) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < SWIPE_STRAIGHTNESS * Math.abs(dy)) return;
      if (performance.now() - s.at > (s.onKey ? TOUCH_HOLD_MS : SWIPE_MAX_MS)) return;
      step(dx < 0 ? 1 : -1);
    },
    onTouchCancel() {
      start.current = null;
    },
    // The board panned inside its own box: that was the finger's work, not a swipe.
    onScrollCapture() {
      scrolled.current = true;
    },
    onWheel(e: WheelEvent<HTMLElement>) {
      if (Math.abs(e.deltaX) < WHEEL_MIN_PX || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
      const now = performance.now();
      const gap = now - lastWheel.current;
      lastWheel.current = now;
      if (gap < WHEEL_GESTURE_GAP_MS) return;
      step(e.deltaX > 0 ? 1 : -1);
    },
  };
}
