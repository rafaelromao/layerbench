import type { CompiledLayout } from '@layerbench/core';
import { Keyboard, typingCombos } from './Keyboard.js';
import { useLayerSwipe } from './LayerNav.js';

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
        showHold={false}
        combos={typingCombos(compiled, layer)}
        heat={heat}
        highlight={highlight}
        className={className}
      />
    </div>
  );
}
