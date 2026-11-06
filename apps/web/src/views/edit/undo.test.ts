import {
  accentsCombo,
  type Binding,
  bundledLayout,
  compileLayout,
  getGeometryPreset,
  type Layout,
} from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { type EditAction, editReducer } from './reducer.js';
import { initialUndoState, type UndoState, undoable } from './undo.js';

/** Qwerty reaching Accents by a combo too, as a Special layout does, for an edit to combos. */
const layout: Layout = {
  ...(bundledLayout('qwerty') as Layout),
  combos: [accentsCombo('base', getGeometryPreset('3x5+2'))],
};
const reducer = undoable(editReducer);
const start = (): UndoState => initialUndoState(layout, compileLayout(layout));

/** A binding put on one key of the base layer, as typing on the key does. */
const bind = (keyId: string, binding: Binding): EditAction => ({
  type: 'edit',
  edit: { kind: 'bind', layer: 'base', keys: [keyId], binding },
});

const symbolAt = (state: UndoState, keyId: string): unknown =>
  state.layout.layers[0].bindings[keyId];

describe('undo', () => {
  it('takes back an edit and puts it forward again', () => {
    const before = start();
    const typed = reducer(before, bind('LHM', { kind: 'kp', symbol: 'ç' }));
    expect(symbolAt(typed, 'LHM')).toEqual({ kind: 'kp', symbol: 'ç' });

    const undone = reducer(typed, { type: 'undo' });
    expect(symbolAt(undone, 'LHM')).toEqual(symbolAt(before, 'LHM'));

    const redone = reducer(undone, { type: 'redo' });
    expect(symbolAt(redone, 'LHM')).toEqual({ kind: 'kp', symbol: 'ç' });
  });

  it('takes back the destructive gestures editing in place adds', () => {
    const before = start();
    const cleared = reducer(before, bind('LHM', { kind: 'none' }));
    expect(cleared.layout.layers[0].bindings.LHM).toEqual({ kind: 'none' });
    expect(symbolAt(reducer(cleared, { type: 'undo' }), 'LHM')).toEqual(symbolAt(before, 'LHM'));

    const copied = reducer(before, {
      type: 'dropKey',
      from: 'LHM',
      to: 'LHI',
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
    const typed = reducer(
      reducer(start(), { type: 'keyClick', keyId: 'LHM' }),
      bind('LHI', { kind: 'kp', symbol: 'ç' }),
    );
    expect(reducer(typed, { type: 'undo' }).selected).toBe('LHM');
  });

  it('ends a combo pick, which names a combo by a place the list may no longer have', () => {
    const removed = reducer(start(), { type: 'edit', edit: { kind: 'removeCombo', combo: 0 } });
    const picking = reducer(removed, { type: 'comboPickStart', combo: 0 });
    const undone = reducer(picking, { type: 'undo' });
    expect(undone).toMatchObject({ comboPick: null, comboPickFor: null });
    const redone = reducer(reducer(undone, { type: 'comboPickStart', combo: 0 }), { type: 'redo' });
    expect(redone).toMatchObject({ comboPick: null, comboPickFor: null });
  });

  it('drops the redo stack once a new edit lands', () => {
    const typed = reducer(start(), bind('LHM', { kind: 'kp', symbol: 'ç' }));
    const undone = reducer(typed, { type: 'undo' });
    expect(undone.future).toHaveLength(1);
    const elsewhere = reducer(undone, bind('LHI', { kind: 'kp', symbol: 'ã' }));
    expect(elsewhere.future).toHaveLength(0);
  });

  it('calls the layout unsaved exactly when it differs from the one saved', () => {
    const typed = reducer(start(), bind('LHM', { kind: 'kp', symbol: 'ç' }));
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
    const typed = reducer(start(), bind('LHM', { kind: 'kp', symbol: 'ç' }));
    const meanwhile = reducer(typed, bind('LHI', { kind: 'kp', symbol: 'ã' }));
    // The save that lands is of the layout before the second edit.
    const landed = reducer(meanwhile, { type: 'saved', layout: typed.layout });
    expect(landed.dirty).toBe(true);
    expect(reducer(landed, { type: 'undo' }).dirty).toBe(false);
  });

  it('discards the changes to the saved layout in one step that Undo takes back', () => {
    const typed = reducer(
      reducer(start(), bind('LHM', { kind: 'kp', symbol: 'ç' })),
      bind('LHI', { kind: 'kp', symbol: 'ã' }),
    );
    expect(typed.dirty).toBe(true);

    const discarded = reducer(typed, { type: 'discard' });
    expect(discarded.layout).toBe(layout);
    expect(discarded.dirty).toBe(false);
    expect(discarded.compiled.layers).toHaveLength(compileLayout(layout).layers.length);
    // One step, whatever the number of edits: one Undo brings them all back, unsaved.
    expect(discarded.past).toHaveLength(typed.past.length + 1);
    const undone = reducer(discarded, { type: 'undo' });
    expect(undone.layout).toBe(typed.layout);
    expect(undone.dirty).toBe(true);
    expect(reducer(undone, { type: 'redo' }).dirty).toBe(false);
  });

  it('discards back to the last save, not to the layout as it was opened', () => {
    const typed = reducer(start(), bind('LHM', { kind: 'kp', symbol: 'ç' }));
    const saved = reducer(typed, { type: 'saved', layout: typed.layout });
    const more = reducer(saved, bind('LHI', { kind: 'kp', symbol: 'ã' }));
    const discarded = reducer(more, { type: 'discard' });
    expect(discarded.layout).toBe(typed.layout);
    expect(discarded.dirty).toBe(false);
  });

  it('has nothing to discard to when the layout is clean or its edits were unsaved from the start', () => {
    const clean = start();
    expect(reducer(clean, { type: 'discard' })).toBe(clean);
    // A draft brought back from the link: unsaved, and no saved layout to go back to.
    const draft = { ...reducer(start(), bind('LHM', { kind: 'kp', symbol: 'ç' })), saved: null };
    expect(reducer(draft, { type: 'discard' })).toBe(draft);
  });

  it('keeps the keys selected that the saved layout still has when it discards', () => {
    const typed = reducer(
      reducer(start(), { type: 'keyClick', keyId: 'LHM' }),
      bind('LHM', { kind: 'kp', symbol: 'ç' }),
    );
    expect(typed.selected).toBe('LHM');
    const discarded = reducer(typed, { type: 'discard' });
    expect(discarded.selected).toBe('LHM');
    expect(discarded.lastEdit).toBeNull();
  });

  it('names the layout after its copy once saved, as one edit that Undo takes back as unsaved', () => {
    const before = start();
    const copy = { ...before.layout, name: 'Mine' };
    const saved = reducer(before, { type: 'savedAs', from: before.layout, layout: copy });
    expect(saved.layout.name).toBe('Mine');
    expect(saved.dirty).toBe(false);
    expect(saved.past).toHaveLength(before.past.length + 1);

    const undone = reducer(saved, { type: 'undo' });
    expect(undone.layout.name).toBe(before.layout.name);
    expect(undone.dirty).toBe(true);
    expect(reducer(undone, { type: 'redo' }).dirty).toBe(false);
  });

  it('keeps an edit made while a copy was being saved unsaved', () => {
    const before = start();
    const copy = { ...before.layout, name: 'Mine' };
    const meanwhile = reducer(before, bind('LHM', { kind: 'kp', symbol: 'ç' }));
    const saved = reducer(meanwhile, { type: 'savedAs', from: before.layout, layout: copy });
    expect(saved.layout.name).toBe('Mine');
    expect(saved.dirty).toBe(true);
    expect(JSON.stringify(saved.layout)).toContain('ç');
  });

  it('keeps a name typed while a copy was being saved, unsaved', () => {
    const before = start();
    const copy = { ...before.layout, name: 'Mine' };
    const typed = reducer(before, { type: 'edit', edit: { kind: 'setMeta', name: 'Newer' } });
    const saved = reducer(typed, { type: 'savedAs', from: before.layout, layout: copy });
    expect(saved.layout.name).toBe('Newer');
    expect(saved.dirty).toBe(true);
  });

  it('keeps the history bounded', () => {
    let state = start();
    for (let i = 0; i < 60; i++) {
      state = reducer(state, bind('LHM', { kind: 'kp', symbol: String(i) }));
    }
    expect(state.past).toHaveLength(50);
  });

  it('records nothing for an edit that is refused, and says why', () => {
    const before = start();
    const refused = reducer(before, bind('LHM', { kind: 'mo', layer: 'nowhere' }));
    expect(refused.layout).toBe(before.layout);
    expect(refused.past).toHaveLength(0);
    expect(refused.dirty).toBe(false);
    expect(refused.error).toMatch(/nowhere/);
    expect(refused.lastEdit).toMatchObject({ status: 'refused' });
  });

  it('forgets the last edit on undo, so nothing reads it as just made', () => {
    const typed = reducer(start(), bind('LHM', { kind: 'kp', symbol: 'ç' }));
    expect(typed.lastEdit).toMatchObject({ status: 'landed', edit: { kind: 'bind' } });
    expect(reducer(typed, { type: 'undo' }).lastEdit).toBeNull();
  });
});
