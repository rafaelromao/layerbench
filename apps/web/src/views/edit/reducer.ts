import {
  applyEdit,
  type CompiledLayout,
  type Edit,
  type EditOutcome,
  type Layout,
} from '@layerbench/core';
import type { DropTarget } from '../../components/use-key-drag.js';

export type Panel = 'layers' | 'features' | 'geometry' | 'combos' | 'behaviors' | 'paths' | 'json';

/**
 * A request to put the caret in the key inspector's text line: a character typed on a key starts
 * its binding with that character, Enter on a key offers the whole binding for replacing. Each
 * request is a new object, which is what tells the text line to take focus again.
 */
export interface FocusRequest {
  keyId: string;
  seed: string | null;
}

export interface EditState {
  layout: Layout;
  compiled: CompiledLayout;
  /** Layer being edited. Independent of the layer shown on the Analyze view. */
  layer: number;
  selected: string | null;
  /**
   * The other keys selected with `selected`, added with Shift or a long press: what the actions for
   * several keys act on, together. Empty when one key, or none, is selected.
   */
  also: string[];
  /** Key the user armed for a click-to-swap, if any. */
  swapFrom: string | null;
  /** What the armed key does when its partner is picked. */
  swapMode: 'swap' | 'copy';
  /** The layout differs from `saved`, so closing the tab would lose it. */
  dirty: boolean;
  /**
   * The layout as it was opened or last saved. Undo can come back to it, which is no longer an
   * unsaved change, and an edit made while a save was on its way is still one. Null for edits that
   * are unsaved from the start, brought back from Analyze, until they are saved.
   */
  saved: Layout | null;
  panel: Panel;
  error: string | null;
  behaviorsJson: string;
  behaviorsError: string | null;
  jsonText: string;
  jsonError: string | null;
  /**
   * The last edit and how it went, with the layout it was made on: what the view tells of it, and
   * for a swap, what it asks an instant estimate of (only a report of that layout can be re-scored
   * into one of this).
   */
  lastEdit: LastEdit | null;
  /** Where typing on the board should land next, if a key was typed on. */
  focusRequest: FocusRequest | null;
  /** Keys picked on the board for a new combo, or null when not picking. */
  comboPick: string[] | null;
  /** The combo, by place, whose keys are being picked again; null when the pick is for a new one. */
  comboPickFor: number | null;
  /** Keys to outline, so a combo can point at the keys it is made of. */
  boardHighlight: string[];
}

/** The last edit made and how it went, with what to tell a screen reader once it has landed. */
export type LastEdit = Exclude<EditOutcome, { status: 'unchanged' }> & { say?: string };

export type EditAction =
  | { type: 'selectLayer'; layer: number }
  | { type: 'keyClick'; keyId: string }
  /** Add a key to the selection, or take it out: Shift with a click, or a long press. */
  | { type: 'toggleSelect'; keyId: string }
  | { type: 'startSwap'; mode?: 'swap' | 'copy' }
  | { type: 'cancelSwap' }
  | { type: 'typeOnKey'; keyId: string; seed: string | null }
  | { type: 'deselect' }
  /** A key dragged onto another key or onto a layer tab: swapped, copied or sent there. */
  | { type: 'dropKey'; from: string; to: DropTarget; mode: 'swap' | 'copy'; say?: string }
  /** With `combo`, the keys picked are the new keys of that combo rather than a new combo's. */
  | { type: 'comboPickStart'; combo?: number }
  | { type: 'comboPickToggle'; keyId: string }
  | { type: 'comboPickCancel' }
  | { type: 'setBoardHighlight'; keys: string[] }
  | { type: 'behaviorsChange'; json: string }
  | { type: 'jsonChange'; text: string }
  | { type: 'setPanel'; panel: Panel }
  | { type: 'saved'; layout: Layout }
  /** A change to the layout, and what to tell a screen reader once it has landed. */
  | { type: 'edit'; edit: Edit; say?: string };

function behaviorsText(layout: Layout): string {
  return JSON.stringify(layout.behaviors ?? {}, null, 2);
}

export function initialState(layout: Layout, compiled: CompiledLayout, layer = 0): EditState {
  return {
    layout,
    compiled,
    layer: Math.min(layer, compiled.layers.length - 1),
    selected: null,
    also: [],
    swapFrom: null,
    swapMode: 'swap',
    dirty: false,
    saved: layout,
    panel: 'layers',
    error: null,
    behaviorsJson: behaviorsText(layout),
    behaviorsError: null,
    jsonText: '',
    jsonError: null,
    lastEdit: null,
    focusRequest: null,
    comboPick: null,
    comboPickFor: null,
    boardHighlight: [],
  };
}

/** The id of the layer on screen, which the edits made on the board are made on. */
export function shownLayer(state: Pick<EditState, 'layout' | 'layer'>): string {
  return state.layout.layers[state.layer]?.id ?? state.layout.layers[0].id;
}

/** Every key selected: the one in the inspector first, then the others in the order they came. */
export function selectionOf(state: Pick<EditState, 'selected' | 'also'>): string[] {
  return state.selected === null ? [] : [state.selected, ...state.also];
}

/** Where a refused edit says why: beside the text it came from, or above the board. */
export function refusalShownIn(edit: Edit): 'error' | 'behaviorsError' | 'jsonError' {
  if (edit.kind === 'replaceBehaviors') return 'behaviorsError';
  if (edit.kind === 'replaceLayout') return 'jsonError';
  return 'error';
}

/**
 * Adopt how an edit went. One policy for every edit: the board shows the layer it landed on, or
 * keeps the layer it showed (the one before it, if that one went); the keys it landed on become
 * the selection, or the selection stays. A refused edit leaves the layout as it was and says why,
 * so the editor never lands in a state it cannot draw.
 */
function land(state: EditState, outcome: EditOutcome, say?: string): EditState {
  if (outcome.status === 'unchanged') return state;
  if (outcome.status === 'refused') {
    return {
      ...state,
      [refusalShownIn(outcome.edit)]: outcome.message,
      lastEdit: outcome,
    };
  }
  const { layout, compiled, at, edit } = outcome;
  const followed = compiled.layerIndex.get(at.layer ?? shownLayer(state));
  const keys = at.keys ?? selectionOf(state);
  // Re-rendering the behaviours buffer on every edit would throw away whatever is half-typed in
  // it, so it is only refreshed when the behaviours themselves moved.
  const behaviorsMoved =
    JSON.stringify(layout.behaviors ?? {}) !== JSON.stringify(state.layout.behaviors ?? {});
  return {
    ...state,
    layout,
    compiled,
    layer: Math.min(followed ?? Math.max(0, state.layer - 1), compiled.layers.length - 1),
    selected: keys[0] ?? null,
    also: keys.slice(1),
    dirty: true,
    error: null,
    focusRequest: null,
    // An edit that lands ends a swap waiting for its partner and a combo being picked.
    swapFrom: null,
    comboPick: null,
    comboPickFor: null,
    ...(behaviorsMoved ? { behaviorsJson: behaviorsText(layout) } : {}),
    ...(edit.kind === 'replaceBehaviors' ? { behaviorsError: null } : {}),
    ...(edit.kind === 'replaceLayout' ? { jsonError: null } : {}),
    lastEdit: say === undefined ? outcome : { ...outcome, say },
  };
}

function make(state: EditState, edit: Edit, say?: string): EditState {
  return land(state, applyEdit(state.layout, edit), say);
}

/**
 * The edit a drop makes: onto a key, a swap or a copy; onto a layer tab, the key sent there — with
 * the rest of the selection, when it was one of several selected.
 */
function dropped(
  state: EditState,
  { from, to, mode }: { from: string; to: DropTarget; mode: 'swap' | 'copy' },
): Edit {
  const layer = shownLayer(state);
  if (to.kind === 'key') return { kind: mode, layer, from, to: to.keyId };
  const keys = selectionOf(state);
  return {
    kind: 'send',
    layer,
    toLayer: to.layerId,
    keys: keys.length > 1 && keys.includes(from) ? keys : [from],
    mode: mode === 'copy' ? 'copy' : 'move',
  };
}

export function editReducer(state: EditState, action: EditAction): EditState {
  const next = reduce(state, action);
  // No key in the inspector, no keys beside it.
  return next.selected === null && next.also.length > 0 ? { ...next, also: [] } : next;
}

function reduce(state: EditState, action: EditAction): EditState {
  switch (action.type) {
    case 'edit':
      return make(state, action.edit, action.say);

    case 'selectLayer':
      // The selection stays: the same key on another layer is usually the next thing to look at.
      return {
        ...state,
        layer: action.layer,
        swapFrom: null,
        focusRequest: null,
        error: null,
      };

    case 'keyClick': {
      // A stale compile error belongs to the edit that failed, not to the next key clicked.
      if (!state.swapFrom) {
        return { ...state, selected: action.keyId, also: [], focusRequest: null, error: null };
      }
      if (state.swapFrom === action.keyId) return { ...state, swapFrom: null };
      // Arming a key and then tapping its partner is what a drag is, for anyone not holding a
      // mouse — so it has to reach copying too, not only swapping.
      const armed = { ...state, swapFrom: null };
      return make(
        armed,
        dropped(armed, {
          from: state.swapFrom,
          to: { kind: 'key', keyId: action.keyId },
          mode: state.swapMode,
        }),
      );
    }

    case 'toggleSelect': {
      // With a swap waiting for its partner, the key picked is that partner, as a click is.
      if (state.swapFrom) return reduce(state, { type: 'keyClick', keyId: action.keyId });
      const keys = selectionOf(state);
      const next = keys.includes(action.keyId)
        ? keys.filter((k) => k !== action.keyId)
        : [...keys, action.keyId];
      return {
        ...state,
        selected: next[0] ?? null,
        also: next.slice(1),
        focusRequest: null,
        error: null,
      };
    }

    case 'startSwap':
      return state.selected
        ? { ...state, swapFrom: state.selected, swapMode: action.mode ?? 'swap' }
        : state;

    case 'cancelSwap':
      return { ...state, swapFrom: null };

    case 'typeOnKey':
      return {
        ...state,
        selected: action.keyId,
        also: [],
        swapFrom: null,
        error: null,
        focusRequest: { keyId: action.keyId, seed: action.seed },
      };

    case 'deselect':
      return state.selected === null && state.swapFrom === null
        ? state
        : { ...state, selected: null, also: [], swapFrom: null, focusRequest: null };

    case 'dropKey':
      return make(state, dropped(state, action), action.say);

    case 'comboPickStart':
      return {
        ...state,
        comboPick: [],
        comboPickFor: action.combo ?? null,
        focusRequest: null,
        selected: null,
        swapFrom: null,
      };

    case 'comboPickToggle': {
      const picked = state.comboPick ?? [];
      return {
        ...state,
        comboPick: picked.includes(action.keyId)
          ? picked.filter((k) => k !== action.keyId)
          : [...picked, action.keyId],
      };
    }

    case 'comboPickCancel':
      return { ...state, comboPick: null, comboPickFor: null };

    case 'setBoardHighlight':
      return { ...state, boardHighlight: action.keys };

    case 'behaviorsChange':
      return { ...state, behaviorsJson: action.json };

    case 'jsonChange':
      return { ...state, jsonText: action.text };

    case 'setPanel':
      return { ...state, panel: action.panel };

    // The layout itself is left as it is: saving changes nothing there is to undo.
    case 'saved':
      return { ...state, saved: action.layout, dirty: state.layout !== action.layout };

    default:
      return state;
  }
}
