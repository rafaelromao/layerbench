import type { CompiledLayout } from '@layerbench/core';
import { type ReactNode, useMemo } from 'react';
import { CombosApart, moreCombos } from './CombosApart.js';
import { combosApart, Keyboard, type KeyboardCombo, type KeyboardProps } from './Keyboard.js';
import { LayerNav, type LayerNavProps, useLayerSwipe } from './LayerNav.js';

export interface BoardProps extends Omit<KeyboardProps, 'layer' | 'combos' | 'legendList'> {
  /** The layer drawn. */
  layer: number;
  /** The navigator's buttons and a swipe on the board turn to this layer. */
  onLayer: (idx: number) => void;
  /**
   * The combos that type on the layer drawn (`typingCombos` of `typed`): the board draws those on
   * neighbouring keys, the button under it the rest.
   */
  combos: KeyboardCombo[];
  /** The layout the combos come from, as the analysis types it, features left out. */
  typed: CompiledLayout;
  /** Whether the button lists the combos the board does not draw. */
  showApart?: boolean;
  /** The most combos apart on any layer: the button keeps that room as the layers turn. */
  apartRoom?: number;
  /** The combos dialog opened. */
  onApartOpen?: () => void;
  /** Focus has nowhere to go back to once the combos dialog closes. */
  onApartLostFocus?: () => void;
  /** The navigator's accessible name. */
  navLabel?: string;
  onRename?: LayerNavProps['onRename'];
  /** On the left of the row under the navigator, before the combos button. */
  tools?: ReactNode;
  /** After the combos button. */
  toolsAfter?: ReactNode;
  /** On the right of that row. */
  toolsEnd?: ReactNode;
}

/**
 * The board as every page draws it: the keys, the layer navigator centred under them, then a row
 * with the button for the combos the board does not draw. Analyze adds its heat, undo and editing;
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
  apartRoom = 0,
  onApartOpen,
  onApartLostFocus,
  navLabel,
  onRename,
  tools,
  toolsAfter,
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
  const room = Math.max(apartRoom, apart.length);
  const button = (
    <CombosApart
      compiled={typed}
      layer={layer}
      combos={apart}
      onOpen={onApartOpen}
      onLostFocus={onApartLostFocus}
      onComboClick={onComboClick}
    />
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

      <LayerNav
        className="min-w-0 justify-center"
        label={navLabel}
        layers={compiled.layers}
        active={layer}
        onSelect={onLayer}
        onRename={onRename}
      />

      {/* Always there, hidden while it has nothing, so the combos button is never unmounted. */}
      <div
        className={`lb-board-tools flex flex-wrap items-center justify-between gap-2 min-w-0 ${
          tools || toolsAfter || toolsEnd || room > 0 ? '' : 'hidden'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {tools}
          {/* The button stays at one place in the tree as its count changes: unmounted, an open
                dialog would vanish without closing, and focus would not come back to the board. */}
          <span className="grid shrink-0 place-items-center">
            {room > 0 && (
              // As wide as the button's longest words, on a layer with it or without.
              <span aria-hidden="true" className="btn btn-xs btn-outline invisible [grid-area:1/1]">
                {moreCombos(room)}
              </span>
            )}
            <span className="[grid-area:1/1]">{button}</span>
          </span>
          {toolsAfter}
        </div>
        {toolsEnd}
      </div>
    </div>
  );
}
