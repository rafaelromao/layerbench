import type { CompiledLayout } from '@layerbench/core';
import { memo, useState } from 'react';
import { LayerNav } from '../../components/LayerNav.js';
import { PreviewBoard } from '../../components/PreviewBoard.js';

export interface LayerPreviewProps {
  id: string;
  compiled: CompiledLayout;
  /** The layout as it is ranked, features left out, whose combos are drawn. */
  typed?: CompiledLayout;
  /** The layout's name, for the navigator's accessible label. */
  name: string;
}

/**
 * One layer of a layout at a time, with the navigator Analyze has under it. A card showing only the
 * base layer said nothing about the symbols and numbers that decide whether a layout is livable.
 * Drawn again only when the layout moves: the Library redraws every card as each score comes in,
 * and a card's board does not change with its numbers.
 */
export const LayerPreview = memo(function LayerPreview({
  id,
  compiled,
  typed,
  name,
}: LayerPreviewProps) {
  const [chosen, setChosen] = useState(0);
  // A layer past the end, for a moment after the layout changes, is its base.
  const layer = chosen < compiled.layers.length ? chosen : 0;
  return (
    <div className="min-w-0">
      <PreviewBoard
        id={`${id}-l${layer}`}
        compiled={compiled}
        typed={typed}
        layer={layer}
        onLayer={setChosen}
        className="opacity-90"
      />
      <LayerNav
        label={`${name} layers`}
        layers={compiled.layers}
        active={layer}
        onSelect={setChosen}
        className="mt-1 justify-center"
      />
    </div>
  );
});
