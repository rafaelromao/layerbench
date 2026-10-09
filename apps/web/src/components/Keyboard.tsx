import {
  type Binding,
  type CompiledLayout,
  describeReach,
  type GeometryKey,
  type Legend,
  legend,
  type ReachKey,
  reachKeys,
} from '@layerbench/core';
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
  useCallback,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type Fit, fitLabel, legendNumber } from './fit-label.js';
import { type Direction, nearestKey } from './key-nav.js';
import { layerColourOf } from './layer-colour.js';
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

/** A combo on the board: a small legend between the keys pressed together to fire it. */
export interface KeyboardCombo {
  id: string;
  /** Positions of the keys pressed together. */
  keys: number[];
  label: string;
  /** Drawn as being pressed, as a step of how a word is typed is. */
  active?: boolean;
}

/**
 * The combos marked for typing that fire on a layer, as the board draws them. A command combo is
 * a shortcut the analysis never presses, so it is not shown among the keys that type.
 */
export function typingCombos(
  compiled: CompiledLayout,
  layer: number,
  active: string | null = null,
): KeyboardCombo[] {
  return compiled.combos
    .filter(
      (c) => c.role === 'typing' && (c.layerMask === null || (c.layerMask & (1 << layer)) !== 0),
    )
    .map((c) => {
      // What it types, and what it types when its keys are held together, as `? / ¿`.
      const l = legend(compiled, c.binding);
      const held = l.hold !== null && !l.holdIsMode ? ` / ${l.hold}` : '';
      return {
        id: c.id,
        keys: c.keys,
        label: `${l.tap || '·'}${held}`,
        active: c.id === active,
      };
    });
}

/** How far a key reaches from its centre, across and down, turned the way it is drawn. */
export function reach(k: GeometryKey): { x: number; y: number } {
  const turn = (k.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(turn));
  const sin = Math.abs(Math.sin(turn));
  return { x: (k.w / 2) * cos + (k.h / 2) * sin, y: (k.w / 2) * sin + (k.h / 2) * cos };
}

/**
 * Where each key is drawn across the board. A split board's presets keep room for columns it may
 * not have — a 24-key board's halves sit three keys apart — so its right half is drawn closer,
 * a third of a key from the left one. Only the drawing moves: every distance the analysis measures is
 * within one hand, and each hand keeps its shape. A board whose hands meet, like a row-staggered
 * one, is drawn as it is.
 */
export function drawnX(keys: readonly GeometryKey[]): number[] {
  let leftEdge = Number.NEGATIVE_INFINITY;
  let rightEdge = Number.POSITIVE_INFINITY;
  for (const k of keys) {
    const r = reach(k).x;
    if (k.hand === 'L') leftEdge = Math.max(leftEdge, k.x + r);
    else rightEdge = Math.min(rightEdge, k.x - r);
  }
  const shift = rightEdge - leftEdge - SPLIT_GAP;
  if (!Number.isFinite(shift) || shift <= 0) return keys.map((k) => k.x);
  return keys.map((k) => (k.hand === 'R' ? k.x - shift : k.x));
}

/** A key being pressed takes the accent colour, whatever the heat map had it at. */
const PRESSED_FILL = 'color-mix(in oklab, var(--color-primary) 62%, var(--lb-key-bg))';

/**
 * From this heat on, a key's fill is too close to the accent colour for a coloured legend: below
 * it, every legend colour in either theme keeps 3:1 against the key; at it and above, and on a key
 * being pressed, the legends take the key's text colour, which keeps over 4:1 at full heat.
 */
const HOT_HEAT = 0.5;

/** Pixels per key unit, and the gap that separates neighbouring caps. */
const UNIT = 64;
const GAP = 6;
/**
 * Room around the drawing and between the halves of a split board, in key units. Across, every
 * bit of width is a bigger key on a phone, so the margin is a hair and the halves sit a third of a
 * key apart — still three times the gap between two keys, so the split reads. Down, arcs drawn
 * over the top row need the room.
 */
const MARGIN_X = 0.05;
const MARGIN_Y = 0.12;
const SPLIT_GAP = 0.3;
/** Inner margin of a cap, in the same units. */
const INSET = 5;
/** Height kept for the band along the bottom of a cap, and for the shifted legend above. */
const BAND = 12;
const TOP = 9;
const TAP_SIZES = [22, 19, 16, 14, 12, 10] as const;
const SMALL_SIZES = [10, 9, 8, 7] as const;

/** A layer's colour: the one it chose, or its place's; none for a base layer that chose none. */
export function layerColourAt(compiled: CompiledLayout, idx: number): string | undefined {
  return layerColourOf(idx, compiled.layers[idx]?.color);
}

function layerColour(compiled: CompiledLayout, layerId: string | null): string | undefined {
  if (layerId === null) return undefined;
  const idx = compiled.layerIndex.get(layerId);
  return idx === undefined ? undefined : layerColourAt(compiled, idx);
}

/** How a reach key is pressed to get to the layer shown, as its band and its name say it. */
const REACH_WORD: Record<ReachKey['how'], string> = {
  held: 'held',
  tapped: 'tapped',
  both: 'held/tapped',
};
const REACH_SPOKEN: Record<ReachKey['how'], string> = {
  held: 'held',
  tapped: 'tapped',
  both: 'held or tapped',
};

/** A key held or tapped to bring the shown layer on: how, and the whole of it in words. */
interface Reach {
  how: ReachKey['how'];
  text: string;
}

/** The reach keys of one layer, by position, with what each one says. */
function reachOf(compiled: CompiledLayout, layerIdx: number): Map<number, Reach> {
  const out = new Map<number, Reach>();
  for (const k of reachKeys(compiled, layerIdx)) {
    out.set(k.pos, { how: k.how, text: describeReach(compiled, layerIdx, k) });
  }
  return out;
}

/** Inset of the ring a reach key draws inside its cap. */
const REACH_INSET = 3;

/** Bindings whose meaning a cap cannot carry, however it is drawn. */
function needsDetail(b: Binding | undefined): boolean {
  switch (b?.kind) {
    case 'adaptive':
    case 'tap_dance':
    case 'mod_morph':
    case 'layer_morph':
    case 'raw':
      return true;
    case 'hold_tap':
    case 'lt':
      return needsDetail(b.tap);
    default:
      return false;
  }
}

/** The name a screen reader reads, kept to the legend itself; the full meaning is the description. */
function spokenLegend(l: Legend, tap: string): string {
  const hold = l.hold === null ? '' : l.holdIsMode ? ` (${l.hold})` : `, hold ${l.hold}`;
  return `${l.kind === 'trans' ? 'transparent' : tap || 'empty'}${hold}`;
}

interface ModelOptions {
  showHold: boolean;
  /** Give a number to each key whose legend cannot say everything. */
  numbered: boolean;
  heat?: Record<number, number>;
  highlighted?: Set<number>;
  pressed?: Set<number>;
  selected?: string | null;
  /** Other keys selected with it. */
  alsoSelected?: readonly string[];
  /** Top-left of the drawing, in key units; only the drawn board needs it. */
  origin?: { ox: number; oy: number };
  /** Where each key is drawn across, when that is not where the geometry puts it. */
  xs?: readonly number[];
  /** The keys held or tapped to reach the layer drawn. */
  reach?: Map<number, Reach>;
}

/** Everything drawn for each key of a layer: position, legends and how they fit, and its number. */
function modelKeys(compiled: CompiledLayout, layerIdx: number, opts: ModelOptions) {
  const activeLayer = compiled.layers[layerIdx];
  const origin = opts.origin ?? { ox: 0, oy: 0 };
  let numbered = 0;
  return compiled.keys.map((k, idx) => {
    const binding = activeLayer.bindings[idx];
    const l = legend(compiled, binding);
    const explicit = activeLayer.explicit[idx];
    // A key with no binding of its own on an upper layer takes the layer's default. A transparent
    // key is marked ▽ however it got that way: listed, by default, or held down to get here.
    const implicit = !explicit && layerIdx > 0;
    const reach = opts.reach?.get(idx) ?? null;
    const tap = implicit && l.kind !== 'trans' ? '' : l.tap;
    const w = k.w * UNIT - GAP;
    const h = k.h * UNIT - GAP;
    const hold = opts.showHold ? l.hold : null;
    // The band says how the key got here, unless the key needs it for a hold of its own.
    const reachWord = reach && opts.showHold && hold === null ? REACH_WORD[reach.how] : null;
    const band = hold ?? reachWord;
    const shifted = opts.showHold ? l.shifted : null;
    const tapFit: Fit = fitLabel(
      tap,
      w - 2 * INSET,
      h - 2 * INSET - (band ? BAND : 0) - (shifted ? TOP : 0),
      TAP_SIZES,
    );
    const holdFit = band ? fitLabel(band, w - 2 * INSET, BAND, SMALL_SIZES) : null;
    const shiftedFit = shifted ? fitLabel(shifted, w / 2, TOP, SMALL_SIZES) : null;
    const listed =
      opts.numbered &&
      !implicit &&
      (tapFit.overflow || !!holdFit?.overflow || needsDetail(binding));
    return {
      idx,
      key: k,
      cx: ((opts.xs?.[idx] ?? k.x) - origin.ox) * UNIT,
      cy: (k.y - origin.oy) * UNIT,
      w,
      h,
      legend: l,
      tap,
      tapFit,
      holdFit,
      shiftedFit,
      badge: opts.showHold && !implicit ? l.badge : null,
      colour: layerColour(compiled, l.layer),
      number: listed ? ++numbered : null,
      trans: l.kind === 'trans' || implicit,
      heat: opts.heat?.[idx] ?? 0,
      highlighted: opts.highlighted?.has(idx) ?? false,
      pressed: opts.pressed?.has(idx) ?? false,
      selected: opts.selected === k.id || (opts.alsoSelected?.includes(k.id) ?? false),
      reach,
      /** The band shows how the key reaches the layer, not a hold of its own. */
      reachBand: reachWord !== null,
    };
  });
}

type KeyModel = ReturnType<typeof modelKeys>[number];

export interface KeyboardProps {
  compiled: CompiledLayout;
  layer?: number;
  /** Position index to 0–1 heat. */
  heat?: Record<number, number>;
  /** Positions to outline, e.g. the keys of a selected n-gram. */
  highlight?: number[];
  /** Positions drawn as being pressed right now, such as a step of how a word is typed. */
  pressed?: number[];
  /** Combos to draw between their keys; only the ones a view wants shown. */
  combos?: KeyboardCombo[];
  /** Key id drawn as selected. */
  selected?: string | null;
  /** Other keys drawn as selected with it, when several are. */
  alsoSelected?: readonly string[];
  /** Position pairs to connect with an arrow. */
  arcs?: [number, number][];
  interactive?: boolean;
  showHold?: boolean;
  className?: string;
  id?: string;
  /**
   * A key picked. `add` is a pick that adds the key to the selection, or takes it out: with Shift,
   * Ctrl or ⌘ held, with Shift and Enter or Space, or a finger resting on the key and lifted.
   */
  onKeyClick?: (keyId: string, how?: { add: boolean }) => void;
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
  /**
   * Number the keys whose legend is cut short or cannot say everything, and list what each does
   * under the board. For the views where a reader works with the keys, not for previews.
   * `'separate'` numbers the keys but leaves the list to a `KeyLegend` the view places itself.
   */
  legendList?: boolean | 'separate';
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
  pressed = [],
  combos = [],
  selected = null,
  alsoSelected,
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
  legendList = false,
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
  const markerId = `lb-arrow-${(id ?? generatedId).replace(/[^\w-]/g, '')}`;
  const layerIdx = Math.min(layer, compiled.layers.length - 1);
  const highlighted = useMemo(() => new Set(highlight), [highlight]);
  const pressing = useMemo(() => new Set(pressed), [pressed]);

  const xs = useMemo(() => drawnX(compiled.keys), [compiled]);
  // The drawing is as wide as its keys reach, turned thumbs included, and a hair more.
  const view = useMemo(() => {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    compiled.keys.forEach((k, i) => {
      const r = reach(k);
      minX = Math.min(minX, xs[i] - r.x);
      maxX = Math.max(maxX, xs[i] + r.x);
      minY = Math.min(minY, k.y - r.y);
      maxY = Math.max(maxY, k.y + r.y);
    });
    if (!Number.isFinite(minX)) return { ox: 0, oy: 0, width: UNIT, height: UNIT, units: 1 };
    const units = maxX - minX + 2 * MARGIN_X;
    return {
      ox: minX - MARGIN_X,
      oy: minY - MARGIN_Y,
      width: units * UNIT,
      height: (maxY - minY + 2 * MARGIN_Y) * UNIT,
      units,
    };
  }, [compiled, xs]);

  const legendOf = useCallback(
    (keyId: string) => {
      const idx = compiled.keyIndex.get(keyId);
      if (idx === undefined) return keyId;
      const active = compiled.layers[Math.min(layer, compiled.layers.length - 1)];
      return legend(compiled, active.bindings[idx]).tap || keyId;
    },
    [compiled, layer],
  );

  const drag = useKeyDrag(onDropKey, {
    legendOf,
    onDragStart,
    onLongPress: onKeyClick ? (keyId) => onKeyClick(keyId, { add: true }) : undefined,
  });

  const reached = useMemo(() => reachOf(compiled, layerIdx), [compiled, layerIdx]);
  // The ring and the band word take the colour of the layer they lead to: this one.
  const shownColour = layerColourAt(compiled, layerIdx);
  const shownName = compiled.layers[layerIdx]?.name ?? '';

  const keys = modelKeys(compiled, layerIdx, {
    showHold,
    numbered: legendList !== false,
    heat,
    highlighted,
    pressed: pressing,
    selected,
    alsoSelected,
    origin: view,
    xs,
    reach: reached,
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
      onKeyClick?.(keyId, { add: e.shiftKey });
    }
  };

  const centerOf = (pos: number) => {
    const k = compiled.keys[pos];
    if (!k) return null;
    return { x: (xs[pos] - view.ox) * UNIT, y: (k.y - view.oy) * UNIT };
  };

  const listedKeys = keys.filter((k) => k.number !== null);

  const board = (
    <svg
      id={id}
      className={`lb-keyboard w-full h-auto select-none ${className ?? ''}`}
      viewBox={`0 0 ${fmt(view.width)} ${fmt(view.height)}`}
      // How many keys wide the drawing is, for a view that must keep them a finger's size.
      style={{ '--lb-board-units': view.units.toFixed(2) } as CSSProperties}
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
            <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: 'var(--lb-arc)' }} />
          </marker>
        </defs>
      )}

      {keys.map((k) => {
        const pct = Math.round(k.heat * 100);
        const reachSpoken = k.reach ? `, ${REACH_SPOKEN[k.reach.how]} to reach ${shownName}` : '';
        const label = `Key ${k.key.id}: ${spokenLegend(k.legend, k.tap)}${reachSpoken}`;
        const tapY = (k.holdFit ? -BAND / 2 : 0) + (k.shiftedFit ? TOP / 2 : 0) + 1;
        const hot = k.pressed || k.heat >= HOT_HEAT;
        // A hot key's legends are all drawn in its text colour (see `HOT_HEAT`), layer colour too.
        const tapColour = !hot && k.legend.layerIn === 'tap' ? k.colour : undefined;
        const holdColour = hot
          ? undefined
          : k.reachBand
            ? shownColour
            : k.legend.layerIn === 'hold'
              ? k.colour
              : undefined;
        const title = [k.legend.detail, k.reach?.text].filter(Boolean).join('; ');
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: it takes a button role and tab stop whenever it is interactive
          <g
            key={k.key.id}
            transform={`translate(${fmt(k.cx)} ${fmt(k.cy)}) rotate(${fmt(k.key.rotation)})`}
            className={[
              'lb-key',
              k.trans && 'lb-key-trans',
              k.key.thumb && 'lb-key-thumb',
              k.selected && 'lb-key-selected',
              hot && 'lb-key-hot',
            ]
              .filter(Boolean)
              .join(' ')}
            data-key={k.key.id}
            data-reach={k.reach?.how}
            ref={(el) => {
              nodes.current[k.key.id] = el;
            }}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? (k.key.id === tabStop ? 0 : -1) : undefined}
            aria-label={label}
            style={{ cursor: interactive ? 'pointer' : 'default' }}
            onClick={
              interactive
                ? (e) => {
                    if (draggable && drag.consumeClick()) return;
                    onKeyClick?.(k.key.id, { add: e.shiftKey || e.ctrlKey || e.metaKey });
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
              className={`lb-key-cap${k.highlighted ? ' lb-key-highlight' : ''}${
                k.pressed ? ' lb-key-pressed' : ''
              }`}
              style={{
                fill: k.pressed
                  ? PRESSED_FILL
                  : `color-mix(in oklab, var(--lb-key-bg) ${100 - pct}%, var(--lb-heat) ${pct}%)`,
              }}
            />
            {k.reach && (
              // Inside the cap rather than on its edge, which selection, focus and the outlines
              // of a played word already use; and in the layer's colour, as a key reaching it is.
              <rect
                x={fmt(-k.w / 2 + REACH_INSET)}
                y={fmt(-k.h / 2 + REACH_INSET)}
                width={fmt(k.w - 2 * REACH_INSET)}
                height={fmt(k.h - 2 * REACH_INSET)}
                rx="6"
                className="lb-key-reach"
                style={!hot && shownColour ? { stroke: shownColour } : undefined}
              />
            )}
            {title && <title>{title}</title>}
            {k.key.home && (
              // A bar along the bottom edge, clear of every legend, where a homing bump would be;
              // raised inside the ring on a reach key.
              <rect
                x="-5"
                y={fmt(k.h / 2 - 3.5 - (k.reach ? REACH_INSET : 0))}
                width="10"
                height="1.6"
                rx="0.8"
                className="lb-key-home"
              />
            )}
            {k.shiftedFit && (
              <text
                x="0"
                y={fmt(-k.h / 2 + INSET + 3)}
                textAnchor="middle"
                className="lb-key-shifted"
                fontSize={k.shiftedFit.size}
              >
                {k.shiftedFit.lines[0]}
              </text>
            )}
            {k.badge && (
              <text
                x={fmt(k.w / 2 - 4)}
                y={fmt(-k.h / 2 + INSET + 3)}
                textAnchor="end"
                className="lb-key-badge"
                fontSize="9"
              >
                {k.badge}
              </text>
            )}
            {k.number !== null && (
              <text
                x={fmt(-k.w / 2 + 4)}
                y={fmt(-k.h / 2 + INSET + 3)}
                textAnchor="start"
                className="lb-key-number"
                fontSize="9"
              >
                {legendNumber(k.number)}
              </text>
            )}
            <text
              x="0"
              y={fmt(tapY)}
              textAnchor="middle"
              className={`lb-key-tap lb-kind-${k.legend.kind}`}
              fontSize={k.tapFit.size}
              style={tapColour ? { fill: tapColour } : undefined}
            >
              {k.tapFit.lines.length === 1 ? (
                k.tapFit.lines[0]
              ) : (
                <>
                  <tspan x="0" dy={fmt(-k.tapFit.size * 0.55)}>
                    {k.tapFit.lines[0]}
                  </tspan>
                  <tspan x="0" dy={fmt(k.tapFit.size * 1.1)}>
                    {k.tapFit.lines[1]}
                  </tspan>
                </>
              )}
            </text>
            {k.holdFit && (
              <text
                x="0"
                y={fmt(k.h / 2 - INSET - BAND / 2 + 1)}
                textAnchor="middle"
                className={`lb-key-hold${
                  k.reachBand ? ' lb-key-reach-word' : k.legend.holdIsMode ? ' lb-key-mode' : ''
                }`}
                fontSize={k.holdFit.size}
                style={holdColour ? { fill: holdColour } : undefined}
              >
                {k.holdFit.lines[0]}
              </text>
            )}
          </g>
        );
      })}

      {/* Above the keys, but never in the way of a tap or a drag on them. */}
      {combos.length > 0 && (
        <g className="lb-combos">
          {combos.map((c) => {
            const points = c.keys.map(centerOf).filter((p) => p !== null);
            if (points.length === 0) return null;
            const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
            const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
            const width = Math.max(20, [...c.label].length * 7 + 12);
            const names = c.keys.map((p) => compiled.keys[p]?.id ?? '?').join(' + ');
            return (
              <g
                key={c.id}
                className={`lb-combo${c.active ? ' lb-combo-active' : ''}`}
                transform={`translate(${fmt(x)} ${fmt(y)})`}
              >
                <title>{`Combo ${names}: ${c.label}`}</title>
                <rect x={fmt(-width / 2)} y="-9" width={fmt(width)} height="18" rx="9" />
                <text y="4" textAnchor="middle" fontSize="11">
                  {c.label}
                </text>
              </g>
            );
          })}
        </g>
      )}

      <g className="lb-arc">
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
              style={{ stroke: 'var(--lb-arc)' }}
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

  const reachLines = reachLinesOf(keys);
  if (legendList !== true || (listedKeys.length === 0 && reachLines.length === 0)) return board;
  return (
    <>
      {board}
      <LegendList keys={listedKeys} reach={reachLines} colour={shownColour} />
    </>
  );
}

/** One line per way into the layer, naming the keys that take it. */
function reachLinesOf(keys: KeyModel[]): { text: string; ids: string[] }[] {
  const byText = new Map<string, string[]>();
  for (const k of keys) {
    if (!k.reach) continue;
    byText.set(k.reach.text, [...(byText.get(k.reach.text) ?? []), k.key.id]);
  }
  return [...byText].map(([text, ids]) => ({ text, ids }));
}

function LegendList({
  keys,
  reach,
  colour,
}: {
  keys: KeyModel[];
  reach: { text: string; ids: string[] }[];
  colour: string | undefined;
}) {
  return (
    <ol className="lb-legend-list" aria-label="Key legend">
      {keys.map((k) => (
        <li key={k.key.id}>
          <span className="lb-legend-number">{legendNumber(k.number as number)}</span>
          <span className="font-mono opacity-60">{k.key.id}</span>
          <span>{k.legend.detail}</span>
        </li>
      ))}
      {reach.map((r) => (
        <li key={r.text} className="lb-legend-reach">
          <span
            className="lb-legend-ring"
            aria-hidden="true"
            style={colour ? { borderColor: colour } : undefined}
          />
          <span className="font-mono opacity-60">{r.ids.join(' ')}</span>
          <span>{r.text}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The list of numbered keys for a board drawn with `legendList="separate"`, wherever the view
 * wants it. It numbers the keys the same way the board does, from the same inputs.
 */
export function KeyLegend({
  compiled,
  layer = 0,
  showHold = true,
}: {
  compiled: CompiledLayout;
  layer?: number;
  showHold?: boolean;
}) {
  const layerIdx = Math.min(layer, compiled.layers.length - 1);
  const keys = modelKeys(compiled, layerIdx, {
    showHold,
    numbered: true,
    reach: reachOf(compiled, layerIdx),
  });
  const listed = keys.filter((k) => k.number !== null);
  const reach = reachLinesOf(keys);
  return listed.length === 0 && reach.length === 0 ? null : (
    <LegendList keys={listed} reach={reach} colour={layerColourAt(compiled, layerIdx)} />
  );
}
