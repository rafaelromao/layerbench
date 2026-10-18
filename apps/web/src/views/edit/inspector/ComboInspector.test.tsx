import { compileLayout, type Layout } from '@layerbench/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CombosPanel } from '../panels.js';
import { initialState } from '../reducer.js';
import { ComboInspector } from './ComboInspector.js';

/** A layout from before roles were written: its one combo names none. */
const layout: Layout = {
  format: 'layerbench/layout@1',
  name: 'T',
  geometry: { preset: '3x5+2' },
  keys: { space: 'R0' },
  layers: [{ id: 'base', bindings: {} }],
  combos: [{ id: 'q', keys: ['LHI', 'LHM'], binding: { kind: 'kp', symbol: 'q' } }],
};
const state = initialState(layout, compileLayout(layout));

describe('a combo that names no role', () => {
  it('is a command in the combo editor, as the compiler reads it, and can be made a typing one', async () => {
    const send = vi.fn();
    render(<ComboInspector state={state} send={send} combo={0} />);
    const role = screen.getByRole('combobox', { name: 'Role of combo LHI+LHM' });
    expect(role).toHaveValue('command');
    await userEvent.setup().selectOptions(role, 'typing');
    expect(send).toHaveBeenCalledWith({
      type: 'edit',
      edit: { kind: 'updateCombo', combo: 0, role: 'typing' },
    });
  });

  it('is a command on its row in Combos', () => {
    render(<CombosPanel state={state} send={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Role of LHI+LHM: command. Switch it' }),
    ).toHaveTextContent('command');
  });
});
