import { bundledLayout, compileLayout, type Layout } from '@layerbench/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LegendButton } from './LegendDialog.js';

const romak = compileLayout(bundledLayout('magic-romak') as Layout);
const qwerty = compileLayout(bundledLayout('qwerty') as Layout);
const symbols = romak.layers.findIndex((l) => l.name === 'Symbols');

describe('the Legend’s button and popup', () => {
  it('is off while there is no board to list the keys of', () => {
    render(<LegendButton legends={[]} />);
    expect(screen.getByRole('button', { name: 'Legend' })).toBeDisabled();
  });

  it('puts nothing on the page until it is opened, and a button that opens a dialog', () => {
    render(<LegendButton legends={[{ compiled: romak, layer: 0 }]} />);
    const button = screen.getByRole('button', { name: 'Legend' });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).not.toHaveAttribute('aria-expanded');
    expect(screen.queryByRole('dialog', { name: 'Legend' })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Key legend' })).toBeNull();
  });

  it('lists the numbered keys of the layer the board shows, and closes by its button', async () => {
    const user = userEvent.setup();
    render(<LegendButton legends={[{ compiled: romak, layer: symbols }]} />);
    await user.click(screen.getByRole('button', { name: 'Legend' }));
    const popup = await screen.findByRole('dialog', { name: 'Legend' });
    // One board: no heading for a layout, and its list is the layer's own.
    expect(within(popup).queryByRole('heading', { level: 3 })).toBeNull();
    const list = within(popup).getByRole('list', { name: 'Key legend' });
    expect(list.textContent).toContain('to reach');
    // Focus is on Close, not on a list that takes no input.
    expect(within(popup).getByRole('button', { name: 'Close' })).toHaveFocus();

    await user.click(within(popup).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Legend' })).toBeNull();
  });

  it('lists each side of two boards under its layout and layer, side by side', async () => {
    const user = userEvent.setup();
    render(
      <LegendButton
        legends={[
          { title: 'A: Magic Romak', compiled: romak, layer: symbols },
          { title: 'B: Qwerty', compiled: qwerty, layer: 0 },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Legend' }));
    const popup = await screen.findByRole('dialog', { name: 'Legend' });
    expect(within(popup).getByRole('heading', { level: 3, name: 'A: Magic Romak · Symbols' }));
    const sideB = within(popup).getByRole('region', { name: 'Legend of B: Qwerty' });
    // Qwerty's keys all fit their labels: its part says so instead of an empty list.
    expect(within(sideB).getByText(/fits its label/)).toBeInTheDocument();
    expect(
      within(within(popup).getByRole('region', { name: 'Legend of A: Magic Romak' })).getByRole(
        'list',
        { name: 'Key legend' },
      ),
    ).toBeInTheDocument();
  });

  it('opens again after it is closed', async () => {
    const user = userEvent.setup();
    render(<LegendButton legends={[{ compiled: romak, layer: 0 }]} />);
    for (let i = 0; i < 2; i++) {
      await user.click(screen.getByRole('button', { name: 'Legend' }));
      const popup = await screen.findByRole('dialog', { name: 'Legend' });
      await user.click(within(popup).getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('dialog', { name: 'Legend' })).toBeNull();
    }
  });
});
