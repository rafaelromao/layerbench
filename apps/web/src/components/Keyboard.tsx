import { type CompiledLayout, legend } from '@layoutmaster/core';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
  useCallback,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type Direction, nearestKey } from './key-nav.js';
import { type KeyDrop, useKeyDrag } from './use-key-drag.js';

const ARROWS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

export interface KeyboardHandle {
  /** Put keyboard focus back on a key, after an editor or a dialog has had it. */
  focusKey: (keyId: string) => void;
}

/** Pixels per key unit, and the gap that separates neighbouring caps. */
const UNIT = 64;
const GAP = 6;
const PAD = 0.8;

export interface KeyboardProps {
  compiled: CompiledLayout;
  layer?: number;
  /** Position index to 0–1 heat. */
  heat?: Record<number, number>;
  /** Positions to outline, e.g. the keys of a selected n-gram. */
  highlight?: number[];
  /** Key id drawn as selected. */
  selected?: string | null;
  /** Position pairs to connect with an arrow. */
  arcs?: [number, number][];
  interactive?: boolean;
  showHold?: boolean;
  className?: string;
  id?: string;
  onKeyClick?: (keyId: string) => void;
  /** Enables dragging a key onto another key, or onto a layer tab. */
  draggable?: boolean;
  onDropKey?: (drop: KeyDrop) => void;
  /** Called once a drag begins, so a view can put an open editor away. */
  onDragStart?: (keyId: string) => void;
  /**
   * Other keystrokes on a focused key, for shortcuts the view defines. The whole event is passed:
   * a view has to tell `z` from ctrl+`z`, and has to be able to stop the browser acting on a key.
   */
  onKeyShortcut?: (e: ReactKeyboardEvent<SVGGElement>, keyId: string) => void;
  ref?: Ref<KeyboardHandle>;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

/**
 * The keyboard as an SVG. Geometry comes from the compiled layout, so a 24-key split and a 60%
 * board draw through the same code; only the key coordinates differ.
 */
export function Keyboard({
  compiled,
  layer = 0,
  heat = {},
  highlight = [],
  selected = null,
  arcs = [],
  interactive = true,
  showHold = true,
  className,
  id,
  onKeyClick,
  draggable = false,
  onDropKey,
  onDragStart,
  onKeyShortcut,
  ref,
}: KeyboardProps) {
  const nodes = useRef<Record<string, SVGGElement | null>>({});
  // Which key holds the single tab stop. It follows focus, so tabbing back returns where you were.
  const [focused, setFocused] = useState<string | null>(null);
  const generatedId = useId();

  useImperativeHandle(
    ref,
    () => ({
      focusKey: (keyId: string) => nodes.current[keyId]?.focus(),
    }),
    [],
  );
  // Arrow markers are referenced by id, so two keyboards on one page must not share one.
  const markerId = `lm-arrow-${(id ?? generatedId).replace(/[^\w-]/g, '')}`;
  const layerIdx = Math.min(layer, compiled.layers.length - 1);
  const activeLayer = compiled.layers[layerIdx];
  const highlighted = useMemo(() => new Set(highlight), [highlight]);

  const view = useMemo(() => {
    const xs = compiled.keys.map((k) => k.x);
    const ys = compiled.keys.map((k) => k.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      ox: minX - PAD,
      oy: minY - PAD,
      width: (maxX - minX + 2 * PAD) * UNIT,
      height: (maxY - minY + 2 * PAD) * UNIT,
    };
  }, [compiled]);

  const legendOf = useCallback(
    (keyId: string) => {
      const idx = compiled.keyIndex.get(keyId);
      if (idx === undefined) return keyId;
      const active = compiled.layers[Math.min(layer, compiled.layers.length - 1)];
      return legend(compiled, active.bindings[idx]).tap || keyId;
    },
    [compiled, layer],
  );

  const drag = useKeyDrag(onDropKey, { legendOf, onDragStart });

  const keys = compiled.keys.map((k, idx) => {
    const binding = activeLayer.bindings[idx];
    const l = legend(compiled, binding);
    const explicit = activeLayer.explicit[idx];
    return {
      idx,
      key: k,
      cx: (k.x - view.ox) * UNIT,
      cy: (k.y - view.oy) * UNIT,
      w: k.w * UNIT - GAP,
      h: k.h * UNIT - GAP,
      tap: l.tap,
      hold: l.hold,
      kind: l.kind,
      // A key with no binding of its own on an upper layer is transparent: it falls through.
      trans: l.kind === 'trans' || (!explicit && layerIdx > 0),
      heat: heat[idx] ?? 0,
      highlighted: highlighted.has(idx),
      selected: selected === k.id,
    };
  });

  // Every key being a tab stop makes a 34-key board 34 stops; one stop plus arrows is what a grid
  // of controls is expected to do.
  const tabStop = focused ?? selected ?? compiled.keys[0]?.id ?? null;

  const onKeyDown = (e: ReactKeyboardEvent<SVGGElement>, keyId: string, idx: number) => {
    const direction = ARROWS[e.key];
    if (direction && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const next = nearestKey(compiled.keys, idx, direction);
      if (next !== undefined) {
        e.preventDefault();
        nodes.current[compiled.keys[next].id]?.focus();
        return;
      }
    }
    // The view gets first refusal, so an editing view can take Enter for itself; a view that does
    // not handle it leaves the key behaving like the button it says it is.
    onKeyShortcut?.(e, keyId);
    if (e.defaultPrevented) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onKeyClick?.(keyId);
    }
  };

  const centerOf = (pos: number) => {
    const k = compiled.keys[pos];
    if (!k) return null;
    return { x: (k.x - view.ox) * UNIT, y: (k.y - view.oy) * UNIT };
  };

  return (
    <svg
      id={id}
      className={`lm-keyboard w-full h-auto select-none ${className ?? ''}`}
      viewBox={`0 0 ${fmt(view.width)} ${fmt(view.height)}`}
      role={interactive ? 'group' : 'img'}
      aria-label="Keyboard layout"
      {...(draggable ? drag.handlers : {})}
    >
      {arcs.length > 0 && (
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" />
          </marker>
        </defs>
      )}

      {keys.map((k) => {
        const pct = Math.round(k.heat * 100);
        const label = `Key ${k.key.id}: ${k.tap || 'empty'}${k.hold ? `, hold ${k.hold}` : ''}`;
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: it takes a button role and tab stop whenever it is interactive
          <g
            key={k.key.id}
            transform={`translate(${fmt(k.cx)} ${fmt(k.cy)}) rotate(${fmt(k.key.rotation)})`}
            className={[
              'lm-key',
              k.trans && 'lm-key-trans',
              k.key.thumb && 'lm-key-thumb',
              k.selected && 'lm-key-selected',
            ]
              .filter(Boolean)
              .join(' ')}
            data-key={k.key.id}
            ref={(el) => {
              nodes.current[k.key.id] = el;
            }}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? (k.key.id === tabStop ? 0 : -1) : undefined}
            aria-label={label}
            style={{ cursor: interactive ? 'pointer' : 'default' }}
            onClick={
              interactive
                ? () => {
                    if (draggable && drag.consumeClick()) return;
                    onKeyClick?.(k.key.id);
                  }
                : undefined
            }
            onFocus={interactive ? () => setFocused(k.key.id) : undefined}
            onKeyDown={interactive ? (e) => onKeyDown(e, k.key.id, k.idx) : undefined}
          >
            <rect
              x={fmt(-k.w / 2)}
              y={fmt(-k.h / 2)}
              width={fmt(k.w)}
              height={fmt(k.h)}
              rx="9"
              className={`lm-key-cap${k.highlighted ? ' lm-key-highlight' : ''}`}
              style={{
                fill: `color-mix(in oklab, var(--lm-key-bg) ${100 - pct}%, var(--lm-heat) ${pct}%)`,
              }}
            />
            {k.key.home && <circle cx="0" cy={fmt(k.h / 2 - 9)} r="2.2" className="lm-key-home" />}
            <text
              x="0"
              y={k.hold && showHold ? '-2' : '4'}
              textAnchor="middle"
              className={`lm-key-tap lm-kind-${k.kind}`}
              fontSize={[...k.tap].length > 2 ? 15 : 22}
            >
              {k.tap}
            </text>
            {k.hold && showHold && (
              <text
                x="0"
                y={fmt(k.h / 2 - 12)}
                textAnchor="middle"
                className="lm-key-hold"
                fontSize="10"
              >
                {k.hold}
              </text>
            )}
          </g>
        );
      })}

      <g className="lm-arc">
        {arcs.map(([from, to], i) => {
          const a = centerOf(from);
          const b = centerOf(to);
          if (!a || !b) return null;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2 - Math.abs(b.x - a.x) * 0.25 - 12;
          return (
            <path
              // biome-ignore lint/suspicious/noArrayIndexKey: an n-gram may repeat the same pair
              key={`${from}-${to}-${i}`}
              d={`M ${fmt(a.x)} ${fmt(a.y)} Q ${fmt(mx)} ${fmt(my)} ${fmt(b.x)} ${fmt(b.y)}`}
              className="stroke-primary"
              strokeWidth="3"
              fill="none"
              opacity="0.85"
              markerEnd={`url(#${markerId})`}
            />
          );
        })}
      </g>
    </svg>
  );
}
