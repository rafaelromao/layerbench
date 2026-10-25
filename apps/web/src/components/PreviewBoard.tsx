import type { CompiledLayout } from '@layerbench/core';
import { useMemo } from 'react';
import { Board } from './Board.js';
import { KeyLegend, typingCombos } from './Keyboard.js';

export interface PreviewBoardProps {
  id: string;
  /** The layout as written, whose keys are drawn. */
  compiled: CompiledLayout;
  /**
   * The layout as the analysis types it, features left out, whose combos are drawn, as Analyze
   * draws them; the layout as written when absent. Kept the same object while it is the same
   * (memoized): a new one closes the combos dialog.
   */
  typed?: CompiledLayout | null;
  /** The layer drawn. */
  layer: number;
  /** The navigator's buttons and a swipe on the board turn to this layer. */
  onLayer: (idx: number) => void;
  /** The navigator's accessible name. */
  label?: string;
  /** Positions to outline. */
  highlight?: number[];
  /** Whether the list of the numbered keys goes under the board. */
  legend?: boolean;
}

/**
 * A layer drawn to be looked at, not edited: Analyze's board (`Board`), with no heat, nothing
 * selected and nothing to edit. Under it, unless `legend` is false, the list of the keys whose
 * legend cannot say everything, numbered on the board, which Analyze keeps in its Legend panel.
 */
export function PreviewBoard({
  id,
  compiled,
  typed,
  layer,
  onLayer,
  label,
  highlight,
  legend = true,
}: PreviewBoardProps) {
  const source = typed ?? compiled;
  const combos = useMemo(() => typingCombos(source, layer), [source, layer]);
  return (
    <div className="min-w-0">
      <Board
        id={id}
        compiled={compiled}
        typed={source}
        layer={layer}
        onLayer={onLayer}
        combos={combos}
        navLabel={label}
        interactive={false}
        highlight={highlight}
      />
      {legend && (
        <div className="mt-2 empty:hidden">
          <KeyLegend compiled={compiled} layer={layer} quiet />
        </div>
      )}
    </div>
  );
}
