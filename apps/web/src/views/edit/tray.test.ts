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

  it('is put down again by a second tap, Escape, or arming a swap', () => {
    const armed = reducer(start(), { type: 'armChar', char: 'ç' });
    expect(reducer(armed, { type: 'armChar', char: 'ç' }).placing).toBeNull();
    expect(reducer(armed, { type: 'armChar', char: 'ã' }).placing).toBe('ã');
    expect(reducer(armed, { type: 'cancelSwap' }).placing).toBeNull();

    const swapping = reducer(reducer(armed, { type: 'keyClick', keyId: 'LHM' }), {
      type: 'startSwap',
    });
    expect(swapping.placing).toBeNull();
    // A character armed takes the place of a swap armed: one tap, one meaning.
    const rearmed = reducer(swapping, { type: 'armChar', char: 'ç' });
    expect(rearmed.swapFrom).toBeNull();
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
