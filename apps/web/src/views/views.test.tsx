import { bundledLayout, toCanonicalJson } from '@layerbench/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AnalysisClient, AnalyzeRequest } from '../engine/protocol.js';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { LIBRARY, openSettings, rankingSays, renderRoute, testClient } from '../test/render.js';

const QWERTY_TEXT = 'q w e r t y u i o p\na s d f g h j k l ;\nz x c v b n m , . /';
/** A text long enough to build a corpus from. */
const FOX = Array.from(
  { length: 30 },
  (_, i) => `The quick brown fox ${['jumps', 'leaps', 'runs'][i % 3]} over the lazy dog.`,
).join(' ');

let counter = 0;

/** Each test gets its own database, so saved documents never leak between cases. */
function freshStorage(): IndexedDbAdapter {
  return new IndexedDbAdapter(`layerbench-view-${++counter}`);
}

describe('Library', () => {
  it('lists the bundled layouts', async () => {
    renderRoute(LIBRARY, { storage: freshStorage() });
    expect(await screen.findByRole('heading', { name: 'Layouts' })).toBeInTheDocument();
    expect(screen.getByText('Graphite')).toBeInTheDocument();
    expect(screen.getByText('Magic Romak')).toBeInTheDocument();
    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument();
  });

  it('imports in a dialog of its own, not under the list', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    await screen.findByRole('heading', { name: 'Layouts' });
    const dialog = screen
      .getByRole('heading', { hidden: true, name: 'Import a layout' })
      .closest('dialog') as HTMLDialogElement;
    expect(dialog).not.toHaveAttribute('open');

    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(dialog).toHaveAttribute('open');
    expect(within(dialog).getByRole('tab', { name: 'Text or JSON', selected: true })).toBeVisible();
    await user.click(within(dialog).getByRole('tab', { name: 'keymap-drawer' }));
    expect(within(dialog).getByLabelText('keymap-drawer YAML')).toBeVisible();
    expect(within(dialog).queryByLabelText('Layout to import')).not.toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(dialog).not.toHaveAttribute('open');
  });

  it('previews a text layout as it is typed', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    await screen.findByRole('heading', { name: 'Layouts' });
    await user.click(screen.getByRole('button', { name: 'Import' }));

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
    renderRoute('/compare?layout=magic-romak&b=graphite&corpus=pt-br-general&sample=20000', {
      storage: freshStorage(),
    });

    expect(await screen.findByLabelText('Layout A')).toBeInTheDocument();
    expect(screen.getByLabelText('Layout B')).toBeInTheDocument();

    // The delta table only appears once both sides have finished.
    const table = await screen.findByRole('table', undefined, { timeout: 25_000 });
    expect(within(table).getByText('Δ (B − A)')).toBeInTheDocument();
    expect(within(table).getByText('Same finger bigrams')).toBeInTheDocument();
  });

  it('shows every layer of each layout, one at a time', async () => {
    const user = userEvent.setup();
    renderRoute('/compare?layout=magic-romak&b=graphite&corpus=pt-br-general&sample=20000', {
      storage: freshStorage(),
    });
    const tabsA = await screen.findByRole('tablist', { name: 'Layers of A' });
    expect(
      within(tabsA)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['Alpha 1', 'Alpha 2', 'Ç extension', 'Numbers', 'Symbols', 'Dead keys']);
    // Graphite's own layer, then the default ones every bundled layout has.
    const tabsB = screen.getByRole('tablist', { name: 'Layers of B' });
    expect(
      within(tabsB)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['Base', 'Numbers', 'Symbols', 'Dead keys']);

    const boardA = () => document.getElementById('kb-A')?.textContent ?? '';
    expect(boardA()).not.toContain('qu');
    await user.click(within(tabsA).getByRole('tab', { name: 'Alpha 2' }));
    expect(within(tabsA).getByRole('tab', { name: 'Alpha 2', selected: true })).toBeInTheDocument();
    expect(boardA()).toContain('qu');
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
      '/compare?layout=magic-romak&b=graphite&corpus=pt-br-general&sample=20000&off=macros',
      { client, storage: freshStorage() },
    );

    const settings = await openSettings();
    const macros = within(settings).getByRole('checkbox', { name: 'Multi-letter macros' });
    expect(macros).not.toBeChecked();
    for (const name of ['Adaptive keys', 'Repeat key', 'Typing combos']) {
      expect(within(settings).getByRole('checkbox', { name })).toBeChecked();
    }
    expect(screen.getByRole('status')).toHaveTextContent(
      'Both layouts typed without multi-letter macros.',
    );
    const romak = () => requests.filter((r) => r.layout.name === 'Magic Romak');
    await waitFor(() => expect(romak()).not.toHaveLength(0));
    // Both go as written, and the engine types them without their multi-letter macros.
    expect(romak()[0].settings.without).toEqual(['macros']);
    expect(requests.every((r) => r.settings.without.join() === 'macros')).toBe(true);
    const analyzeA = screen.getByRole('link', { name: 'Analyze A' }) as HTMLAnchorElement;
    expect(analyzeA.href).toContain('off=macros');
    // Either layout opens in Analyze, typed as it was compared.
    const analyzeB = screen.getByRole('link', { name: 'Analyze B' }) as HTMLAnchorElement;
    expect(analyzeB.href).toContain('layout=graphite');
    expect(analyzeB.href).toContain('off=macros');
    expect(analyzeB.href).not.toContain('b=');

    await user.click(macros);
    await waitFor(() => expect(currentSearch()).not.toContain('off='));
    expect(currentSearch()).toContain('b=graphite');
    expect(screen.queryByRole('status')).toBeNull();
    await waitFor(() => expect(romak().some((r) => r.settings.without.length === 0)).toBe(true));

    await user.click(screen.getByRole('checkbox', { name: 'Adaptive keys' }));
    await waitFor(() => expect(currentSearch()).toContain('off=adaptive'));
    expect(currentSearch()).toContain('b=graphite');
  }, 60_000);
});

describe('Corpus', () => {
  it('lists the shipped corpora with their provenance', async () => {
    renderRoute('/corpus', { storage: freshStorage() });

    expect(await screen.findByText('Corpora')).toBeInTheDocument();
    // Every shipped corpus is offered: news from the Leipzig collection, one per language.
    expect(await screen.findAllByText(/Leipzig/)).not.toHaveLength(0);
    expect(screen.getAllByText('English — news 2023 (Leipzig)')).not.toHaveLength(0);
    expect(screen.getAllByText('Español — noticias 2023 (Leipzig)')).not.toHaveLength(0);
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

  it('saves a text, lists it with the saved texts, and opens it again', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const { currentSearch } = renderRoute('/corpus', { storage });
    await screen.findByText('Custom corpus');

    await user.clear(screen.getByLabelText('Corpus name'));
    await user.type(screen.getByLabelText('Corpus name'), 'My notes');
    await user.click(screen.getByLabelText('Corpus text'));
    await user.paste(FOX);
    await user.click(screen.getByRole('button', { name: 'Build corpus' }));
    await user.click(await screen.findByRole('button', { name: 'Save to library' }));
    expect(await screen.findByText('Saved corpus my-notes')).toBeInTheDocument();
    expect(await storage.get('corpora', 'my-notes')).not.toBeNull();

    const heading = await screen.findByRole('heading', { name: 'Saved texts' });
    const saved = heading.nextElementSibling as HTMLElement;
    await user.click(within(saved).getByRole('button', { name: /My notes/ }));
    await waitFor(() => expect(currentSearch()).toContain('id=saved%3Amy-notes'));
    const card = (await screen.findByRole('heading', { name: 'My notes' })).closest(
      'section',
    ) as HTMLElement;
    // Read back from storage, it has its size, its letters, and a way to analyze on it.
    expect(await within(card).findByText(/words · [\d,]+ symbols/)).toBeInTheDocument();
    expect(
      await within(card).findByText('Letters', undefined, { timeout: 25_000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Analyze with this corpus' })).toHaveAttribute(
      'href',
      expect.stringContaining('corpus=saved%3Amy-notes'),
    );
  });

  it('says so when a link names a saved text this browser does not have', async () => {
    renderRoute('/corpus?id=saved%3Anowhere', { storage: freshStorage() });
    expect(await screen.findByRole('alert')).toHaveTextContent('There is no saved text nowhere');
  });
});

describe('Saved texts in the pickers', () => {
  /** A text saved as the Corpus view saves one. */
  async function savedText(): Promise<IndexedDbAdapter> {
    const storage = freshStorage();
    const engine = testClient();
    const built = await engine.buildCustomCorpus(FOX, 'My notes', 'en');
    await storage.put('corpora', 'my-notes', await engine.corpusDocument(built.id));
    return storage;
  }

  it('offers them in Analyze, on their own, and analyzes on the one picked', async () => {
    const user = userEvent.setup();
    const recorded: AnalyzeRequest[] = [];
    const engine = testClient();
    const client: AnalysisClient = new Proxy(engine, {
      get(target, prop) {
        const member = Reflect.get(target, prop);
        if (prop !== 'analyze' || typeof member !== 'function') return member;
        return (request: AnalyzeRequest, opts: unknown) => {
          recorded.push(request);
          return member.call(target, request, opts);
        };
      },
    });
    const { currentSearch } = renderRoute('/analyze?layout=qwerty&corpus=en-general&sample=20000', {
      client,
      storage: await savedText(),
    });
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    const corpus = within(await openSettings()).getByRole('combobox', { name: 'Corpus' });
    const option = await within(corpus).findByRole('option', { name: 'My notes' });
    expect(option.closest('optgroup')).toHaveAttribute('label', 'Saved texts');

    await user.selectOptions(corpus, 'saved:my-notes');
    await waitFor(() => expect(currentSearch()).toContain('corpus=saved%3Amy-notes'));
    // The engine is handed the text itself, under a name of its own.
    await waitFor(() =>
      expect(recorded.some((r) => r.settings.corpus.startsWith('saved:my-notes@'))).toBe(true),
    );
    expect(await screen.findByText('Same finger bigrams')).toBeInTheDocument();
  }, 60_000);

  it('ranks the Library on one', async () => {
    const user = userEvent.setup();
    renderRoute(`${LIBRARY}&corpus=saved%3Amy-notes`, { storage: await savedText() });
    // Once every layout is scored on it.
    expect(await rankingSays(/symbols of My notes/, 50_000)).toBeInTheDocument();
    expect(
      screen.getAllByText('Effort', { selector: 'dt' })[0].nextElementSibling?.textContent,
    ).toMatch(/\d/);

    await user.click(screen.getByRole('button', { name: 'Rank and filter' }));
    const corpus = await screen.findByRole('combobox', { name: 'Corpus' });
    expect(corpus).toHaveDisplayValue('My notes');
  }, 90_000);
});
