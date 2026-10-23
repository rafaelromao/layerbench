import type { CompiledLayout } from '@layerbench/core';
import { Keyboard, typingCombos } from './Keyboard.js';
import { useLayerSwipe } from './LayerNav.js';

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
  /** A swipe on the board turns to this layer. */
  onLayer: (idx: number) => void;
  /** Position index to 0–1 heat. */
  heat?: Record<number, number>;
  /** Positions to outline. */
  highlight?: number[];
  className?: string;
}

/**
 * A layer drawn to be looked at, not edited, every key as Analyze draws it: its tap, what a hold
 * does, its shifted legend and its mark, and the combos that type, so a letter only a combo types
 * is seen too. A key whose legend cannot say everything is numbered, as there, and listed under
 * the board. A swipe on it turns to the next layer.
 */
export function PreviewBoard({
  id,
  compiled,
  typed,
  layer,
  onLayer,
  heat,
  highlight,
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
        legendList
        combos={typingCombos(typed ?? compiled, layer)}
        heat={heat}
        highlight={highlight}
        className={className}
      />
    </div>
  );
}
