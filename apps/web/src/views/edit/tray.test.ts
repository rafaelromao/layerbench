import { CLASSIC_LAYOUTS, compileLayout, type Layout, producibleSymbols } from '@layerbench/core';
import { describe, expect, it } from 'vitest';
import { type EditAction, editReducer } from './reducer.js';
import { missingKeys } from './tray.js';
import { initialUndoState, type UndoState, undoable } from './undo.js';

const reducer = undoable(editReducer);
/** Qwerty as written, with no way to the accents: `ç` is not on it. */
const qwerty = CLASSIC_LAYOUTS.find((l) => l.id === 'qwerty') as Layout;
const start = (): UndoState => initialUndoState(qwerty, compileLayout(qwerty));

const at = (state: UndoState, keyId: string) => state.layout.layers[0].bindings[keyId];

/** The tray of `state`, for a text whose missing characters are `unproducible`. */
const trayOf = (state: UndoState, unproducible: [string, number][] = [['ç', 40]]) =>
  missingKeys({
    unproducible,
    required: [],
    strays: state.strays,
    producible: producibleSymbols(state.compiled),
  }).map((c) => c.char);

const place = (keyId: string, char: string): EditAction => ({ type: 'placeChar', keyId, char });

describe('a character from the missing-keys tray', () => {
  it('replaces the binding of the key it is dropped on with a plain key press, as one edit', () => {
    const before = start();
    const placed = reducer(before, place('LHM', 'ç'));
    expect(at(placed, 'LHM')).toEqual({ kind: 'kp', symbol: 'ç' });
    expect(placed.past).toHaveLength(1);
    expect(placed.selected).toBe('LHM');

    const undone = reducer(placed, { type: 'undo' });
    expect(at(undone, 'LHM')).toEqual(at(before, 'LHM'));
    expect(undone.past).toHaveLength(0);
  });

  it('puts the character it displaces in the tray when nothing else types it', () => {
    const placed = reducer(start(), place('LHM', 'ç'));
    expect(trayOf(start())).toEqual(['ç']);
    expect(trayOf(placed)).toEqual(['d']);

    // Undo brings the old binding back, and the tray as it was.
    expect(trayOf(reducer(placed, { type: 'undo' }))).toEqual(['ç']);
  });

  it('leaves out a character displaced that another key still types', () => {
    const twice = reducer(start(), {
      type: 'edit',
      edit: { kind: 'bind', layer: 'base', keys: ['LHP'], binding: { kind: 'kp', symbol: 'd' } },
    });
    const placed = reducer(twice, place('LHM', 'ç'));
    expect(trayOf(placed)).toEqual([]);
  });

  it('is placed by tapping it and then a key', () => {
    const armed = reducer(start(), { type: 'armChar', char: 'ç' });
    expect(armed.placing).toBe('ç');
    expect(armed.past).toHaveLength(0);

    const placed = reducer(armed, { type: 'keyClick', keyId: 'LHM' });
    expect(at(placed, 'LHM')).toEqual({ kind: 'kp', symbol: 'ç' });
    expect(placed.placing).toBeNull();
    expect(placed.past).toHaveLength(1);
    expect(trayOf(placed)).toEqual(['d']);
  });

  it('is put down again by a second tap, Escape, arming a swap, or typing on a key', () => {
    const armed = reducer(start(), { type: 'armChar', char: 'ç' });
    expect(reducer(armed, { type: 'armChar', char: 'ç' }).placing).toBeNull();
    expect(reducer(armed, { type: 'armChar', char: 'ã' }).placing).toBe('ã');
    expect(reducer(armed, { type: 'cancelSwap' }).placing).toBeNull();

    // A key selected first, then a character armed: Alt+S swaps the key, the character goes down.
    const selected = reducer(start(), { type: 'keyClick', keyId: 'LHM' });
    const both = reducer(selected, { type: 'armChar', char: 'ç' });
    const swapping = reducer(both, { type: 'startSwap' });
    expect(swapping.placing).toBeNull();
    expect(swapping.swapFrom).toBe('LHM');
    expect(reducer(both, { type: 'typeOnKey', keyId: 'LHI', seed: 'x' }).placing).toBeNull();
    // A character armed takes the place of a swap armed: one tap, one meaning.
    const rearmed = reducer(swapping, { type: 'armChar', char: 'ç' });
    expect(rearmed.swapFrom).toBeNull();
  });

  it('is announced when tapped onto a key, a space by its name', () => {
    const armed = reducer(start(), { type: 'armChar', char: ' ' });
    const placed = reducer(armed, { type: 'keyClick', keyId: 'LHM' });
    expect(placed.lastEdit?.say).toBe('space on LHM');
  });

  it('is put down by an undo, whose layout may type it again', () => {
    const placed = reducer(start(), place('LHM', 'ç'));
    const armed = reducer(placed, { type: 'armChar', char: 'd' });
    const undone = reducer(armed, { type: 'undo' });
    expect(undone.placing).toBeNull();
    // The next key tapped is selected, not given a d.
    const tapped = reducer(undone, { type: 'keyClick', keyId: 'LHI' });
    expect(at(tapped, 'LHI')).toEqual(at(start(), 'LHI'));
    expect(tapped.selected).toBe('LHI');
  });

  it('ends a combo pick, and a combo pick puts it down', () => {
    const picking = reducer(start(), { type: 'comboPickStart' });
    const armed = reducer(picking, { type: 'armChar', char: 'ç' });
    expect(armed.comboPick).toBeNull();
    expect(reducer(armed, { type: 'comboPickStart' }).placing).toBeNull();
  });

  it('follows the layer on screen', () => {
    const added = reducer(start(), { type: 'edit', edit: { kind: 'addLayer', name: 'Num' } });
    const onNum = reducer(added, { type: 'selectLayer', layer: 1 });
    const placed = reducer(onNum, place('LHM', 'ç'));
    expect(placed.layout.layers[1].bindings.LHM).toEqual({ kind: 'kp', symbol: 'ç' });
    expect(at(placed, 'LHM')).toEqual(at(start(), 'LHM'));
  });
});

describe('the missing-keys tray', () => {
  const producible = new Set(['a', 'b']);

  it('lists the text first, most frequent first, then the letters a language needs, then strays', () => {
    const tray = missingKeys({
      unproducible: [
        ['ç', 40],
        ['ã', 12],
      ],
      required: ['ã', 'õ'],
      strays: ['d', 'ç'],
      producible,
    });
    expect(tray).toEqual([
      { char: 'ç', count: 40 },
      { char: 'ã', count: 12 },
      { char: 'õ' },
      { char: 'd' },
    ]);
  });

  it('keeps what a report of the layout as it is found missing, whatever its producers say', () => {
    // A character on a layer no key reaches has producers, but cannot be typed.
    const args = { unproducible: [['a', 3]] as [string, number][], required: [], strays: [] };
    expect(missingKeys({ ...args, producible, reportCurrent: true })).toEqual([
      { char: 'a', count: 3 },
    ]);
    // A report of the layout before an edit is checked against the layout now.
    expect(missingKeys({ ...args, producible, reportCurrent: false })).toEqual([]);
  });

  it('leaves out whatever the layout types now', () => {
    const tray = missingKeys({
      unproducible: [['a', 3]],
      required: ['b'],
      strays: ['c'],
      producible,
    });
    expect(tray).toEqual([{ char: 'c' }]);
  });
});
