import type { CompiledLayout } from '@layerbench/core';
import { useMemo } from 'react';
import { CombosApart, moreCombos } from './CombosApart.js';
import { combosApart, Keyboard, typingCombos } from './Keyboard.js';
import { LayerNav, useLayerSwipe } from './LayerNav.js';

export interface PreviewBoardProps {
  id: string;
  compiled: CompiledLayout;
  /** The layer drawn. */
  layer: number;
  /** A swipe on the board turns to this layer. */
  onLayer: (idx: number) => void;
  /** Position index to 0–1 heat. */
  heat?: Record<number, number>;
  /** Positions to outline. */
  highlight?: number[];
  /** Draw what a hold does under what a tap does; the default is a preview of what is typed. */
  showHold?: boolean;
  className?: string;
}

/**
 * A layer drawn to be looked at, not edited: no hold legends, and the combos that type, as Analyze
 * draws them, so a letter only a combo types is seen too. A swipe on it turns to the next layer.
 */
export function PreviewBoard({
  id,
  compiled,
  layer,
  onLayer,
  heat,
  highlight,
  showHold = false,
  className,
}: PreviewBoardProps) {
  const swipe = useLayerSwipe(compiled.layers, layer, onLayer);
  return (
    <div className="min-w-0 overscroll-x-contain" {...swipe}>
      <Keyboard
        id={id}
        compiled={compiled}
        layer={layer}
        interactive={false}
        showHold={showHold}
        combos={typingCombos(compiled, layer)}
        heat={heat}
        highlight={highlight}
        className={className}
      />
    </div>
  );
}

export interface PreviewNavProps {
  /** The layout the board beside it draws, kept the same object while it is the same (memoized). */
  compiled: CompiledLayout;
  /** The layer the board shows. */
  layer: number;
  onSelect: (idx: number) => void;
  /** What the navigator is called, for a page that shows the layers of more than one layout. */
  label?: string;
  className?: string;
}

/**
 * The navigator under a preview board, with the combos the board does not draw beside it, behind a
 * button on a layer that has any. They share a line, and the button keeps its room on every layer
 * of a layout that has it anywhere, so the arrows stay where they were as the layers turn. A
 * preview edits nothing, so the dialog only draws them.
 */
export function PreviewNav({ compiled, layer, onSelect, label, className = '' }: PreviewNavProps) {
  const apart = useMemo(
    () => compiled.layers.map((_, i) => combosApart(compiled, typingCombos(compiled, i))),
    [compiled],
  );
  const most = Math.max(0, ...apart.map((c) => c.length));
  return (
    <div className={`flex min-w-0 items-center justify-center gap-2 ${className}`}>
      <LayerNav label={label} layers={compiled.layers} active={layer} onSelect={onSelect} />
      {most > 0 && (
        <span className="grid shrink-0 place-items-center">
          {/* As wide as the button's longest words, on a layer with it or without. */}
          <span aria-hidden="true" className="btn btn-xs btn-outline invisible [grid-area:1/1]">
            {moreCombos(most)}
          </span>
          <span className="[grid-area:1/1]">
            <CombosApart compiled={compiled} layer={layer} combos={apart[layer] ?? []} />
          </span>
        </span>
      )}
    </div>
  );
}
