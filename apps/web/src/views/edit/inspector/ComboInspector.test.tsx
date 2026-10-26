import { compileLayout, type Layout } from '@layerbench/core';
import { render, screen } from '@testing-library/react';
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

describe('a combo', () => {
  it('has no role to choose in the combo editor', () => {
    render(<ComboInspector state={state} send={vi.fn()} combo={0} />);
    expect(screen.queryByRole('combobox', { name: /^Role of combo/ })).toBeNull();
    expect(screen.getByLabelText('Timeout of combo LHI+LHM, in milliseconds')).toBeInTheDocument();
  });

  it('has a small board of its own in the strip of Combos, beside a card for a new one', () => {
    render(<CombosPanel state={state} send={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Edit LHI+LHM' })).toHaveTextContent('q');
    expect(screen.getByRole('button', { name: 'New combo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Role of/ })).toBeNull();
  });
});
