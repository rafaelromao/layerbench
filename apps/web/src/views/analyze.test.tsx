import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render.js';

/**
 * The Analyze view, exercised the way the reference implementation's own tests exercise it: a real
 * analysis over a small sample, then the numbers and the typing trace it produces.
 */
describe('Analyze', () => {
  it('renders Magic Romak and completes the analysis', async () => {
    renderRoute('/analyze?layout=magic-romak&corpus=pt-br-conv&sample=20000');

    // Layer tabs come from the compiled layout, so they appear before any analysis finishes.
    expect(await screen.findByRole('tab', { name: 'Alpha 1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Ç extension' })).toBeInTheDocument();

    expect(await screen.findByText('Same finger bigrams')).toBeInTheDocument();
    expect(screen.getByText('Layer taps per 100 symbols')).toBeInTheDocument();
    expect(screen.getByText('all symbols producible')).toBeInTheDocument();
  });

  it('explains how a word is typed', async () => {
    const user = userEvent.setup();
    renderRoute('/analyze?layout=magic-romak&corpus=pt-br-conv&sample=20000');
    await screen.findByText('Same finger bigrams');

    await user.type(screen.getByLabelText('How is this typed?'), 'ação');

    expect(await screen.findByText('4 presses')).toBeInTheDocument();
    // The trace names the keys pressed, in order.
    for (const key of ['RHM', 'R0', 'LBM', 'LHI']) {
      expect(screen.getByText(key)).toBeInTheDocument();
    }
  });

  it('plays a word on the board, press by press, on the layer each press lands on', async () => {
    const user = userEvent.setup();
    renderRoute('/analyze?layout=magic-romak&corpus=pt-br-conv&sample=20000');
    await screen.findByText('Same finger bigrams');
    await user.type(screen.getByLabelText('How is this typed?'), 'ação');

    // It starts on its own.
    const presses = await screen.findByRole('list', { name: 'Presses' });
    expect(await within(presses).findByRole('button', { current: 'step' })).toBeInTheDocument();

    // Stepping to the ç stops it there, on Alpha 2, with that key pressed.
    await user.click(within(presses).getByRole('button', { name: /LBM/ }));
    expect(screen.getByRole('button', { name: '▶ Play' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Alpha 2', selected: true })).toBeInTheDocument();
    const key = screen.getByRole('button', { name: /^Key LBM:/ });
    expect(key.querySelector('.lm-key-pressed')).not.toBeNull();
    // The board shows the press, not a path of arrows.
    expect(document.querySelectorAll('#kb-analyze .lm-arc path')).toHaveLength(0);
  });

  it('shows the combos that type, and lights one as it is played', async () => {
    const user = userEvent.setup();
    renderRoute('/analyze?layout=magic-romak&corpus=pt-br-conv&sample=20000');
    await screen.findByText('Same finger bigrams');
    await user.type(screen.getByLabelText('How is this typed?'), 'à');

    const presses = await screen.findByRole('list', { name: 'Presses' });
    await user.click(within(presses).getByRole('button', { name: /RHM\+RHR/ }));
    const names = () =>
      [...document.querySelectorAll('#kb-analyze .lm-combo title')].map((t) => t.textContent);
    expect(names()).toEqual(['Combo RHI + RHM: ?', 'Combo RBI + RBM: !', 'Combo RHM + RHR: à']);
    const lit = document.querySelector('#kb-analyze .lm-combo-active title');
    expect(lit?.textContent).toBe('Combo RHM + RHR: à');

    // Hidden, the combos give way, except the one being played.
    await user.click(screen.getByLabelText('Show the combos that type'));
    expect(names()).toEqual(['Combo RHM + RHR: à']);
  });

  it('keeps the link canonical as parameters change', async () => {
    const user = userEvent.setup();
    const { currentSearch } = renderRoute('/analyze?layout=qwerty&corpus=en-conv&sample=20000');
    await screen.findByText('Same finger bigrams');

    await user.selectOptions(screen.getByLabelText('Sample size'), '100000');

    await waitFor(() => {
      expect(currentSearch()).toContain('sample=100000');
    });
    // Defaults never appear in the link, and keys stay in a stable order.
    expect(currentSearch()).toBe('?corpus=en-conv&layout=qwerty&sample=100000');
  });

  it('analyzes a layout without the features a Library link leaves out', async () => {
    const user = userEvent.setup();
    const { currentSearch } = renderRoute(
      '/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000&off=macros',
    );
    await screen.findByText('Same finger bigrams');
    expect(screen.getByRole('status')).toHaveTextContent('Typed without multi-letter macros.');

    // `qu` is one press with the macro; without it, `q` and then `u`.
    await user.type(screen.getByLabelText('How is this typed?'), 'qu');
    expect(await screen.findByText('3 presses')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Use every feature' }));
    await waitFor(() => expect(currentSearch()).not.toContain('off='));
    expect(await screen.findByText('2 presses')).toBeInTheDocument();
  });

  it('switches features off from its own bar, as the Library and Compare do', async () => {
    const user = userEvent.setup();
    const { currentSearch } = renderRoute(
      '/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000',
    );
    await screen.findByText('Same finger bigrams');
    const switches = screen.getByRole('group', { name: 'Analyze with' });
    const macros = within(switches).getByRole('checkbox', { name: 'Multi-letter macros' });
    expect(macros).toBeChecked();

    await user.click(macros);
    await waitFor(() => expect(currentSearch()).toContain('off=macros'));
    expect(screen.getByRole('status')).toHaveTextContent('Typed without multi-letter macros.');
    await user.type(screen.getByLabelText('How is this typed?'), 'qu');
    expect(await screen.findByText('3 presses')).toBeInTheDocument();
  });

  it('shows the metrics for a single-layer layout without layer costs', async () => {
    renderRoute('/analyze?layout=qwerty&corpus=en-conv&sample=20000');
    await screen.findByText('Same finger bigrams');

    const strip = screen.getByRole('list', { name: 'Summary metrics' });
    expect(strip).toBeInTheDocument();
    // Qwerty never leaves its base layer.
    expect(screen.getByText('Layer taps per 100 symbols')).toBeInTheDocument();
  });
});
