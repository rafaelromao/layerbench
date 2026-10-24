import type { CompiledLayout } from '@layerbench/core';
import { Keyboard, KeyLegend, typingCombos } from './Keyboard.js';
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
 * the list's length. A swipe on the board turns to the next layer.
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
      <LayerNav
        label={label}
        layers={compiled.layers}
        active={layer}
        onSelect={onLayer}
        className="mt-1 justify-center"
      />
      <div className="mt-2 empty:hidden">
        <KeyLegend compiled={compiled} layer={layer} quiet />
      </div>
    </div>
  );
}
