import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render.js';

/**
 * The Analyze view, exercised the way the reference implementation's own tests exercise it: a real
 * analysis over a small sample, then the numbers and the typing trace it produces.
 */
describe('Analyze', () => {
  it('renders Magic Romak and completes the analysis', async () => {
    renderRoute('/?layout=magic-romak&corpus=pt-br-work&sample=20000');

    // Layer tabs come from the compiled layout, so they appear before any analysis finishes.
    expect(await screen.findByRole('tab', { name: 'Alpha 1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Ç extension' })).toBeInTheDocument();

    expect(await screen.findByText('Same finger bigrams')).toBeInTheDocument();
    expect(screen.getByText('Layer taps per 100 symbols')).toBeInTheDocument();
    expect(screen.getByText('all symbols producible')).toBeInTheDocument();
  });

  it('explains how a word is typed', async () => {
    const user = userEvent.setup();
    renderRoute('/?layout=romak-24&corpus=pt-br-work&sample=20000');
    await screen.findByText('Same finger bigrams');

    await user.type(screen.getByLabelText('How is this typed?'), 'ação');

    expect(await screen.findByText('4 presses')).toBeInTheDocument();
    // The trace names the keys pressed, in order.
    for (const key of ['RHM', 'R0', 'LBM', 'LHI']) {
      expect(screen.getByText(key)).toBeInTheDocument();
    }
  });

  it('keeps the link canonical as parameters change', async () => {
    const user = userEvent.setup();
    const { currentSearch } = renderRoute('/?layout=qwerty&corpus=en-work&sample=20000');
    await screen.findByText('Same finger bigrams');

    await user.selectOptions(screen.getByLabelText('Sample size'), '100000');

    await waitFor(() => {
      expect(currentSearch()).toContain('sample=100000');
    });
    // Defaults never appear in the link, and keys stay in a stable order.
    expect(currentSearch()).toBe('?corpus=en-work&layout=qwerty&sample=100000');
  });

  it('shows the metrics for a single-layer layout without layer costs', async () => {
    renderRoute('/?layout=qwerty&corpus=en-work&sample=20000');
    await screen.findByText('Same finger bigrams');

    const strip = screen.getByRole('list', { name: 'Summary metrics' });
    expect(strip).toBeInTheDocument();
    // Qwerty never leaves its base layer.
    expect(screen.getByText('Layer taps per 100 symbols')).toBeInTheDocument();
  });
});
