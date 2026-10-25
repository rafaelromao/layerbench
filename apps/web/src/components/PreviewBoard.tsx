import type { CompiledLayout } from '@layerbench/core';
import { useMemo } from 'react';
import { Board } from './Board.js';
import { combosApart, KeyLegend, typingCombos } from './Keyboard.js';

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
}

/**
 * A layer drawn to be looked at, not edited: Analyze's board (`Board`), with no heat, nothing
 * selected and nothing to edit. Under it, the list of the keys whose legend cannot say everything,
 * numbered on the board, which Analyze keeps in its Legend panel.
 */
export function PreviewBoard({
  id,
  compiled,
  typed,
  layer,
  onLayer,
  label,
  highlight,
}: PreviewBoardProps) {
  const source = typed ?? compiled;
  const combos = useMemo(() => typingCombos(source, layer), [source, layer]);
  // The most combos apart on any layer, so the button keeps its room as the layers turn.
  const room = useMemo(
    () =>
      Math.max(
        0,
        ...source.layers.map((_, i) => combosApart(source, typingCombos(source, i)).length),
      ),
    [source],
  );
  return (
    <div className="min-w-0">
      <Board
        id={id}
        compiled={compiled}
        typed={source}
        layer={layer}
        onLayer={onLayer}
        combos={combos}
        apartRoom={room}
        navLabel={label}
        interactive={false}
        highlight={highlight}
      />
      <div className="mt-2 empty:hidden">
        <KeyLegend compiled={compiled} layer={layer} quiet />
      </div>
    </div>
  );
}
