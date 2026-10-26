import {
  accentsCombo,
  type Binding,
  bundledLayout,
  compileLayout,
  getGeometryPreset,
  type Layout,
} from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { type EditAction, editReducer, selectionOf } from './reducer.js';
import { initialUndoState, type UndoState, undoable } from './undo.js';

const reducer = undoable(editReducer);
/** Qwerty reaching Accents by a combo too, as a Special layout does, for a combo to open. */
const qwerty: Layout = {
  ...(bundledLayout('qwerty') as Layout),
  combos: [accentsCombo('base', getGeometryPreset('3x5+2'))],
};
/** Where the Nav layer lands: after Qwerty's own and default layers. */
const NAV = qwerty.layers.length;

/** Qwerty with an empty Nav layer after its base, back on the base layer. */
function withNav(): UndoState {
  const start = initialUndoState(qwerty, compileLayout(qwerty));
  const added = reducer(start, { type: 'edit', edit: { kind: 'addLayer', name: 'Nav' } });
  return reducer(added, { type: 'selectLayer', layer: 0 });
}

/** The keys picked one after another, the first as a plain click and the rest added to it. */
function pick(state: UndoState, ...keys: string[]): UndoState {
  let next = reducer(state, { type: 'keyClick', keyId: keys[0] });
  for (const keyId of keys.slice(1)) next = reducer(next, { type: 'toggleSelect', keyId });
  return next;
}

const at = (state: UndoState, layer: number, key: string) =>
  state.layout.layers[layer].bindings[key];

/** The keys selected sent to Nav, as the selection's Send to layer does. */
const send = (mode: 'move' | 'copy'): EditAction => ({
  type: 'edit',
  edit: { kind: 'send', layer: 'base', toLayer: 'nav', keys: ['LHM', 'LHI'], mode },
});

/** One binding on every key selected, as the selection's Clear and Make transparent do. */
const bindAll = (state: UndoState, binding: Binding): EditAction => ({
  type: 'edit',
  edit: { kind: 'bind', layer: 'base', keys: selectionOf(state), binding },
});

describe('several keys selected', () => {
  it('adds a key with a second pick, takes it out with a third, and a plain pick starts over', () => {
    let state = pick(withNav(), 'LHM', 'LHI', 'LHR');
    expect(selectionOf(state)).toEqual(['LHM', 'LHI', 'LHR']);
    state = reducer(state, { type: 'toggleSelect', keyId: 'LHI' });
    expect(selectionOf(state)).toEqual(['LHM', 'LHR']);
    // Taking out the key in the editor hands the editor to the next one.
    state = reducer(state, { type: 'toggleSelect', keyId: 'LHM' });
    expect(selectionOf(state)).toEqual(['LHR']);
    state = reducer(state, { type: 'keyClick', keyId: 'LTP' });
    expect(selectionOf(state)).toEqual(['LTP']);
    expect(selectionOf(reducer(pick(state, 'LTP', 'LTR'), { type: 'deselect' }))).toEqual([]);
  });

  it('sends them to another layer in one edit, which one Undo takes back', () => {
    const before = pick(withNav(), 'LHM', 'LHI');
    const sent = reducer(before, send('move'));
    // The board follows them, still selected.
    expect(sent.layer).toBe(NAV);
    expect(selectionOf(sent)).toEqual(['LHM', 'LHI']);
    expect(at(sent, NAV, 'LHM')).toEqual(at(before, 0, 'LHM'));
    expect(at(sent, NAV, 'LHI')).toEqual(at(before, 0, 'LHI'));
    expect(at(sent, 0, 'LHM')).toBeUndefined();
    expect(at(sent, 0, 'LHI')).toBeUndefined();
    expect(sent.past).toHaveLength(before.past.length + 1);

    const undone = reducer(sent, { type: 'undo' });
    expect(at(undone, 0, 'LHM')).toEqual(at(before, 0, 'LHM'));
    expect(at(undone, NAV, 'LHI')).toBeUndefined();
    expect(selectionOf(undone)).toEqual(['LHM', 'LHI']);
  });

  it('copies them, keeping them where they were', () => {
    const before = pick(withNav(), 'LHM', 'LHI');
    const copied = reducer(before, send('copy'));
    expect(at(copied, NAV, 'LHM')).toEqual(at(before, 0, 'LHM'));
    expect(at(copied, 0, 'LHM')).toEqual(at(before, 0, 'LHM'));
    expect(at(copied, 0, 'LHI')).toEqual(at(before, 0, 'LHI'));
  });

  it('makes them do nothing, or lets the layer below show through, all at once', () => {
    const before = pick(withNav(), 'LHM', 'LHI', 'LHR');
    const cleared = reducer(before, bindAll(before, { kind: 'none' }));
    for (const key of ['LHM', 'LHI', 'LHR']) expect(at(cleared, 0, key)).toEqual({ kind: 'none' });
    expect(cleared.past).toHaveLength(before.past.length + 1);

    const shown = reducer(before, bindAll(before, { kind: 'trans' }));
    for (const key of ['LHM', 'LHI', 'LHR']) expect(at(shown, 0, key)).toEqual({ kind: 'trans' });
  });
});

describe('where the board goes after an edit', () => {
  const edit = (state: UndoState, e: Extract<EditAction, { type: 'edit' }>['edit']) =>
    reducer(state, { type: 'edit', edit: e });
  const shown = (state: UndoState) => state.layout.layers[state.layer].id;

  it('shows a new layer, with nothing selected, and the copy a duplicate makes', () => {
    const picked = pick(withNav(), 'LHM');
    const added = edit(picked, { kind: 'addLayer', name: 'Fun' });
    expect(shown(added)).toBe('fun');
    expect(selectionOf(added)).toEqual([]);
    const copied = edit(pick(added, 'LHI'), { kind: 'duplicateLayer', layer: 'nav' });
    expect(shown(copied)).toBe('nav-copy');
    expect(selectionOf(copied)).toEqual(['LHI']);
  });

  it('keeps the layer on screen on screen when layers move or one before it goes', () => {
    // Fun, on screen, comes right after Nav.
    const onFun = reducer(edit(withNav(), { kind: 'addLayer', name: 'Fun' }), {
      type: 'selectLayer',
      layer: NAV + 1,
    });
    const moved = edit(onFun, { kind: 'moveLayer', layer: 'fun', to: NAV });
    expect(shown(moved)).toBe('fun');
    expect(moved.layer).toBe(NAV);
    const removed = edit(onFun, { kind: 'removeLayer', layer: 'nav' });
    expect(shown(removed)).toBe('fun');
    expect(removed.layer).toBe(NAV);
  });

  it('keeps the shown layer and selection when a rename changes an internal ID', () => {
    const onBase = pick(withNav(), 'LHM');
    const elsewhere = edit(onBase, { kind: 'renameLayer', layer: 'nav', name: 'Arrows' });
    expect(shown(elsewhere)).toBe('base');
    expect(selectionOf(elsewhere)).toEqual(['LHM']);
    const renamed = edit(onBase, { kind: 'renameLayer', layer: 'base', name: 'Main' });
    expect(shown(renamed)).toBe('main');
    expect(selectionOf(renamed)).toEqual(['LHM']);
    const undone = reducer(renamed, { type: 'undo' });
    expect(shown(undone)).toBe('base');
    expect(shown(reducer(undone, { type: 'redo' }))).toBe('main');
  });

  it('shows the layer before one removed from under the board', () => {
    const onNav = reducer(withNav(), { type: 'selectLayer', layer: NAV });
    const removed = edit(onNav, { kind: 'removeLayer', layer: 'nav' });
    expect(removed.layer).toBe(NAV - 1);
  });

  it('ends a swap waiting for its partner, and a combo being picked, once an edit lands', () => {
    const armed = reducer(pick(withNav(), 'LHM'), { type: 'startSwap' });
    expect(armed.swapFrom).toBe('LHM');
    expect(edit(armed, { kind: 'renameLayer', layer: 'nav', name: 'Arrows' }).swapFrom).toBeNull();
    const picking = reducer(withNav(), { type: 'comboPickStart' });
    expect(
      edit(picking, { kind: 'renameLayer', layer: 'nav', name: 'Arrows' }).comboPick,
    ).toBeNull();
  });

  it('remembers which combo a pick is for, until the pick ends', () => {
    const forNew = reducer(withNav(), { type: 'comboPickStart' });
    expect(forNew.comboPickFor).toBeNull();
    const forRow = reducer(withNav(), { type: 'comboPickStart', combo: 2 });
    expect(forRow).toMatchObject({ comboPick: [], comboPickFor: 2 });
    expect(reducer(forRow, { type: 'comboPickCancel' })).toMatchObject({
      comboPick: null,
      comboPickFor: null,
    });
    expect(
      edit(forRow, { kind: 'renameLayer', layer: 'nav', name: 'Arrows' }).comboPickFor,
    ).toBeNull();
  });

  it('selects the key a copy lands on, and nothing once the whole layout is replaced', () => {
    const copied = reducer(pick(withNav(), 'LHM', 'LHI'), {
      type: 'dropKey',
      from: 'LHM',
      to: 'LHR',
      mode: 'copy',
    });
    expect(at(copied, 0, 'LHR')).toEqual(at(copied, 0, 'LHM'));
    expect(selectionOf(copied)).toEqual(['LHR']);
    const replaced = edit(pick(withNav(), 'LHM'), {
      kind: 'replaceLayout',
      json: JSON.stringify(qwerty),
    });
    expect(replaced.lastEdit).toMatchObject({ status: 'landed', edit: { kind: 'replaceLayout' } });
    expect(selectionOf(replaced)).toEqual([]);
  });

  it('swaps an armed key with the key clicked next, and selects where it went', () => {
    const armed = reducer(pick(withNav(), 'LHM'), { type: 'startSwap' });
    const swapped = reducer(armed, { type: 'keyClick', keyId: 'LHI' });
    expect(at(swapped, 0, 'LHI')).toEqual(at(armed, 0, 'LHM'));
    expect(selectionOf(swapped)).toEqual(['LHI']);
    expect(swapped.lastEdit).toMatchObject({
      status: 'landed',
      edit: { kind: 'swap', from: 'LHM', to: 'LHI' },
    });
  });
});

describe('the tabs', () => {
  it('drop a request for the key editor to take focus, which it is not there to answer', () => {
    const start = initialUndoState(qwerty, compileLayout(qwerty));
    const typed = reducer(start, { type: 'typeOnKey', keyId: 'LHM', seed: 'b' });
    expect(typed.focusRequest).toEqual({ keyId: 'LHM', seed: 'b' });
    expect(reducer(typed, { type: 'setPanel', panel: 'layers' }).focusRequest).toBeNull();
  });
});

describe('the combo open in the combo editor', () => {
  const addCombo: EditAction = {
    type: 'edit',
    edit: {
      kind: 'addCombo',
      layer: 'base',
      keys: ['LHM', 'LHP'],
      binding: { kind: 'none' },
      role: 'typing',
    },
  };

  it('opens a combo just added, in place of the key that was open', () => {
    const added = reducer(pick(withNav(), 'LHI'), addCombo);
    expect(added.combo).toBe((added.layout.combos?.length ?? 0) - 1);
    expect(selectionOf(added)).toEqual([]); // Undone past its adding, it is gone and so is its editor; redone, it opens again.
    const undone = reducer(added, { type: 'undo' });
    expect(undone.combo).toBeNull();
    expect(reducer(undone, { type: 'redo' }).combo).toBe(added.combo);
  });

  it('follows its place when a combo before it goes, and closes when it goes', () => {
    const added = reducer(withNav(), addCombo);
    const open = added.combo as number;
    const first = reducer(added, { type: 'edit', edit: { kind: 'removeCombo', combo: 0 } });
    expect(first.combo).toBe(open - 1);
    const itself = reducer(first, { type: 'edit', edit: { kind: 'removeCombo', combo: open - 1 } });
    expect(itself.combo).toBeNull();
    // Back with Undo, and open again.
    expect(reducer(itself, { type: 'undo' }).combo).toBe(open - 1);
  });

  it('closes when the whole layout is replaced', () => {
    const opened = reducer(withNav(), { type: 'selectCombo', combo: 0 });
    const replaced = reducer(opened, {
      type: 'edit',
      edit: { kind: 'replaceLayout', json: JSON.stringify(opened.layout) },
    });
    expect(replaced.combo).toBeNull();
  });

  it('closes when a key is clicked, and closes the key when it opens', () => {
    const opened = reducer(pick(withNav(), 'LHI'), { type: 'selectCombo', combo: 0 });
    expect(opened).toMatchObject({ combo: 0, selected: null });
    expect(reducer(opened, { type: 'keyClick', keyId: 'LHM' }).combo).toBeNull();
    expect(reducer(opened, { type: 'deselect' }).combo).toBeNull();
    expect(reducer(withNav(), { type: 'selectCombo', combo: 99 }).combo).toBeNull();
  });

  it("ends a new combo's pick when a combo is opened, and keeps the pick of its own keys", () => {
    const picking = reducer(withNav(), { type: 'comboPickStart' });
    expect(reducer(picking, { type: 'selectCombo', combo: 0 }).comboPick).toBeNull();
    const own = reducer(withNav(), { type: 'comboPickStart', combo: 0 });
    expect(reducer(own, { type: 'selectCombo', combo: 0 })).toMatchObject({
      comboPick: [],
      comboPickFor: 0,
    });
  });
});
