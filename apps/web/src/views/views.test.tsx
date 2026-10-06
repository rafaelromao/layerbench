import { bundledLayout, toCanonicalJson } from '@layoutmaster/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AnalysisClient, AnalyzeRequest } from '../engine/protocol.js';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { LIBRARY, renderRoute, testClient } from '../test/render.js';

const QWERTY_TEXT = 'q w e r t y u i o p\na s d f g h j k l ;\nz x c v b n m , . /';

let counter = 0;

/** Each test gets its own database, so saved documents never leak between cases. */
function freshStorage(): IndexedDbAdapter {
  return new IndexedDbAdapter(`layoutmaster-view-${++counter}`);
}

describe('Library', () => {
  it('lists the bundled layouts', async () => {
    renderRoute(LIBRARY, { storage: freshStorage() });
    expect(await screen.findByRole('heading', { name: 'Layouts' })).toBeInTheDocument();
    expect(screen.getByText('Graphite')).toBeInTheDocument();
    expect(screen.getByText('Magic Romak')).toBeInTheDocument();
    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument();
  });

  it('previews a text layout as it is typed', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    await screen.findByRole('heading', { name: 'Layouts' });

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
    renderRoute('/compare?layout=magic-romak&b=graphite&corpus=pt-br-conv&sample=20000', {
      storage: freshStorage(),
    });

    expect(await screen.findByLabelText('Layout A')).toBeInTheDocument();
    expect(screen.getByLabelText('Layout B')).toBeInTheDocument();

    // The delta table only appears once both sides have finished.
    const table = await screen.findByRole('table', undefined, { timeout: 25_000 });
    expect(within(table).getByText('Δ (B − A)')).toBeInTheDocument();
    expect(within(table).getByText('Same finger bigrams')).toBeInTheDocument();
  });

  it('offers the saved layouts on both sides, as Analyze does', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const mine = { ...toCanonicalJson(bundledLayout('qwerty')!), id: 'mine', name: 'Mine' };
    await storage.put('layouts', 'mine', mine, { message: 'seed' });
    const { currentSearch } = renderRoute('/compare?layout=qwerty&b=graphite&sample=20000', {
      storage,
    });

    const a = await screen.findByLabelText('Layout A');
    await waitFor(() =>
      expect(within(a).getByRole('option', { name: 'Mine' })).toBeInTheDocument(),
    );
    const b = screen.getByLabelText('Layout B');
    expect(within(b).getByRole('option', { name: 'Mine' })).toHaveValue('saved:mine');

    // Each group is in alphabetical order.
    const names = (group: string) =>
      [...(a.querySelector(`optgroup[label="${group}"]`)?.children ?? [])].map(
        (o) => o.textContent,
      );
    const bundled = names('Bundled');
    expect(bundled).toEqual(
      [...bundled].sort((x, y) => x!.localeCompare(y!, 'en', { sensitivity: 'base' })),
    );

    await user.selectOptions(b, 'saved:mine');
    await waitFor(() => expect(currentSearch()).toContain('b=saved%3Amine'));
  });

  /** The engine, keeping every analysis it is asked for. */
  function recording(): { client: AnalysisClient; requests: AnalyzeRequest[] } {
    const real = testClient();
    const requests: AnalyzeRequest[] = [];
    const client = new Proxy(real, {
      get(target, prop) {
        if (prop === 'analyze') {
          return (...args: Parameters<AnalysisClient['analyze']>) => {
            requests.push(args[0]);
            return target.analyze(...args);
          };
        }
        const member = Reflect.get(target, prop);
        return typeof member === 'function' ? member.bind(target) : member;
      },
    });
    return { client, requests };
  }

  it('compares both layouts typed without the features left unticked', async () => {
    const user = userEvent.setup();
    const { client, requests } = recording();
    const { currentSearch } = renderRoute(
      '/compare?layout=magic-romak&b=graphite&corpus=pt-br-conv&sample=20000&off=macros',
      { client, storage: freshStorage() },
    );

    const macros = await screen.findByRole('checkbox', { name: 'Multi-letter macros' });
    expect(macros).not.toBeChecked();
    for (const name of ['Magic keys', 'Repeat key', 'Typing combos']) {
      expect(screen.getByRole('checkbox', { name })).toBeChecked();
    }
    expect(screen.getByRole('status')).toHaveTextContent(
      'Both layouts typed without multi-letter macros.',
    );
    const romak = () => requests.filter((r) => r.layout.name === 'Magic Romak');
    await waitFor(() => expect(romak()).not.toHaveLength(0));
    // `qu` is two letters in one press, and goes; an accent is one letter, and stays.
    expect(JSON.stringify(romak()[0].layout)).not.toContain('"symbols":"qu"');
    expect(JSON.stringify(romak()[0].layout)).toContain('"symbols":"é"');
    const analyzeA = screen.getByRole('link', { name: 'Analyze A' }) as HTMLAnchorElement;
    expect(analyzeA.href).toContain('off=macros');

    await user.click(macros);
    await waitFor(() => expect(currentSearch()).not.toContain('off='));
    expect(currentSearch()).toContain('b=graphite');
    expect(screen.queryByRole('status')).toBeNull();
    await waitFor(() =>
      expect(romak().some((r) => JSON.stringify(r.layout).includes('"symbols":"qu"'))).toBe(true),
    );

    await user.click(screen.getByRole('checkbox', { name: 'Magic keys' }));
    await waitFor(() => expect(currentSearch()).toContain('off=magic'));
    expect(currentSearch()).toContain('b=graphite');
  }, 60_000);
});

describe('Corpus', () => {
  it('lists the shipped corpora with their provenance', async () => {
    renderRoute('/corpus', { storage: freshStorage() });

    expect(await screen.findByText('Corpora')).toBeInTheDocument();
    // Every shipped corpus is offered: news from the Leipzig collection, and conversation.
    expect(await screen.findAllByText(/Leipzig/)).not.toHaveLength(0);
    expect(screen.getAllByText('English — conversational (OpenSubtitles)')).not.toHaveLength(0);
    expect(screen.getAllByText('Español — conversacional (OpenSubtitles)')).not.toHaveLength(0);
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
