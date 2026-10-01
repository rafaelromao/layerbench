import { bundledLayout, compileLayout, type Layout } from '@layoutmaster/core';
import { describe, expect, it } from 'vitest';
import { editReducer } from './reducer.js';
import { initialUndoState, type UndoState, undoable } from './undo.js';

const layout = bundledLayout('qwerty') as Layout;
const reducer = undoable(editReducer);
const start = (): UndoState => initialUndoState(layout, compileLayout(layout));

const symbolAt = (state: UndoState, keyId: string): unknown =>
  state.layout.layers[0].bindings[keyId];

describe('undo', () => {
  it('takes back an edit and puts it forward again', () => {
    const before = start();
    const typed = reducer(before, {
      type: 'commitBinding',
      keyId: 'LHM',
      binding: { kind: 'kp', symbol: 'ç' },
    });
    expect(symbolAt(typed, 'LHM')).toEqual({ kind: 'kp', symbol: 'ç' });

    const undone = reducer(typed, { type: 'undo' });
    expect(symbolAt(undone, 'LHM')).toEqual(symbolAt(before, 'LHM'));

    const redone = reducer(undone, { type: 'redo' });
    expect(symbolAt(redone, 'LHM')).toEqual({ kind: 'kp', symbol: 'ç' });
  });

  it('takes back the destructive gestures editing in place adds', () => {
    const before = start();
    const cleared = reducer(before, { type: 'clearKey', keyId: 'LHM' });
    expect('LHM' in cleared.layout.layers[0].bindings).toBe(false);
    expect(symbolAt(reducer(cleared, { type: 'undo' }), 'LHM')).toEqual(symbolAt(before, 'LHM'));

    const copied = reducer(before, {
      type: 'dropKey',
      from: 'LHM',
      to: { kind: 'key', keyId: 'LHI' },
      mode: 'copy',
    });
    expect(symbolAt(copied, 'LHI')).toEqual(symbolAt(before, 'LHM'));
    expect(symbolAt(reducer(copied, { type: 'undo' }), 'LHI')).toEqual(symbolAt(before, 'LHI'));
  });

  it('records nothing for an action that does not change the layout', () => {
    const selected = reducer(reducer(start(), { type: 'keyClick', keyId: 'LHM' }), {
      type: 'setPanel',
      panel: 'layers',
    });
    expect(selected.past).toHaveLength(0);
    expect(reducer(selected, { type: 'undo' })).toBe(selected);
  });

  it('restores where the user was, not only what the layout held', () => {
    const typed = reducer(reducer(start(), { type: 'keyClick', keyId: 'LHM' }), {
      type: 'commitBinding',
      keyId: 'LHI',
      binding: { kind: 'kp', symbol: 'ç' },
    });
    expect(reducer(typed, { type: 'undo' }).selected).toBe('LHM');
  });

  it('drops the redo stack once a new edit lands', () => {
    const typed = reducer(start(), {
      type: 'commitBinding',
      keyId: 'LHM',
      binding: { kind: 'kp', symbol: 'ç' },
    });
    const undone = reducer(typed, { type: 'undo' });
    expect(undone.future).toHaveLength(1);
    const elsewhere = reducer(undone, {
      type: 'commitBinding',
      keyId: 'LHI',
      binding: { kind: 'kp', symbol: 'ã' },
    });
    expect(elsewhere.future).toHaveLength(0);
  });

  it('calls the layout unsaved exactly when it differs from the one saved', () => {
    const typed = reducer(start(), {
      type: 'commitBinding',
      keyId: 'LHM',
      binding: { kind: 'kp', symbol: 'ç' },
    });
    expect(typed.dirty).toBe(true);

    // Saving is nothing to undo.
    const saved = reducer(typed, { type: 'saved', layout: typed.layout });
    expect(saved.dirty).toBe(false);
    expect(saved.layout).toBe(typed.layout);
    expect(saved.past).toHaveLength(typed.past.length);

    // Undoing past the save is a change the store does not have; redoing back to it is not.
    const undone = reducer(saved, { type: 'undo' });
    expect(undone.dirty).toBe(true);
    expect(reducer(undone, { type: 'redo' }).dirty).toBe(false);
  });

  it('keeps an edit made while a save was on its way unsaved', () => {
    const typed = reducer(start(), {
      type: 'commitBinding',
      keyId: 'LHM',
      binding: { kind: 'kp', symbol: 'ç' },
    });
    const meanwhile = reducer(typed, {
      type: 'commitBinding',
      keyId: 'LHI',
      binding: { kind: 'kp', symbol: 'ã' },
    });
    // The save that lands is of the layout before the second edit.
    const landed = reducer(meanwhile, { type: 'saved', layout: typed.layout });
    expect(landed.dirty).toBe(true);
    expect(reducer(landed, { type: 'undo' }).dirty).toBe(false);
  });

  it('keeps the history bounded', () => {
    let state = start();
    for (let i = 0; i < 60; i++) {
      state = reducer(state, {
        type: 'commitBinding',
        keyId: 'LHM',
        binding: { kind: 'kp', symbol: String(i) },
      });
    }
    expect(state.past).toHaveLength(50);
  });
});
