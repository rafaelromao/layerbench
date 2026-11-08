import type { CompiledLayout } from '@layerbench/core';
import { memo, useMemo, useState } from 'react';
import { PreviewBoard } from '../../components/PreviewBoard.js';
import { effectiveHeat, HEAT_LABELS, type HeatSource, heatMap } from '../../engine/heat.js';
import type { HeatMode } from '../../url/params.js';

export interface LayerPreviewProps {
  id: string;
  compiled: CompiledLayout;
  /** The layout as it is ranked, features left out, whose combos are drawn. */
  typed?: CompiledLayout;
  /** The layout's name, for the navigator's accessible label. */
  name: string;
  /**
   * What the layout's heat is drawn from, as it was scored: missing while it is still being scored,
   * `null` if it could not be.
   */
  heat?: HeatSource | null;
  /** What the heat measures; `null` leaves the board plain. */
  heatMode?: HeatMode | null;
}

/**
 * One layer of a layout at a time, with the navigator Analyze has under it. A card showing only the
 * base layer said nothing about the symbols and numbers that decide whether a layout is livable.
 * Drawn again only when the layout moves: the Library redraws every card as each score comes in,
 * and a card's board does not change with its numbers. The heat is worked out here, for the layer
 * on show, against the busiest key of every layer, and again only when that layer or the mode moves.
 */
export const LayerPreview = memo(function LayerPreview({
  id,
  compiled,
  typed,
  name,
  heat,
  heatMode = null,
}: LayerPreviewProps) {
  const [chosen, setChosen] = useState(0);
  // A layer past the end, for a moment after the layout changes, is its base.
  const layer = chosen < compiled.layers.length ? chosen : 0;
  const on = heatMode !== null;
  const colours = useMemo(
    () => (heatMode !== null && heat ? heatMap(heat, heatMode, layer) : undefined),
    [heat, heatMode, layer],
  );
  // What is really drawn: a rule set without the rule the mode asks for draws usage.
  const drawn = heatMode !== null && heat ? HEAT_LABELS[effectiveHeat(heat, heatMode)] : undefined;
  return (
    <>
      <PreviewBoard
        id={`${id}-l${layer}`}
        compiled={compiled}
        typed={typed}
        layer={layer}
        onLayer={setChosen}
        label={`${name} layers`}
        heat={colours}
        heatName={drawn}
        // A card is a glance at the layout; Analyze lists what the numbered keys do.
        legend={false}
      />
      {on && (
        <HeatNote
          pending={heat === undefined}
          failed={heat === null}
          bare={colours !== undefined && Object.keys(colours).length === 0}
          drawn={drawn}
        />
      )}
    </>
  );
});

/** Why a board is plain while heat is on: not scored yet, never scored, or nothing on this layer. */
function HeatNote({
  pending,
  failed,
  bare,
  drawn,
}: {
  pending: boolean;
  failed: boolean;
  bare: boolean;
  drawn: string | undefined;
}) {
  const text = pending
    ? 'Heat appears once the layout is scored.'
    : failed
      ? 'No heat: the layout could not be scored.'
      : bare
        ? `Nothing on this layer is coloured by ${drawn}.`
        : null;
  return text && <p className="lb-heat-note text-xs opacity-60">{text}</p>;
}
