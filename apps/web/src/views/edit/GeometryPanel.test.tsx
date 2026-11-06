import { compileLayout, type Layout } from '@layerbench/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GeometryPanel } from './panels.js';
import { initialState } from './reducer.js';

const layout: Layout = {
  format: 'layerbench/layout@1',
  name: 'T',
  geometry: { preset: '3x5+2' },
  keys: { space: 'R0' },
  layers: [{ id: 'base', bindings: { LHM: { kind: 'kp', symbol: 'a' } } }],
};
const state = initialState(layout, compileLayout(layout));

describe('the Physical Layout tab', () => {
  it('has the preset and the keys of the board, and nothing else to set', () => {
    render(<GeometryPanel state={state} send={vi.fn()} />);
    const items = within(screen.getByRole('list', { name: 'Physical layout' })).getAllByRole(
      'listitem',
    );
    expect(items.map((li) => li.querySelector('.lb-slide-title')?.textContent)).toEqual([
      'Preset',
      'Keys',
    ]);
    // Which keys are space and shift follows from the keys; how shift and doubled letters are typed
    // is in Typing paths, and how the one-shots end in Special Behaviors.
    for (const label of ['Space key', 'Shift key', 'Shift kind', 'Doubled letters']) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
    expect(screen.queryByRole('group', { name: /^One-shot/ })).toBeNull();
  });
});

describe('the board in the Physical Layout tab', () => {
  it('lets a key that does nothing go, and keeps one that does', async () => {
    const send = vi.fn();
    render(<GeometryPanel state={state} send={send} />);
    expect(screen.getByRole('button', { name: 'Remove key LHM' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    // A key in use stays, and says why where it can be read.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove key R0' }));
    expect(screen.getByRole('status')).toHaveTextContent('R0 stays: it is the space key');
    expect(send).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove key RHP' }));
    const edit = send.mock.calls[0][0].edit;
    expect(edit.kind).toBe('setGeometry');
    expect(edit.geometry.custom.map((k: { id: string }) => k.id)).not.toContain('RHP');
  });

  it('offers a place for a key the board lacks, and another preset', async () => {
    const send = vi.fn();
    render(<GeometryPanel state={state} send={send} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add key LHO' }));
    expect(send.mock.calls[0][0].edit.geometry.custom.map((k: { id: string }) => k.id)).toContain(
      'LHO',
    );
    await userEvent.setup().selectOptions(screen.getByLabelText('Physical layout preset'), '3x5+3');
    expect(send).toHaveBeenLastCalledWith({
      type: 'edit',
      edit: { kind: 'setGeometry', geometry: { preset: '3x5+3' } },
    });
  });
});
