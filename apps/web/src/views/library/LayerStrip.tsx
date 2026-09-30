import type { CompiledLayout } from '@layoutmaster/core';
import { useRef, useState } from 'react';
import { Keyboard } from '../../components/Keyboard.js';

/** Matches the board's own palette: the base layer keeps the text colour, the rest cycle. */
const LAYER_COLOURS = 7;

function captionColour(idx: number): string | undefined {
  return idx === 0 ? undefined : `var(--lm-layer-${((idx - 1) % LAYER_COLOURS) + 1})`;
}

export interface LayerStripProps {
  id: string;
  compiled: CompiledLayout;
  /** The layout's name, for the region's accessible label. */
  name: string;
  className?: string;
}

/**
 * Every layer of a layout, side by side, one per card width. A finger or a trackpad swipes through
 * them and snaps on each; a mouse has the arrows. A card showing only the base layer said nothing
 * about the symbols and numbers that decide whether a layout is livable.
 */
export function LayerStrip({ id, compiled, name, className }: LayerStripProps) {
  const strip = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState(0);
  const layers = compiled.layers;
  const many = layers.length > 1;

  const step = (delta: number) => {
    const el = strip.current;
    if (!el) return;
    el.scrollBy({ left: delta * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <div className={`min-w-0 ${className ?? ''}`}>
      <section
        ref={strip}
        aria-label={`${name} layers`}
        // Focusable so arrow keys scroll it, the way they scroll any overflowing box.
        tabIndex={many ? 0 : undefined}
        className="flex min-w-0 snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.clientWidth > 0) setCurrent(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {layers.map((layer) => (
          // daisyUI lays out a figure inside a card as a row; the caption goes under the board.
          <figure key={layer.id} className="m-0 flex w-full shrink-0 snap-center flex-col">
            <Keyboard
              id={`${id}-l${layer.idx}`}
              compiled={compiled}
              layer={layer.idx}
              interactive={false}
              showHold={false}
              className="opacity-90"
            />
            {many && (
              <figcaption
                className="text-center text-xs opacity-80"
                style={{ color: captionColour(layer.idx) }}
              >
                {layer.name}
              </figcaption>
            )}
          </figure>
        ))}
      </section>
      {many && (
        <div className="mt-1 flex items-center justify-center gap-2">
          <button
            type="button"
            aria-label="Previous layer"
            className="btn btn-ghost btn-xs"
            disabled={current <= 0}
            onClick={() => step(-1)}
          >
            ‹
          </button>
          <span className="text-xs tabular-nums opacity-60" aria-live="polite">
            {Math.min(current, layers.length - 1) + 1} / {layers.length}
          </span>
          <button
            type="button"
            aria-label="Next layer"
            className="btn btn-ghost btn-xs"
            disabled={current >= layers.length - 1}
            onClick={() => step(1)}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
