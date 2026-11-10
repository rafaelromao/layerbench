import type { CompiledLayout } from '@layerbench/core';
import { type ReactNode, useMemo } from 'react';
import { formatShare } from '../engine/heat.js';
import { CombosApart } from './CombosApart.js';
import {
  combosApart,
  Keyboard,
  type KeyboardCombo,
  type KeyboardProps,
  typingCombos,
} from './Keyboard.js';
import { LayerNav, type LayerNavProps, useLayerSwipe } from './LayerNav.js';

export interface BoardProps extends Omit<KeyboardProps, 'layer' | 'combos' | 'legendList'> {
  /** The layer drawn. */
  layer: number;
  /** The navigator's buttons and a swipe on the board turn to this layer. */
  onLayer: (idx: number) => void;
  /**
   * The combos that type on the layer drawn (`typingCombos` of `typed`): the board draws those on
   * neighbouring keys, the Combos button beside the navigator the rest.
   */
  combos: KeyboardCombo[];
  /** The layout the combos come from, as the analysis types it, features left out. */
  typed: CompiledLayout;
  /** Whether the button lists the combos the board does not draw. */
  showApart?: boolean;
  /** The combos dialog opened. */
  onApartOpen?: () => void;
  /** Focus has nowhere to go back to once the combos dialog closes. */
  onApartLostFocus?: () => void;
  /** The navigator's accessible name. */
  navLabel?: string;
  onRename?: LayerNavProps['onRename'];
  /**
   * The part of the typing done on the layer drawn, 0–1, written left of the navigator. Null where
   * the board has heat but no share to write for now (not scored yet, or numbers of a layout since
   * edited); absent where the board has no heat.
   */
  layerShare?: number | null;
  /** On the left of a row under the navigator. */
  tools?: ReactNode;
  /** On the right of that row. */
  toolsEnd?: ReactNode;
}

/**
 * The board as every page draws it: the keys, then a row with the layer navigator centred under
 * them and, at its right end, the Combos button for the combos the board does not draw. Analyze
 * adds a row of its heat and undo under that, and its editing;
 * a Library card, Compare and an import preview draw it with nothing more, so the keys, the combos
 * and the navigator look the same on every page. On a touch screen a wide board keeps its keys at
 * least 28px wide and pans inside its own box.
 */
export function Board({
  compiled,
  layer,
  onLayer,
  combos,
  typed,
  showApart = true,
  onApartOpen,
  onApartLostFocus,
  navLabel,
  onRename,
  tools,
  toolsEnd,
  layerShare,
  onComboClick,
  draggable = false,
  ...keyboard
}: BoardProps) {
  const swipe = useLayerSwipe(compiled.layers, layer, onLayer, draggable);
  // The board places the same list on the same keys, so the two agree on which it leaves out.
  const apart = useMemo(
    () => (showApart ? combosApart(typed, combos) : []),
    [typed, combos, showApart],
  );
  // Whether the Combos button appears on any layer: a side that holds nothing on every layer gives
  // its room to the name, and one that holds something on some layer keeps it on all of them.
  const anyApart = useMemo(
    () =>
      showApart &&
      typed.layers.some((l) => combosApart(typed, typingCombos(typed, l.idx)).length > 0),
    [typed, showApart],
  );
  const sides = layerShare !== undefined || anyApart;
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="lb-board relative" {...swipe}>
        {/* The board pans inside its own box on a narrow screen. */}
        <div className="lb-board-scroll">
          <Keyboard
            {...keyboard}
            compiled={compiled}
            layer={layer}
            legendList="separate"
            combos={combos}
            onComboClick={onComboClick}
            draggable={draggable}
          />
        </div>
      </div>

      {/* The navigator in the middle column, centred under the board whatever is beside it; the
          share of the typing on the layer, with heat on, in the left one; the button in the right
          one, always mounted: unmounted, an open dialog would vanish without closing, and focus
          would not come back to the board. While anything can be beside the navigator, both sides
          keep room for the button (4.75rem) on every layer, whether this one has it or not, so on a
          narrow screen the middle gives way to the screen alone: the button never covers an arrow,
          and the arrows stay put as the layers turn. With nothing beside it, the name has the row. */}
      <div
        className={`grid min-w-0 items-center gap-2 ${
          sides
            ? 'grid-cols-[minmax(4.75rem,1fr)_minmax(0,auto)_minmax(4.75rem,1fr)]'
            : 'grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)]'
        }`}
      >
        {typeof layerShare === 'number' && (
          // Not a live region: the counter already speaks as the layer turns, and the two would talk
          // over each other on every step and every frame of a word played.
          <span
            className="col-start-1 row-start-1 flex flex-col justify-self-start leading-tight tabular-nums opacity-70"
            data-testid="layer-share"
            title="Share of key presses made on this layer"
          >
            <span className="sr-only">Share of key presses on this layer: </span>
            <span className="text-xs" data-share-value>
              {formatShare(layerShare)}
            </span>
            <span className="text-[10px]" aria-hidden="true">
              of presses
            </span>
          </span>
        )}
        <LayerNav
          className="col-start-2 row-start-1 min-w-0 justify-center"
          label={navLabel}
          layers={compiled.layers}
          active={layer}
          onSelect={onLayer}
          onRename={onRename}
        />
        <div className="col-start-3 row-start-1 flex justify-end">
          <CombosApart
            compiled={typed}
            layer={layer}
            combos={apart}
            onOpen={onApartOpen}
            onLostFocus={onApartLostFocus}
            onComboClick={onComboClick}
          />
        </div>
      </div>

      {(tools || toolsEnd) && (
        <div className="lb-board-tools flex flex-wrap items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">{tools}</div>
          {toolsEnd}
        </div>
      )}
    </div>
  );
}
