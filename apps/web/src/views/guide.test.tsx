import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render.js';

const section = (name: string) =>
  screen.getByRole('heading', { name }).closest('details') as HTMLDetailsElement;

describe('Guide', () => {
  it('opens on the few steps everyone needs, with every topic folded under them', async () => {
    renderRoute('/guide');
    expect(await screen.findByRole('heading', { level: 1, name: 'Guide' })).toBeInTheDocument();
    expect(screen.getByText(/Pick a layout\./)).toBeVisible();

    expect(section('Reading the numbers').open).toBe(false);
    expect(screen.getByText(/how hard the keys are to reach, averaged/)).not.toBeVisible();

    const pages = within(screen.getByRole('navigation', { name: 'Guide pages' }));
    expect(pages.getByRole('link', { name: 'Start here' })).toHaveAttribute('aria-current', 'page');
    expect(pages.getByRole('link', { name: 'Metric glossary' })).toBeInTheDocument();
  });

  it('opens a section, and the one around it, when a link leads to it', async () => {
    renderRoute('/guide/editing#which-layer-wins');
    await screen.findByRole('heading', { level: 1, name: 'Editing a layout' });
    await waitFor(() => expect(section('Which layer wins').open).toBe(true));
    expect(section('Layers').open).toBe(true);
    expect(section('On a phone').open).toBe(false);
  });

  it('opens and closes every section at once', async () => {
    const user = userEvent.setup();
    renderRoute('/guide/special-keys');
    await screen.findByRole('heading', { level: 1, name: 'Special keys' });
    await user.click(screen.getByRole('button', { name: 'Open every section' }));
    expect(section('Adaptive keys').open).toBe(true);
    expect(section('Which branch wins').open).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Close them all' }));
    expect(section('Adaptive keys').open).toBe(false);
  });

  it('follows a link to another page without leaving the app', async () => {
    const user = userEvent.setup();
    renderRoute('/guide/analyzing');
    await screen.findByRole('heading', { level: 1, name: 'Analyzing a layout' });
    await user.click(screen.getByRole('button', { name: 'Open every section' }));
    await user.click(screen.getAllByRole('link', { name: 'metric glossary' })[0]);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Metric glossary' }),
    ).toBeInTheDocument();
  });

  it('says so when a page does not exist', async () => {
    renderRoute('/guide/nowhere');
    expect(await screen.findByRole('heading', { name: 'No such page' })).toBeInTheDocument();
    expect(screen.getByText('nowhere')).toBeInTheDocument();
  });
});

describe('Help from the views', () => {
  it('opens the part of the guide about a panel, in a tab of its own', async () => {
    const user = userEvent.setup();
    renderRoute('/analyze?layout=qwerty&sample=10000');
    const help = await screen.findByRole('link', { name: 'Help on layers (opens in a new tab)' });
    expect(help).toHaveAttribute('href', '/guide/editing#layers');
    expect(help).toHaveAttribute('target', '_blank');

    // It follows the panel that is open.
    await user.click(screen.getByRole('tab', { name: 'JSON' }));
    expect(
      screen.getByRole('link', { name: 'Help on exporting (opens in a new tab)' }),
    ).toHaveAttribute('href', '/guide/importing#exporting');
  }, 30_000);
});
