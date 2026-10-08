import { bundledLayout, compileLayout, type Layout } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { editReducer, selectionOf } from './reducer.js';
import { initialUndoState, type UndoState, undoable } from './undo.js';

const reducer = undoable(editReducer);
const qwerty = bundledLayout('qwerty') as Layout;
/** Where the Nav layer lands: after Qwerty's own and default layers. */
const NAV = qwerty.layers.length;

/** Qwerty with an empty Nav layer after its base, back on the base layer. */
function withNav(): UndoState {
  const start = initialUndoState(qwerty, compileLayout(qwerty));
  const added = reducer(start, { type: 'addLayer', name: 'Nav' });
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
    const sent = reducer(before, { type: 'sendSelection', layerId: 'nav', mode: 'move' });
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
    const copied = reducer(before, { type: 'sendSelection', layerId: 'nav', mode: 'copy' });
    expect(at(copied, NAV, 'LHM')).toEqual(at(before, 0, 'LHM'));
    expect(at(copied, 0, 'LHM')).toEqual(at(before, 0, 'LHM'));
    expect(at(copied, 0, 'LHI')).toEqual(at(before, 0, 'LHI'));
  });

  it('makes them do nothing, or lets the layer below show through, all at once', () => {
    const before = pick(withNav(), 'LHM', 'LHI', 'LHR');
    const cleared = reducer(before, { type: 'clearSelection' });
    for (const key of ['LHM', 'LHI', 'LHR']) expect(at(cleared, 0, key)).toEqual({ kind: 'none' });
    expect(cleared.past).toHaveLength(before.past.length + 1);

    const shown = reducer(before, { type: 'transparentSelection' });
    for (const key of ['LHM', 'LHI', 'LHR']) expect(at(shown, 0, key)).toEqual({ kind: 'trans' });
  });

  it('takes the others along when one of them is dragged onto a layer tab, and only that key otherwise', () => {
    const before = pick(withNav(), 'LHM', 'LHI');
    const dragged = reducer(before, {
      type: 'dropKey',
      from: 'LHI',
      to: { kind: 'layer', layerId: 'nav' },
      mode: 'swap',
    });
    expect(at(dragged, NAV, 'LHM')).toEqual(at(before, 0, 'LHM'));
    expect(at(dragged, NAV, 'LHI')).toEqual(at(before, 0, 'LHI'));

    const other = reducer(before, {
      type: 'dropKey',
      from: 'LTP',
      to: { kind: 'layer', layerId: 'nav' },
      mode: 'swap',
    });
    expect(at(other, NAV, 'LTP')).toEqual(at(before, 0, 'LTP'));
    expect(at(other, NAV, 'LHM')).toBeUndefined();
    expect(selectionOf(other)).toEqual(['LTP']);
  });
});
