import { compileLayout, type Layout } from '@layerbench/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CombosPanel } from '../panels.js';
import { initialState } from '../reducer.js';
import { ComboInspector } from './ComboInspector.js';

/** A layout whose one combo names no role, which is a typing one. */
const layout: Layout = {
  format: 'layerbench/layout@1',
  name: 'T',
  geometry: { preset: '3x5+2' },
  keys: { space: 'R0' },
  layers: [{ id: 'base', bindings: {} }],
  combos: [{ id: 'q', keys: ['LHI', 'LHM'], binding: { kind: 'kp', symbol: 'q' } }],
};
const state = initialState(layout, compileLayout(layout));

describe('a combo', () => {
  it('has a box to tick for the analysis to type with it, ticked when it names no role', async () => {
    const send = vi.fn();
    render(<ComboInspector state={state} send={send} combo={0} />);
    expect(screen.queryByRole('combobox', { name: /^Role of combo/ })).toBeNull();
    expect(screen.getByLabelText('Timeout of combo LHI+LHM, in milliseconds')).toBeInTheDocument();
    const typing = screen.getByRole('checkbox', { name: 'Combo LHI+LHM is used for typing' });
    expect(typing).toBeChecked();
    await userEvent.setup().click(typing);
    expect(send).toHaveBeenCalledWith({
      type: 'edit',
      edit: { kind: 'updateCombo', combo: 0, role: 'command' },
    });
  });

  it('is a command when its role says so: unticked, and ticked again to type', async () => {
    const asCommand: Layout = {
      ...layout,
      combos: [
        { ...(layout.combos?.[0] as NonNullable<Layout['combos']>[number]), role: 'command' },
      ],
    };
    const send = vi.fn();
    render(
      <ComboInspector
        state={initialState(asCommand, compileLayout(asCommand))}
        send={send}
        combo={0}
      />,
    );
    const typing = screen.getByRole('checkbox', { name: 'Combo LHI+LHM is used for typing' });
    expect(typing).not.toBeChecked();
    await userEvent.setup().click(typing);
    expect(send).toHaveBeenCalledWith({
      type: 'edit',
      edit: { kind: 'updateCombo', combo: 0, role: 'typing' },
    });
  });

  it('has a small board of its own in the strip of Combos, beside a card for a new one', () => {
    render(<CombosPanel state={state} send={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Edit LHI+LHM' })).toHaveTextContent('q');
    expect(screen.getByRole('button', { name: 'New combo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Role of/ })).toBeNull();
  });

  it('says on its card in the strip that it is not typed, when it is a command', () => {
    const asCommand: Layout = {
      ...layout,
      combos: [
        { ...(layout.combos?.[0] as NonNullable<Layout['combos']>[number]), role: 'command' },
      ],
    };
    const typing = render(<CombosPanel state={state} send={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Edit LHI+LHM' })).not.toHaveTextContent('not typed');
    typing.unmount();
    render(
      <CombosPanel state={initialState(asCommand, compileLayout(asCommand))} send={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Edit LHI+LHM' })).toHaveTextContent(
      'every layer · not typed',
    );
  });
});
