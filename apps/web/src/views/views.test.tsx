import { bundledLayout, toCanonicalJson } from '@layoutmaster/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { LIBRARY, renderRoute } from '../test/render.js';

const QWERTY_TEXT = 'q w e r t y u i o p\na s d f g h j k l ;\nz x c v b n m , . /';

let counter = 0;

/** Each test gets its own database, so saved documents never leak between cases. */
function freshStorage(): IndexedDbAdapter {
  return new IndexedDbAdapter(`layoutmaster-view-${++counter}`);
}

describe('Library', () => {
  it('lists the bundled layouts', async () => {
    renderRoute(LIBRARY, { storage: freshStorage() });
    expect(await screen.findByText('Bundled layouts')).toBeInTheDocument();
    expect(screen.getByText('Graphite')).toBeInTheDocument();
    expect(screen.getByText('Magic Romak')).toBeInTheDocument();
    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument();
  });

  it('previews a text layout as it is typed', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    await screen.findByText('Bundled layouts');

    // Pasted rather than typed key by key: what is under test is that the preview follows the text,
    // and forty keystrokes each re-rendering every bundled layout only measures the machine.
    await user.click(screen.getByLabelText('Layout to import'));
    await user.paste(QWERTY_TEXT);

    // The preview keyboard appears once the text parses.
    await waitFor(
      () => {
        expect(document.getElementById('kb-import')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
    expect(screen.getByRole('button', { name: 'Open in analyzer' })).toBeEnabled();
  });

  it('shows a layout saved earlier and offers to analyze it', async () => {
    const storage = freshStorage();
    const layout = bundledLayout('colemak-dh')!;
    await storage.put('layouts', 'my-romak', toCanonicalJson({ ...layout, name: 'My Romak' }));

    renderRoute(LIBRARY, { storage });

    expect(await screen.findByText('My Romak')).toBeInTheDocument();
    const card = screen.getByText('My Romak').closest('article') as HTMLElement;
    expect(within(card).getByRole('link', { name: 'Analyze' })).toHaveAttribute(
      'href',
      expect.stringContaining('saved%3Amy-romak'),
    );
  });
});

describe('Compare', () => {
  it('analyzes both layouts and ranks each metric', async () => {
    renderRoute('/compare?layout=magic-romak&b=graphite&corpus=pt-br-work&sample=20000', {
      storage: freshStorage(),
    });

    expect(await screen.findByLabelText('Layout A')).toBeInTheDocument();
    expect(screen.getByLabelText('Layout B')).toBeInTheDocument();

    // The delta table only appears once both sides have finished.
    const table = await screen.findByRole('table', undefined, { timeout: 25_000 });
    expect(within(table).getByText('Δ (B − A)')).toBeInTheDocument();
    expect(within(table).getByText('Same finger bigrams')).toBeInTheDocument();
  });
});

describe('Corpus', () => {
  it('lists the shipped corpora with their provenance', async () => {
    renderRoute('/corpus', { storage: freshStorage() });

    expect(await screen.findByText('Corpora')).toBeInTheDocument();
    // All four shipped corpora are offered, two of them from the Leipzig collection.
    expect(await screen.findAllByText(/Leipzig/)).not.toHaveLength(0);
    expect(screen.getByText('English — work chat/email (Romak)')).toBeInTheDocument();
    // Facts are counted over a sample of the selected corpus.
    expect(await screen.findByText('Letters', undefined, { timeout: 25_000 })).toBeInTheDocument();
    expect(screen.getByText('Trigrams')).toBeInTheDocument();
  });

  it('refuses a custom corpus that is too short', async () => {
    const user = userEvent.setup();
    renderRoute('/corpus', { storage: freshStorage() });
    await screen.findByText('Custom corpus');

    await user.type(screen.getByLabelText('Corpus text'), 'too short');
    await user.click(screen.getByRole('button', { name: 'Build corpus' }));

    expect(await screen.findByText(/at least 1,000 characters/)).toBeInTheDocument();
  });
});
