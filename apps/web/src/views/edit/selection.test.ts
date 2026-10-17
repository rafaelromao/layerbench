import { type Binding, bundledLayout, compileLayout, type Layout } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { type EditAction, editReducer, selectionOf } from './reducer.js';
import { initialUndoState, type UndoState, undoable } from './undo.js';

const reducer = undoable(editReducer);
const qwerty = bundledLayout('qwerty') as Layout;
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

  // Rewriting the text on every edit would throw away whatever is half-typed in it.
  it('rewrites the behaviours text only when the behaviours change', () => {
    const typing = reducer(withNav(), { type: 'behaviorsChange', json: '{ "half": ' });
    const renamed = edit(typing, { kind: 'renameLayer', layer: 'nav', name: 'Arrows' });
    expect(renamed.behaviorsJson).toBe('{ "half": ');
    const set = edit(typing, { kind: 'setBehavior', name: 'rep', binding: { kind: 'key_repeat' } });
    expect(JSON.parse(set.behaviorsJson)).toMatchObject({ rep: { kind: 'key_repeat' } });
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
