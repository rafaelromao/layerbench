import {
  type Binding,
  type CompiledLayout,
  compileLayout,
  copyKey,
  duplicateLayer,
  type LayerColor,
  type Layout,
  type LayoutFeatures,
  layerReachedFrom,
  type Mod,
  moveLayer,
  removeLayer,
  safeParseLayout,
  sendKeyToLayer,
  setKeyBinding,
  slug,
  swapKeys,
  type TypingPathEntry,
} from '@layoutmaster/core';
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
  /** Key the user armed for a click-to-swap, if any. */
  swapFrom: string | null;
  /** What the armed key does when its partner is picked. */
  swapMode: 'swap' | 'copy';
  /** The layout differs from `saved`, so closing the tab would lose it. */
  dirty: boolean;
  /**
   * The layout as it was opened or last saved. Undo can come back to it, which is no longer an
   * unsaved change, and an edit made while a save was on its way is still one.
   */
  saved: Layout;
  panel: Panel;
  error: string | null;
  behaviorsJson: string;
  behaviorsError: string | null;
  jsonText: string;
  jsonError: string | null;
  /** The last swap, so the view can ask for an instant estimate. */
  lastSwap: { layerIdx: number; from: string; to: string } | null;
  /** Where typing on the board should land next, if a key was typed on. */
  focusRequest: FocusRequest | null;
  /** Keys picked on the board for a new combo, or null when not picking. */
  comboPick: string[] | null;
  /** Keys to outline, so a combo can point at the keys it is made of. */
  boardHighlight: string[];
}

export type EditAction =
  | { type: 'selectLayer'; layer: number }
  | { type: 'keyClick'; keyId: string }
  | { type: 'startSwap'; mode?: 'swap' | 'copy' }
  | { type: 'cancelSwap' }
  | { type: 'swap'; from: string; to: string }
  | { type: 'setBinding'; binding: Binding }
  | { type: 'clearBinding' }
  | { type: 'typeOnKey'; keyId: string; seed: string | null }
  | { type: 'deselect' }
  | { type: 'commitBinding'; keyId: string; binding: Binding }
  | { type: 'setBehavior'; name: string; binding: Binding }
  | { type: 'clearKey'; keyId: string }
  | { type: 'dropKey'; from: string; to: DropTarget; mode: 'swap' | 'copy' }
  | { type: 'addLayer'; name: string }
  | { type: 'removeLayer'; id: string }
  | { type: 'renameLayer'; id: string; name: string }
  /** No colour is Automatic: the one the layer's place in the list gives it. */
  | { type: 'setLayerColor'; id: string; color: LayerColor | undefined }
  | { type: 'moveLayer'; from: number; to: number }
  | { type: 'duplicateLayer'; id: string }
  | {
      type: 'setKeys';
      space?: string;
      shift?: string | null;
      shiftKind?: 'sk' | 'hold';
      repeat?: 'repeatKey' | 'tapTwice';
    }
  | { type: 'setMeta'; name?: string; author?: string; description?: string }
  | { type: 'addCombo'; keys: string[]; binding: Binding; role: 'typing' | 'command' }
  | { type: 'comboPickStart' }
  | { type: 'comboPickToggle'; keyId: string }
  | { type: 'comboPickCancel' }
  | { type: 'setBoardHighlight'; keys: string[] }
  | { type: 'removeCombo'; id: string }
  | { type: 'toggleComboRole'; id: string }
  | { type: 'behaviorsChange'; json: string }
  | { type: 'behaviorsApply'; json: string }
  | { type: 'pathSet'; symbol: string; entries: TypingPathEntry[] }
  | { type: 'exportJson' }
  | { type: 'jsonChange'; text: string }
  | { type: 'importJson'; text: string }
  | { type: 'setFeatures'; features: LayoutFeatures }
  | { type: 'setPanel'; panel: Panel }
  | { type: 'saved'; layout: Layout };

function behaviorsText(layout: Layout): string {
  return JSON.stringify(layout.behaviors ?? {}, null, 2);
}

export function initialState(layout: Layout, compiled: CompiledLayout, layer = 0): EditState {
  return {
    layout,
    compiled,
    layer: Math.min(layer, compiled.layers.length - 1),
    selected: null,
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
    lastSwap: null,
    focusRequest: null,
    comboPick: null,
    boardHighlight: [],
  };
}

/**
 * Adopt an edited layout. A layout that will not compile is rejected with its error rather than
 * replacing the working copy, so the editor never lands in a state it cannot draw.
 */
function withLayout(state: EditState, layout: Layout, patch: Partial<EditState> = {}): EditState {
  try {
    const compiled = compileLayout(layout);
    // Re-rendering the behaviours buffer on every edit would throw away whatever is half-typed in
    // it, so it is only refreshed when the behaviours themselves moved.
    const behaviorsMoved =
      JSON.stringify(layout.behaviors ?? {}) !== JSON.stringify(state.layout.behaviors ?? {});
    return {
      ...state,
      layout,
      compiled,
      dirty: true,
      error: null,
      focusRequest: null,
      ...(behaviorsMoved ? { behaviorsJson: behaviorsText(layout) } : {}),
      layer: Math.min(state.layer, compiled.layers.length - 1),
      ...patch,
    };
  } catch (e) {
    return { ...state, error: e instanceof Error ? e.message : String(e) };
  }
}

export function editReducer(state: EditState, action: EditAction): EditState {
  switch (action.type) {
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
        return { ...state, selected: action.keyId, focusRequest: null, error: null };
      }
      if (state.swapFrom === action.keyId) return { ...state, swapFrom: null };
      // Arming a key and then tapping its partner is what a drag is, for anyone not holding a
      // mouse — so it has to reach copying too, not only swapping.
      return editReducer(
        { ...state, swapFrom: null },
        {
          type: 'dropKey',
          from: state.swapFrom,
          to: { kind: 'key', keyId: action.keyId },
          mode: state.swapMode,
        },
      );
    }

    case 'startSwap':
      return state.selected
        ? { ...state, swapFrom: state.selected, swapMode: action.mode ?? 'swap' }
        : state;

    case 'cancelSwap':
      return { ...state, swapFrom: null };

    case 'swap': {
      const swapped = swapKeys(state.layout, state.layer, action.from, action.to);
      return withLayout(state, swapped, {
        selected: action.to,
        swapFrom: null,
        lastSwap: { layerIdx: state.layer, from: action.from, to: action.to },
      });
    }

    case 'setBinding':
      if (!state.selected) return state;
      return editReducer(state, {
        type: 'commitBinding',
        keyId: state.selected,
        binding: action.binding,
      });

    case 'clearBinding':
      if (!state.selected) return state;
      return editReducer(state, { type: 'clearKey', keyId: state.selected });

    case 'typeOnKey':
      return {
        ...state,
        selected: action.keyId,
        swapFrom: null,
        error: null,
        focusRequest: { keyId: action.keyId, seed: action.seed },
      };

    case 'deselect':
      return state.selected === null && state.swapFrom === null
        ? state
        : { ...state, selected: null, swapFrom: null, focusRequest: null };

    case 'commitBinding':
      return withLayout(
        state,
        setKeyBinding(state.layout, state.layer, action.keyId, action.binding),
        { selected: action.keyId, lastSwap: null },
      );

    case 'clearKey':
      return withLayout(state, setKeyBinding(state.layout, state.layer, action.keyId, undefined), {
        selected: action.keyId,
        lastSwap: null,
      });

    case 'setBehavior':
      return withLayout(
        state,
        {
          ...state.layout,
          behaviors: { ...(state.layout.behaviors ?? {}), [action.name]: action.binding },
        },
        { lastSwap: null },
      );

    case 'dropKey': {
      const { from, to, mode } = action;
      if (to.kind === 'layer') {
        const target = state.layout.layers.findIndex((l) => l.id === to.layerId);
        if (target < 0 || target === state.layer) return state;
        // Following the binding to its new layer is the only way to see that the drop landed.
        return withLayout(
          state,
          sendKeyToLayer(
            state.layout,
            state.layer,
            target,
            from,
            mode === 'copy' ? 'copy' : 'move',
          ),
          { layer: target, selected: from, lastSwap: null },
        );
      }
      if (from === to.keyId) return state;
      if (mode === 'copy') {
        return withLayout(state, copyKey(state.layout, state.layer, from, to.keyId), {
          selected: to.keyId,
          lastSwap: null,
        });
      }
      return editReducer(state, { type: 'swap', from, to: to.keyId });
    }

    case 'addLayer': {
      const base = slug(action.name || `layer ${state.layout.layers.length + 1}`);
      const taken = new Set(state.layout.layers.map((l) => l.id));
      const id = taken.has(base) ? `${base}-${state.layout.layers.length}` : base;
      const layers = [
        ...state.layout.layers,
        {
          id,
          name: action.name || `Layer ${state.layout.layers.length + 1}`,
          bindings: { '*': { kind: 'trans' } as Binding },
        },
      ];
      return withLayout(
        state,
        { ...state.layout, layers },
        {
          layer: layers.length - 1,
          selected: null,
          lastSwap: null,
        },
      );
    }

    case 'removeLayer': {
      if (state.layout.layers.length <= 1 || state.layout.layers[0].id === action.id) {
        return { ...state, error: 'cannot remove the base layer' };
      }
      // A layer something still reaches cannot go without breaking that key; say which, and let
      // the author decide what those keys should do instead.
      const reaching = layerReachedFrom(state.layout, action.id);
      if (reaching.length > 0) {
        const name = state.layout.layers.find((l) => l.id === action.id)?.name ?? action.id;
        return {
          ...state,
          error: `${name} is still reached from ${reaching.join(', ')}. Point those at another layer first.`,
        };
      }
      // The view stays where it was, or moves to the layer before the one that went.
      const gone = state.layout.layers.findIndex((l) => l.id === action.id);
      const layer = gone <= state.layer ? Math.max(0, state.layer - 1) : state.layer;
      return withLayout(state, removeLayer(state.layout, action.id), { layer, lastSwap: null });
    }

    case 'renameLayer': {
      const name = action.name.trim();
      const current = state.layout.layers.find((l) => l.id === action.id);
      if (!current || name === '' || name === current.name) return state;
      const layers = state.layout.layers.map((l) => (l.id === action.id ? { ...l, name } : l));
      return withLayout(state, { ...state.layout, layers }, { lastSwap: null });
    }

    case 'setLayerColor': {
      const current = state.layout.layers.find((l) => l.id === action.id);
      if (!current || current.color === action.color) return state;
      const layers = state.layout.layers.map((l) => {
        if (l.id !== action.id) return l;
        const { color: _was, ...rest } = l;
        return action.color ? { ...rest, color: action.color } : rest;
      });
      return withLayout(state, { ...state.layout, layers }, { lastSwap: null });
    }

    case 'moveLayer': {
      const moved = moveLayer(state.layout, action.from, action.to);
      if (moved === state.layout) return state;
      // The layer on screen stays on screen, wherever it now sits in the list.
      const shown = state.layout.layers[state.layer]?.id;
      const layer = Math.max(
        0,
        moved.layers.findIndex((l) => l.id === shown),
      );
      return withLayout(state, moved, { layer, lastSwap: null });
    }

    case 'duplicateLayer': {
      const idx = state.layout.layers.findIndex((l) => l.id === action.id);
      const copy = duplicateLayer(state.layout, idx);
      if (!copy) return state;
      return withLayout(state, copy.layout, { layer: idx + 1, lastSwap: null });
    }

    case 'setFeatures': {
      const hasAny = Object.values(action.features).some((v) => v !== undefined);
      const layout = { ...state.layout };
      if (hasAny) layout.features = action.features;
      else delete layout.features;
      return withLayout(state, layout, { lastSwap: null });
    }

    case 'setKeys': {
      const keys = { ...state.layout.keys };
      if (action.space) keys.space = action.space;
      if (action.shift !== undefined) {
        keys.shift = action.shift
          ? { key: action.shift, kind: action.shiftKind ?? keys.shift?.kind ?? 'sk' }
          : undefined;
      } else if (action.shiftKind && keys.shift) {
        keys.shift = { ...keys.shift, kind: action.shiftKind };
      }
      const repeatPolicy = action.repeat
        ? { doubledLetters: action.repeat }
        : state.layout.repeatPolicy;
      return withLayout(state, { ...state.layout, keys, repeatPolicy }, { lastSwap: null });
    }

    case 'setMeta':
      return withLayout(
        state,
        {
          ...state.layout,
          name: action.name ?? state.layout.name,
          author: action.author ?? state.layout.author,
          description: action.description ?? state.layout.description,
        },
        { lastSwap: null },
      );

    case 'addCombo': {
      if (action.keys.length < 2) {
        return { ...state, error: 'a combo needs at least two keys and an output' };
      }
      const layerId = state.layout.layers[state.layer].id;
      const combos = [
        ...(state.layout.combos ?? []),
        {
          id: slug(action.keys.join('-')),
          keys: action.keys,
          binding: action.binding,
          layers: [layerId],
          role: action.role,
          timeoutMs: 50,
          slowRelease: false,
        },
      ];
      return withLayout(
        state,
        { ...state.layout, combos },
        {
          lastSwap: null,
          comboPick: null,
        },
      );
    }

    case 'comboPickStart':
      return { ...state, comboPick: [], focusRequest: null, selected: null, swapFrom: null };

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
      return { ...state, comboPick: null };

    case 'setBoardHighlight':
      return { ...state, boardHighlight: action.keys };

    case 'removeCombo':
      return withLayout(
        state,
        { ...state.layout, combos: (state.layout.combos ?? []).filter((c) => c.id !== action.id) },
        { lastSwap: null },
      );

    case 'toggleComboRole':
      return withLayout(
        state,
        {
          ...state.layout,
          combos: (state.layout.combos ?? []).map((c) =>
            c.id === action.id
              ? { ...c, role: c.role === 'typing' ? ('command' as const) : ('typing' as const) }
              : c,
          ),
        },
        { lastSwap: null },
      );

    case 'behaviorsChange':
      return { ...state, behaviorsJson: action.json };

    case 'behaviorsApply': {
      let parsed: unknown;
      try {
        parsed = JSON.parse(action.json);
      } catch (e) {
        return { ...state, behaviorsError: `invalid JSON: ${e instanceof Error ? e.message : e}` };
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ...state, behaviorsError: 'behaviors must be an object' };
      }
      const next = withLayout(state, {
        ...state.layout,
        behaviors: parsed as Record<string, Binding>,
      });
      return next.error
        ? { ...state, behaviorsError: next.error }
        : { ...next, behaviorsError: null, lastSwap: null };
    }

    /**
     * The whole list for one symbol, computed by the panel. A symbol with no declared path is
     * shown with the producers the engine found, and the panel sends that list back with the
     * change applied — which is why reordering and toggling one now works the first time.
     */
    case 'pathSet': {
      const paths = { ...(state.layout.typingPaths ?? {}), [action.symbol]: action.entries };
      return withLayout(state, { ...state.layout, typingPaths: paths }, { lastSwap: null });
    }

    case 'exportJson':
      return { ...state, panel: 'json', jsonText: '', jsonError: null };

    case 'jsonChange':
      return { ...state, jsonText: action.text };

    case 'importJson': {
      let value: unknown;
      try {
        value = JSON.parse(action.text);
      } catch (e) {
        return { ...state, jsonError: `invalid JSON: ${e instanceof Error ? e.message : e}` };
      }
      const parsed = safeParseLayout(value);
      if (!parsed.ok) return { ...state, jsonError: parsed.error };
      const next = withLayout(state, parsed.layout, { selected: null, lastSwap: null });
      return next.error ? { ...state, jsonError: next.error } : { ...next, jsonError: null };
    }

    case 'setPanel':
      return { ...state, panel: action.panel };

    // The layout itself is left as it is: saving changes nothing there is to undo.
    case 'saved':
      return { ...state, saved: action.layout, dirty: state.layout !== action.layout };

    default:
      return state;
  }
}

export const MODS: Mod[] = ['LSHIFT', 'RSHIFT', 'LCTRL', 'RCTRL', 'LALT', 'RALT', 'LGUI', 'RGUI'];
