import type { CompiledLayout } from '@layerbench/core';
import { useMemo } from 'react';
import { CombosApart, moreCombos } from './CombosApart.js';
import { combosApart, Keyboard, KeyLegend, typingCombos } from './Keyboard.js';
import { LayerNav, useLayerSwipe } from './LayerNav.js';

export interface PreviewBoardProps {
  id: string;
  /** The layout as written, whose keys are drawn. */
  compiled: CompiledLayout;
  /**
   * The layout as the analysis types it, features left out, whose combos are drawn, as Analyze
   * draws them; the layout as written when absent.
   */
  typed?: CompiledLayout | null;
  /** The layer drawn. */
  layer: number;
  /** The navigator's buttons and a swipe on the board turn to this layer. */
  onLayer: (idx: number) => void;
  /** The navigator's accessible name. */
  label?: string;
  /** Position index to 0–1 heat. */
  heat?: Record<number, number>;
  /** Positions to outline. */
  highlight?: number[];
  className?: string;
}

/**
 * A layer drawn to be looked at, not edited, every key as Analyze draws it: its tap, what a hold
 * does, its shifted legend and its mark, and the combos that type, so a letter only a combo types
 * is seen too. Under it, as on Analyze, the layer navigator, then the list of the keys whose legend
 * cannot say everything, numbered on the board. The navigator stays right under the board whatever
 * the list's length; beside it, the combos the board does not draw (`PreviewNav`). A swipe on the
 * board turns to the next layer.
 */
export function PreviewBoard({
  id,
  compiled,
  typed,
  layer,
  onLayer,
  label,
  heat,
  highlight,
  className,
}: PreviewBoardProps) {
  const swipe = useLayerSwipe(compiled.layers, layer, onLayer);
  return (
    <div className="min-w-0">
      <div className="min-w-0 overscroll-x-contain" {...swipe}>
        <Keyboard
          id={id}
          compiled={compiled}
          layer={layer}
          interactive={false}
          legendList="separate"
          combos={typingCombos(typed ?? compiled, layer)}
          heat={heat}
          highlight={highlight}
          className={className}
        />
      </div>
      <PreviewNav
        label={label}
        compiled={compiled}
        typed={typed}
        layer={layer}
        onSelect={onLayer}
        className="mt-1"
      />
      <div className="mt-2 empty:hidden">
        <KeyLegend compiled={compiled} layer={layer} quiet />
      </div>
    </div>
  );
}

export interface PreviewNavProps {
  /** The layout as written, whose layers are stepped through. */
  compiled: CompiledLayout;
  /**
   * The layout whose combos the board draws, kept the same object while it is the same (memoized):
   * a new one closes the dialog. The layout as written when absent.
   */
  typed?: CompiledLayout | null;
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
function PreviewNav({ compiled, typed, layer, onSelect, label, className = '' }: PreviewNavProps) {
  const source = typed ?? compiled;
  const apart = useMemo(
    () => source.layers.map((_, i) => combosApart(source, typingCombos(source, i))),
    [source],
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
            <CombosApart compiled={source} layer={layer} combos={apart[layer] ?? []} />
          </span>
        </span>
      )}
    </div>
  );
}
