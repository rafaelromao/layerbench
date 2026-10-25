import type { CompiledLayout } from '@layerbench/core';
import { type ReactNode, useMemo } from 'react';
import { CombosApart } from './CombosApart.js';
import { combosApart, Keyboard, type KeyboardCombo, type KeyboardProps } from './Keyboard.js';
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
          button in the right one, always mounted: unmounted, an open dialog would vanish without
          closing, and focus would not come back to the board. */}
      <div className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-2">
        <LayerNav
          className="col-start-2 min-w-0 justify-center"
          label={navLabel}
          layers={compiled.layers}
          active={layer}
          onSelect={onLayer}
          onRename={onRename}
        />
        <div className="col-start-3 flex min-w-0 justify-end">
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
