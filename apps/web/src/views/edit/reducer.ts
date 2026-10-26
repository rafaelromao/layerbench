import {
  applyEdit,
  type CompiledLayout,
  type Edit,
  type EditOutcome,
  type Layout,
} from '@layerbench/core';
import { displaced, spoken } from './tray.js';

export type Panel =
  | 'board'
  | 'layers'
  | 'features'
  | 'geometry'
  | 'combos'
  | 'behaviors'
  | 'paths'
  | 'json';

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
  /** A character tapped in the missing-keys tray, waiting for its key; null when none is. */
  placing: string | null;
  /**
   * The characters put on keys from the tray, and those they displaced: the tray shows them again
   * whenever nothing types them, after an undo too, before the text is typed again.
   */
  strays: string[];
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
  /**
   * The combo, by place, open in the combo editor; null when none is. A combo and a key are never
   * open together: selecting one closes the other.
   */
  combo: number | null;
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
  /** A key dragged onto another key: swapped with it, or copied over it. */
  | { type: 'dropKey'; from: string; to: string; mode: 'swap' | 'copy'; say?: string }
  /** Arm a character of the missing-keys tray for the next key tapped; again, or null, disarms. */
  | { type: 'armChar'; char: string | null }
  /** A character of the missing-keys tray put on a key, dropped or tapped there: a plain press. */
  | { type: 'placeChar'; keyId: string; char: string; say?: string }
  /** With `combo`, the keys picked are the new keys of that combo rather than a new combo's. */
  | { type: 'comboPickStart'; combo?: number }
  | { type: 'comboPickToggle'; keyId: string }
  | { type: 'comboPickCancel' }
  /** Open a combo, by place, in the combo editor; null closes it. */
  | { type: 'selectCombo'; combo: number | null }
  | { type: 'setBoardHighlight'; keys: string[] }
  | { type: 'jsonChange'; text: string }
  | { type: 'setPanel'; panel: Panel }
  | { type: 'saved'; layout: Layout }
  /**
   * `layout` is `from` under the name its copy was saved as: the editor takes that name, now that
   * the save has gone through, and the copy is what is saved.
   */
  | { type: 'savedAs'; from: Layout; layout: Layout }
  /** A change to the layout, and what to tell a screen reader once it has landed. */
  | { type: 'edit'; edit: Edit; say?: string };

export function initialState(layout: Layout, compiled: CompiledLayout, layer = 0): EditState {
  return {
    layout,
    compiled,
    layer: Math.min(layer, compiled.layers.length - 1),
    selected: null,
    also: [],
    swapFrom: null,
    swapMode: 'swap',
    placing: null,
    strays: [],
    dirty: false,
    saved: layout,
    panel: 'board',
    error: null,
    jsonText: '',
    jsonError: null,
    lastEdit: null,
    focusRequest: null,
    combo: null,
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
export function refusalShownIn(edit: Edit): 'error' | 'jsonError' {
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
  const shown = shownLayer(state);
  const keepShown = edit.kind === 'renameLayer' && edit.layer !== shown;
  const followed = compiled.layerIndex.get(keepShown ? shown : (at.layer ?? shown));
  // A combo added opens in the combo editor, which takes the place of any key that was open.
  // A key the edit took off the board is no longer selected.
  const keys =
    edit.kind === 'addCombo'
      ? []
      : (at.keys ?? selectionOf(state)).filter((k) => compiled.keyIndex.has(k));
  const combo = keys.length > 0 ? null : comboAfter(state.combo, edit, layout);
  return {
    ...state,
    layout,
    compiled,
    layer: Math.min(followed ?? Math.max(0, state.layer - 1), compiled.layers.length - 1),
    selected: keys[0] ?? null,
    also: keys.slice(1),
    combo,
    dirty: true,
    error: null,
    focusRequest: null,
    // An edit that lands ends a swap or a character waiting for their key and a combo being picked.
    swapFrom: null,
    placing: null,
    comboPick: null,
    comboPickFor: null,
    ...(edit.kind === 'replaceLayout' ? { jsonError: null } : {}),
    lastEdit: say === undefined ? outcome : { ...outcome, say },
  };
}

/**
 * The combo open in the editor once an edit has landed: a combo just added opens there, and the one
 * open follows its place when one before it is removed, or closes when it is the one removed.
 */
function comboAfter(open: number | null, edit: Edit, layout: Layout): number | null {
  const count = layout.combos?.length ?? 0;
  if (edit.kind === 'addCombo') return count - 1;
  // Another document's combo at the same place is not the one that was open.
  if (edit.kind === 'replaceLayout') return null;
  if (open === null) return null;
  if (edit.kind === 'removeCombo') {
    if (edit.combo === open) return null;
    if (edit.combo < open) return open - 1;
  }
  return open < count ? open : null;
}

function make(state: EditState, edit: Edit, say?: string): EditState {
  return land(state, applyEdit(state.layout, edit), say);
}

/** The edit a drop makes: the key dropped on swaps places with the one dragged, or is copied over. */
function dropped(
  state: EditState,
  { from, to, mode }: { from: string; to: string; mode: 'swap' | 'copy' },
): Edit {
  return { kind: mode, layer: shownLayer(state), from, to };
}

/**
 * A character of the tray on a key, in place of whatever the key did there: one edit, which keeps
 * the character and whatever it displaced for the tray.
 */
function placed(state: EditState, keyId: string, char: string, say?: string): EditState {
  const next = make(
    state,
    {
      kind: 'bind',
      layer: shownLayer(state),
      keys: [keyId],
      binding: { kind: 'kp', symbol: char },
    },
    say,
  );
  if (next.layout === state.layout) return next;
  const strays = [...state.strays];
  for (const c of [char, ...displaced(state.compiled, next.compiled)]) {
    if (!strays.includes(c)) strays.push(c);
  }
  return { ...next, strays };
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
      // A character tapped in the tray goes on the next key tapped.
      if (state.placing !== null) {
        return placed(
          state,
          action.keyId,
          state.placing,
          `${spoken(state.placing)} on ${action.keyId}`,
        );
      }
      // A stale compile error belongs to the edit that failed, not to the next key clicked.
      if (!state.swapFrom) {
        return {
          ...state,
          selected: action.keyId,
          also: [],
          combo: null,
          focusRequest: null,
          error: null,
        };
      }
      if (state.swapFrom === action.keyId) return { ...state, swapFrom: null };
      // Arming a key and then tapping its partner is what a drag is, for anyone not holding a
      // mouse — so it has to reach copying too, not only swapping.
      const armed = { ...state, swapFrom: null };
      return make(
        armed,
        dropped(armed, {
          from: state.swapFrom,
          to: action.keyId,
          mode: state.swapMode,
        }),
      );
    }

    case 'toggleSelect': {
      // With a swap or a character waiting for a key, the key picked is that key, as a click is.
      if (state.swapFrom || state.placing !== null)
        return reduce(state, { type: 'keyClick', keyId: action.keyId });
      const keys = selectionOf(state);
      const next = keys.includes(action.keyId)
        ? keys.filter((k) => k !== action.keyId)
        : [...keys, action.keyId];
      return {
        ...state,
        selected: next[0] ?? null,
        also: next.slice(1),
        combo: next.length > 0 ? null : state.combo,
        focusRequest: null,
        error: null,
      };
    }

    case 'startSwap':
      return state.selected
        ? { ...state, swapFrom: state.selected, swapMode: action.mode ?? 'swap', placing: null }
        : state;

    case 'cancelSwap':
      return { ...state, swapFrom: null, placing: null };

    // One thing waits for keys at a time: a character armed puts down a swap armed or a combo pick.
    case 'armChar':
      return {
        ...state,
        placing: action.char === state.placing ? null : action.char,
        swapFrom: null,
        comboPick: null,
        comboPickFor: null,
        focusRequest: null,
      };

    case 'placeChar':
      return placed(state, action.keyId, action.char, action.say);

    case 'typeOnKey':
      return {
        ...state,
        selected: action.keyId,
        also: [],
        combo: null,
        // Typing on a key is the next thing done to it, not where a character armed goes.
        swapFrom: null,
        placing: null,
        error: null,
        focusRequest: { keyId: action.keyId, seed: action.seed },
      };

    case 'deselect':
      return state.selected === null && state.swapFrom === null && state.combo === null
        ? state
        : { ...state, selected: null, also: [], combo: null, swapFrom: null, focusRequest: null };

    case 'dropKey':
      return make(state, dropped(state, action), action.say);

    case 'comboPickStart':
      return {
        ...state,
        comboPick: [],
        comboPickFor: action.combo ?? null,
        placing: null,
        // Keys picked again belong to the combo open in the editor; a new combo's to the add form.
        combo: action.combo ?? null,
        focusRequest: null,
        selected: null,
        also: [],
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

    case 'selectCombo': {
      const known = action.combo !== null && action.combo < (state.layout.combos?.length ?? 0);
      const combo = known ? action.combo : null;
      return {
        ...state,
        combo,
        // A combo opened is where the board's clicks go next, not to the key that was open.
        ...(combo === null ? {} : { selected: null, also: [], swapFrom: null }),
        // Opening a combo ends a pick of a new combo's keys, or of the keys of the one before it.
        ...(state.comboPick !== null && state.comboPickFor !== combo
          ? { comboPick: null, comboPickFor: null }
          : {}),
        focusRequest: null,
        error: null,
      };
    }

    case 'setBoardHighlight':
      return { ...state, boardHighlight: action.keys };

    case 'jsonChange':
      return { ...state, jsonText: action.text };

    case 'setPanel':
      // The inspector is not drawn on every tab: a request for its focus, left over, would be
      // replayed when it comes back, applying a character already cancelled.
      return { ...state, panel: action.panel, focusRequest: null };

    // The layout itself is left as it is: saving changes nothing there is to undo.
    case 'saved':
      return { ...state, saved: action.layout, dirty: state.layout !== action.layout };

    // The name is the one thing saving changes, and it is an edit as any other: one Undo gives the
    // layout its old name back, as unsaved. An edit made while the save was on its way stays unsaved.
    case 'savedAs': {
      // A name typed while the copy was being saved is the user's newer word: it stays, unsaved.
      if (state.layout.name !== action.from.name) {
        return { ...state, saved: action.layout, dirty: true };
      }
      const renamed = make(state, { kind: 'setMeta', name: action.layout.name });
      return state.layout === action.from
        ? { ...renamed, saved: renamed.layout, dirty: false }
        : { ...renamed, saved: action.layout, dirty: true };
    }

    default:
      return state;
  }
}
