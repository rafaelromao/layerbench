import { bundledLayout, LANGUAGE_PROFILES, type Layout, toCanonicalJson } from '@layerbench/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { setCommunitySource } from '../community/community.js';
import type { AnalysisClient, AnalyzeRequest } from '../engine/protocol.js';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { branchWith, communityDoc } from '../test/community.js';
import { layerNames, showLayer, shownLayer } from '../test/layers.js';
import { RecordingClient } from '../test/recording-client.js';
import { LIBRARY, openSettings, rankingSays, renderRoute, testClient } from '../test/render.js';
import { decodeInline } from '../url/inline.js';

const QWERTY_TEXT = 'q w e r t y u i o p\na s d f g h j k l ;\nz x c v b n m , . /';
/** A text long enough to build a corpus from. */
const FOX = Array.from(
  { length: 30 },
  (_, i) => `The quick brown fox ${['jumps', 'leaps', 'runs'][i % 3]} over the lazy dog.`,
).join(' ');

let counter = 0;

/** Each test gets its own database, so custom documents never leak between cases. */
function freshStorage(): IndexedDbAdapter {
  return new IndexedDbAdapter(`layerbench-view-${++counter}`);
}

describe('Library', () => {
  it('lists the bundled layouts', async () => {
    renderRoute(LIBRARY, { storage: freshStorage() });
    expect(await screen.findByRole('heading', { name: 'Layouts' })).toBeInTheDocument();
    expect(screen.getByText('Graphite')).toBeInTheDocument();
    expect(screen.getByText('Magic Romak')).toBeInTheDocument();
    expect(screen.getByText(/Nothing custom yet/)).toBeInTheDocument();
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
    // The arrow keys move between the tabs too.
    await user.keyboard('{ArrowRight}');
    expect(within(dialog).getByRole('tab', { name: 'Text or JSON', selected: true })).toHaveFocus();
    expect(within(dialog).getByLabelText('Layout to import')).toBeVisible();

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

  it('shows a custom layout saved earlier and offers to analyze it', async () => {
    const storage = freshStorage();
    const layout = bundledLayout('colemak-dh')!;
    await storage.put('layouts', 'my-romak', toCanonicalJson({ ...layout, name: 'My Romak' }));

    renderRoute(LIBRARY, { storage });

    expect(await screen.findByText('My Romak')).toBeInTheDocument();
    const card = screen.getByText('My Romak').closest('article') as HTMLElement;
    expect(within(card).getByRole('link', { name: 'Open My Romak' })).toHaveAttribute(
      'href',
      expect.stringContaining('custom%3Amy-romak'),
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

  it('compares a community layout its link names', async () => {
    setCommunitySource(branchWith(communityDoc('night-owl', 'Night owl')));
    renderRoute('/compare?layout=community:night-owl&b=graphite&corpus=en-general&sample=20000', {
      storage: freshStorage(),
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Layout A')).toHaveValue('community:night-owl'),
    );
    expect(
      within(screen.getByLabelText('Layout A')).getByRole('option', { name: 'Night owl' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('table', undefined, { timeout: 25_000 })).toBeInTheDocument();
  });

  it('shows every layer of each layout, one at a time', async () => {
    const user = userEvent.setup();
    renderRoute('/compare?layout=magic-romak&b=graphite&corpus=pt-br-general&sample=20000', {
      storage: freshStorage(),
    });
    await screen.findByRole('group', { name: 'Layers of A' });
    expect(await layerNames(user, 'Layers of A')).toEqual([
      'Alpha 1',
      'Alpha 2',
      'Ç extension',
      'Numbers',
      'Symbols',
      'Extras',
      'Accents',
    ]);
    // Graphite's own layer, then the default ones every bundled layout has.
    expect(await layerNames(user, 'Layers of B')).toEqual([
      'Base',
      'Numbers',
      'Symbols',
      'Accents',
    ]);

    // Each side turns on its own, and the other keeps the layer it was on.
    const boardA = () => document.getElementById('kb-A')?.textContent ?? '';
    await showLayer(user, 'Alpha 1', 'Layers of A');
    expect(boardA()).not.toContain('qu');
    await showLayer(user, 'Alpha 2', 'Layers of A');
    expect(shownLayer('Layers of A')).toBe('Alpha 2');
    expect(shownLayer('Layers of B')).toBe('Accents');
    expect(boardA()).toContain('qu');
  });

  it('offers the custom layouts on both sides, as Analyze does', async () => {
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
    expect(within(b).getByRole('option', { name: 'Mine' })).toHaveValue('custom:mine');

    // Each group is in alphabetical order.
    const names = (group: string) =>
      [...(a.querySelector(`optgroup[label="${group}"]`)?.children ?? [])].map(
        (o) => o.textContent,
      );
    const bundled = names('Bundled');
    expect(bundled).toEqual(
      [...bundled].sort((x, y) => x!.localeCompare(y!, 'en', { sensitivity: 'base' })),
    );

    await user.selectOptions(b, 'custom:mine');
    await waitFor(() => expect(currentSearch()).toContain('b=custom%3Amine'));
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

describe('Compare, sent', () => {
  it('carries a custom layout on either side in its link whole, so it opens anywhere', async () => {
    const storage = freshStorage();
    const mine = { ...(bundledLayout('colemak') as Layout), id: 'mine', name: 'Mine' };
    await storage.put('layouts', 'mine', toCanonicalJson(mine));
    const { currentSearch } = renderRoute(
      '/compare?layout=custom%3Amine&b=mine&corpus=en-general&sample=20000',
      { client: new RecordingClient(), storage },
    );
    const carried = async (key: string) => {
      const ref = new URLSearchParams(currentSearch()).get(key) ?? '';
      const decoded = ref.startsWith('inline:') ? await decodeInline(ref.slice(7)) : null;
      return decoded?.ok ? decoded.layout : null;
    };
    await waitFor(async () => expect((await carried('layout'))?.id).toBe('mine'));
    await waitFor(async () => expect((await carried('b'))?.name).toBe('Mine'));
    // Here, where it is saved, both are still picked as the custom layout.
    const pickers = screen.getAllByRole('combobox', { name: /Layout/ });
    await waitFor(() =>
      expect(pickers.map((p) => (p as HTMLSelectElement).value)).toEqual([
        'custom:mine',
        'custom:mine',
      ]),
    );
  }, 30_000);
});

describe('Corpus', () => {
  it('lists the shipped corpora with their provenance', async () => {
    renderRoute('/corpus', { storage: freshStorage() });

    expect(await screen.findByText('Corpora')).toBeInTheDocument();
    // Every shipped corpus is offered: news from the Leipzig collection, one per language.
    expect(await screen.findAllByText(/Leipzig/)).not.toHaveLength(0);
    expect(screen.getAllByText('English — news 2023 (Leipzig)')).not.toHaveLength(0);
    expect(screen.getAllByText('Español — noticias 2023 (Leipzig)')).not.toHaveLength(0);
    expect(screen.getAllByText('Deutsch — Nachrichten 2023 (Leipzig)')).not.toHaveLength(0);
    // English first, then the rest by name, and the page opens on English.
    const list = screen.getByRole('heading', { name: 'Corpora' }).parentElement
      ?.nextElementSibling as HTMLElement;
    const names = within(list)
      .getAllByRole('button')
      .map((b) => b.querySelector('span > span')?.textContent ?? '');
    expect(names[0]).toMatch(/^English/);
    expect(names[1]).toMatch(/^Deutsch/);
    expect(names.slice(1)).toEqual(
      [...names.slice(1)].sort((x, y) => x.localeCompare(y, 'en', { sensitivity: 'base' })),
    );
    expect(within(list).getAllByRole('button')[0]).toHaveClass('menu-active');
    // Facts are counted over a sample of the selected corpus.
    expect(await screen.findByText('Letters', undefined, { timeout: 25_000 })).toBeInTheDocument();
    expect(screen.getByText('Trigrams')).toBeInTheDocument();
  });

  it('offers every language it has a profile for to a custom text, German too', async () => {
    renderRoute('/corpus', { storage: freshStorage() });
    await screen.findByText('Custom corpus');
    const options = within(screen.getByLabelText('Language'))
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual([...Object.keys(LANGUAGE_PROFILES), 'custom']);
    expect(options).toContain('de');
  });

  it('refuses a custom corpus that is too short', async () => {
    const user = userEvent.setup();
    renderRoute('/corpus', { storage: freshStorage() });
    await screen.findByText('Custom corpus');

    await user.type(screen.getByLabelText('Corpus text'), 'too short');
    await user.click(screen.getByRole('button', { name: 'Build corpus' }));

    expect(await screen.findByText(/at least 1,000 characters/)).toBeInTheDocument();
  });

  it('saves a text, lists it with the custom texts, and opens it again', async () => {
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

    const heading = await screen.findByRole('heading', { name: 'Custom' });
    const custom = heading.nextElementSibling as HTMLElement;
    await user.click(within(custom).getByRole('button', { name: /My notes/ }));
    await waitFor(() => expect(currentSearch()).toContain('id=custom%3Amy-notes'));
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
      expect.stringContaining('corpus=custom%3Amy-notes'),
    );
  });

  it('says so when a link names a custom text this browser does not have', async () => {
    renderRoute('/corpus?id=custom%3Anowhere', { storage: freshStorage() });
    expect(await screen.findByRole('alert')).toHaveTextContent('text nowhere is not saved here');
  });
});

describe('Custom texts in the pickers', () => {
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
    expect(option.closest('optgroup')).toHaveAttribute('label', 'Custom');
    // No groups by language: one list, English first, then the rest by name, then Custom.
    expect([...corpus.querySelectorAll('optgroup')].map((g) => g.label)).toEqual(['Custom']);
    const shipped = [...corpus.children]
      .filter((o) => o.tagName === 'OPTION')
      .map((o) => o.textContent ?? '');
    expect(shipped[0]).toMatch(/^English/);
    expect(shipped.slice(1)).toEqual(
      [...shipped.slice(1)].sort((x, y) => x.localeCompare(y, 'en', { sensitivity: 'base' })),
    );

    await user.selectOptions(corpus, 'custom:my-notes');
    await waitFor(() => expect(currentSearch()).toContain('corpus=custom%3Amy-notes'));
    // The engine is handed the text itself, under a name of its own.
    await waitFor(() =>
      expect(recorded.some((r) => r.settings.corpus.startsWith('custom:my-notes@'))).toBe(true),
    );
    expect(await screen.findByText('Same finger bigrams')).toBeInTheDocument();
  }, 60_000);

  it('ranks the Library on one', async () => {
    const user = userEvent.setup();
    renderRoute(`${LIBRARY}&corpus=custom%3Amy-notes`, { storage: await savedText() });
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
