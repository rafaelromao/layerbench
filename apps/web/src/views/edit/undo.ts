import { type CompiledLayout, compileLayout, type Layout } from '@layoutmaster/core';
import { type EditAction, type EditState, initialState } from './reducer.js';

/**
 * Undo, as a wrapper over the editor's reducer rather than a case in each of its actions: anything
 * that lands a new layout is undoable, and nothing else has to know that undo exists.
 *
 * Editing in place made this necessary rather than nice. Typing on a key, pressing Delete on one,
 * and dropping a copy over another all destroy what was there in a single gesture, with no dialog
 * in the way — which is the right feel only if the way back is one keystroke too.
 */
export type UndoAction = EditAction | { type: 'undo' } | { type: 'redo' };

/** The layout and where the user was in it. The compiled form is rebuilt, never stored. */
type Snapshot = Pick<EditState, 'layout' | 'layer' | 'selected'>;

export interface UndoState extends EditState {
  past: Snapshot[];
  future: Snapshot[];
}

const LIMIT = 50;

export function initialUndoState(layout: Layout, compiled: CompiledLayout, layer = 0): UndoState {
  return { ...initialState(layout, compiled, layer), past: [], future: [] };
}

function snapshot(state: EditState): Snapshot {
  return { layout: state.layout, layer: state.layer, selected: state.selected };
}

function restore(
  state: UndoState,
  snap: Snapshot,
  past: Snapshot[],
  future: Snapshot[],
): UndoState {
  let compiled: CompiledLayout;
  try {
    compiled = compileLayout(snap.layout);
  } catch {
    // A snapshot only exists because it compiled once; if that ever stops holding, stay put.
    return state;
  }
  return {
    ...state,
    layout: snap.layout,
    compiled,
    layer: Math.min(snap.layer, compiled.layers.length - 1),
    selected: snap.selected,
    swapFrom: null,
    focusRequest: null,
    error: null,
    lastSwap: null,
    behaviorsJson: JSON.stringify(snap.layout.behaviors ?? {}, null, 2),
    past,
    future,
  };
}

export function undoable(
  reducer: (state: EditState, action: EditAction) => EditState,
): (state: UndoState, action: UndoAction) => UndoState {
  return (state, action) => {
    if (action.type === 'undo') {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return restore(state, previous, state.past.slice(0, -1), [snapshot(state), ...state.future]);
    }
    if (action.type === 'redo') {
      const next = state.future[0];
      if (!next) return state;
      return restore(
        state,
        next,
        [...state.past, snapshot(state)].slice(-LIMIT),
        state.future.slice(1),
      );
    }

    const next = reducer(state, action) as UndoState;
    if (next === state) return state;
    // Selecting a key or switching a panel is not something to undo.
    if (next.layout === state.layout) return { ...next, past: state.past, future: state.future };
    return { ...next, past: [...state.past, snapshot(state)].slice(-LIMIT), future: [] };
  };
}
