import {
  BUNDLED_LAYOUTS,
  bundledLayout,
  CLASSIC_LAYOUTS,
  type Layout,
  toCanonicalJson,
} from '@layerbench/core';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisClient, AnalyzeRequest, ReportDTO } from '../engine/protocol.js';
import { useSession } from '../state/session.js';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import {
  customInLink,
  LIBRARY,
  openSettings,
  rankingSays,
  renderRoute,
  testClient,
} from '../test/render.js';

let counter = 0;

/** Each test gets its own database, so custom documents never leak between cases. */
function freshStorage(): IndexedDbAdapter {
  return new IndexedDbAdapter(`layerbench-library-${++counter}`);
}

/**
 * Qwerty as written, its letters alone, saved under the name given: every bundled layout types the
 * accents through Accents, so the one that cannot is a custom one.
 */
async function savePlain(
  storage: IndexedDbAdapter,
  id: string,
  extra: Partial<Layout> = {},
): Promise<void> {
  const plain = CLASSIC_LAYOUTS.find((l) => l.id === 'qwerty') as Layout;
  await storage.put('layouts', id, toCanonicalJson({ ...plain, id, name: 'Plain', ...extra }));
}

/** A layout's card heading: how a layout is told to be listed. */
const listed = (name: string) => screen.queryByRole('heading', { name, level: 3 });

/** The ranking choices, sort and board filter are in a dialog of their own. */
async function openRanking() {
  await userEvent.click(await screen.findByRole('button', { name: 'Rank and filter' }));
}

// The sort and the filters are remembered in this browser; each test starts from the defaults.
beforeEach(() =>
  useSession.setState({ librarySort: 'effort', hiddenBoards: [], hideCustom: false }),
);

describe('Creating layouts', () => {
  it('creates a layout from scratch and opens it in the editor', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const { currentSearch } = renderRoute(LIBRARY, { storage });

    await user.click(await screen.findByRole('button', { name: 'New layout' }));
    const dialog = screen.getByRole('dialog', { name: 'New layout' });
    const name = within(dialog).getByLabelText('New layout name');
    await user.clear(name);
    await user.type(name, 'Bird nest');
    await user.selectOptions(within(dialog).getByLabelText('New layout board'), '23332+2');
    await user.click(within(dialog).getByLabelText('Add the default layers'));
    await user.click(within(dialog).getByRole('button', { name: 'Create and edit' }));

    await waitFor(async () => expect(await customInLink(currentSearch())).toBe('bird-nest'));
    const stored = await storage.get('layouts', 'bird-nest');
    expect(stored).not.toBeNull();
    const doc = stored?.doc as { name: string; layers: { id: string }[] };
    expect(doc.name).toBe('Bird nest');
    // The board has no pinky bottom or inner top key: Extras has their symbols.
    expect(doc.layers.map((l) => l.id)).toEqual(['base', 'num', 'sym', 'extras', 'accents']);
  });

  it('refuses a new layout with no name', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });

    await user.click(await screen.findByRole('button', { name: 'New layout' }));
    const dialog = screen.getByRole('dialog', { name: 'New layout' });
    await user.clear(within(dialog).getByLabelText('New layout name'));
    expect(within(dialog).getByRole('button', { name: 'Create and edit' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('New layout name'), '   ');
    expect(within(dialog).getByRole('button', { name: 'Create and edit' })).toBeDisabled();
  });

  it('puts the new-layout dialog away on Cancel, or when the browser closes it', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });

    await user.click(await screen.findByRole('button', { name: 'New layout' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'New layout' })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(screen.queryByRole('dialog', { name: 'New layout' })).toBeNull();

    // Escape and a tap on the dimmed page are the browser's to close it, which it announces.
    await user.click(screen.getByRole('button', { name: 'New layout' }));
    fireEvent(screen.getByRole('dialog', { name: 'New layout' }), new Event('close'));
    expect(screen.queryByRole('dialog', { name: 'New layout' })).toBeNull();
  });

  it('gives a new layout a free id when a layout already has its name', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const qwerty = bundledLayout('qwerty') as Layout;
    await storage.put('layouts', 'mine', toCanonicalJson({ ...qwerty, id: 'mine', name: 'Mine' }));
    const { currentSearch } = renderRoute(LIBRARY, { storage });

    await user.click(await screen.findByRole('button', { name: 'New layout' }));
    const name = screen.getByLabelText('New layout name');
    await user.clear(name);
    await user.type(name, 'Mine');
    await user.click(screen.getByRole('button', { name: 'Create and edit' }));

    await waitFor(async () => expect(await customInLink(currentSearch())).toBe('mine-2'));
    expect((await storage.get('layouts', 'mine'))?.doc.name).toBe('Mine');
    expect(await screen.findByText('Saved Mine')).toBeInTheDocument();
  });

  it('makes no second layout when a create that failed after the browser wrote it is tried again', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    renderRoute(LIBRARY, { storage });
    const create = async () => {
      await user.click(await screen.findByRole('button', { name: 'New layout' }));
      await user.click(screen.getByRole('button', { name: 'Create and edit' }));
    };
    const put = storage.put.bind(storage);
    storage.put = async (...args) => {
      await put(...args);
      throw new Error('offline');
    };
    await create();
    expect(await screen.findByText('Save failed: offline')).toBeInTheDocument();

    storage.put = put;
    await create();
    expect(await screen.findByText('Saved My layout')).toBeInTheDocument();
    expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['my-layout']);
  });

  it('opens a layout in Analyze on the corpus and rules the Library ranks by', async () => {
    const user = userEvent.setup();
    const { currentPath, currentSearch } = renderRoute(LIBRARY, { storage: freshStorage() });
    await openRanking();
    const corpus = await screen.findByRole('combobox', { name: 'Corpus' });
    await waitFor(() => expect(within(corpus).getAllByRole('option').length).toBeGreaterThan(1));
    await user.selectOptions(corpus, 'pt-br-general');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rule set' }), 'cyanophage');
    await waitFor(() => expect(currentSearch()).toContain('rules=cyanophage'));

    const card = (await screen.findByRole('heading', { name: 'Qwerty', level: 3 })).closest(
      'article',
    ) as HTMLElement;
    await user.click(within(card).getByRole('link', { name: 'Open Qwerty' }));
    await waitFor(() => expect(currentPath()).toBe('/analyze'));
    expect(currentSearch()).toContain('layout=qwerty');
    expect(currentSearch()).toContain('corpus=pt-br-general');
    expect(currentSearch()).toContain('rules=cyanophage');
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    const settings = await openSettings();
    expect(within(settings).getByRole('combobox', { name: 'Corpus' })).toHaveValue('pt-br-general');
    expect(within(settings).getByRole('combobox', { name: 'Rule set' })).toHaveValue('cyanophage');
  }, 60_000);

  it('has no Duplicate on a card, bundled or custom: Analyze and Save make a copy', async () => {
    const storage = freshStorage();
    const qwerty = bundledLayout('qwerty') as Layout;
    await storage.put('layouts', 'mine', toCanonicalJson({ ...qwerty, id: 'mine', name: 'Mine' }));
    renderRoute(LIBRARY, { storage });
    await screen.findByRole('button', { name: 'Delete Mine' });
    expect(screen.queryByRole('button', { name: /^Duplicate/ })).toBeNull();
    // Delete is drawn as Analyze's neighbour was, a button and not a ghost one.
    expect(screen.getByRole('button', { name: 'Delete Mine' })).toHaveClass('btn', 'btn-xs');
    expect(screen.getByRole('button', { name: 'Delete Mine' })).not.toHaveClass('btn-ghost');
  });

  it('puts Open last on every card, flush right, with Delete to its left on a custom one', async () => {
    const storage = freshStorage();
    const qwerty = bundledLayout('qwerty') as Layout;
    await storage.put('layouts', 'mine', toCanonicalJson({ ...qwerty, id: 'mine', name: 'Mine' }));
    renderRoute(LIBRARY, { storage });
    const open = await screen.findByRole('link', { name: 'Open Mine' });
    expect(open).toHaveTextContent(/^Open$/);
    const actions = open.parentElement as HTMLElement;
    expect([...actions.children]).toEqual([
      screen.getByRole('button', { name: 'Delete Mine' }),
      open,
    ]);
    expect(actions).toHaveClass('ml-auto');

    // A bundled card has Open alone, in the same place.
    const bundled = screen.getByRole('link', { name: 'Open Qwerty' });
    expect([...(bundled.parentElement as HTMLElement).children]).toEqual([bundled]);
    expect(bundled.parentElement).toHaveClass('ml-auto');
  });

  it('deletes a custom layout, naming it', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const qwerty = bundledLayout('qwerty') as Layout;
    await storage.put('layouts', 'mine', toCanonicalJson({ ...qwerty, id: 'mine', name: 'Mine' }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderRoute(LIBRARY, { storage });

    await user.click(await screen.findByRole('button', { name: 'Delete Mine' }));
    expect(confirm).toHaveBeenCalledWith('Delete Mine?');
    expect(await screen.findByText('Deleted Mine')).toBeInTheDocument();
    expect(await storage.get('layouts', 'mine')).toBeNull();
    confirm.mockRestore();
  });
});

describe('Ranking layouts', () => {
  /** The value a card shows for one metric, read back as a number. */
  function valueOn(card: HTMLElement, metric: 'Effort' | 'SFB'): number {
    const term = within(card).getByText(metric, { selector: 'dt' });
    return Number.parseFloat(term.nextElementSibling?.textContent ?? 'NaN');
  }

  const cards = () =>
    [...document.querySelectorAll('article')].filter((a) => a.querySelector('dt')) as HTMLElement[];

  it('shows Effort and SFB on every layout, and sorts by either', async () => {
    const user = userEvent.setup();
    // A small sample keeps twenty-odd analyses quick; the ordering is what is under test.
    renderRoute('/library?corpus=en-general&sample=1000', { storage: freshStorage() });

    // Every bundled layout gets both numbers once scoring settles.
    await rankingSays(/^Lower is better for both/, 60_000);
    expect(cards().length).toBeGreaterThan(10);
    for (const card of cards()) {
      expect(Number.isFinite(valueOn(card, 'Effort'))).toBe(true);
      expect(Number.isFinite(valueOn(card, 'SFB'))).toBe(true);
    }

    // Effort is the default order: best first.
    const efforts = cards().map((c) => valueOn(c, 'Effort'));
    expect(efforts).toEqual([...efforts].sort((a, b) => a - b));
    await user.click(screen.getByRole('radio', { name: 'SFB' }));
    const sfbs = cards().map((c) => valueOn(c, 'SFB'));
    expect(sfbs).toEqual([...sfbs].sort((a, b) => a - b));
  }, 90_000);

  /** What the Library reads from a report: its Effort, an SFB to go with it, and nothing skipped. */
  function reportWith(effort: number): ReportDTO {
    const report = {
      results: [
        { id: 'effort', value: effort },
        { id: 'sfb', value: effort / 100 },
      ],
      stats: { symbols: 1000 },
      coverage: { unproducible: [], softDropped: [], excludedByCase: [] },
    };
    return report as unknown as ReportDTO;
  }

  /**
   * An engine that scores the first layouts it is asked for with the efforts given, in turn, and
   * leaves the rest scoring for as long as the test looks.
   */
  function scoringOnly(efforts: number[]): {
    client: AnalysisClient;
    scored: string[];
    requests: AnalyzeRequest[];
  } {
    const real = testClient();
    const scored: string[] = [];
    const requests: AnalyzeRequest[] = [];
    const analyze = (request: AnalyzeRequest, opts?: { signal?: AbortSignal }) => {
      requests.push(request);
      const effort = efforts[scored.length];
      if (effort === undefined) {
        return new Promise<ReportDTO>((_, reject) =>
          opts?.signal?.addEventListener('abort', () =>
            reject(new DOMException('left the Library', 'AbortError')),
          ),
        );
      }
      scored.push(String(request.layout.name));
      return Promise.resolve(reportWith(effort));
    };
    const client = new Proxy(real, {
      get(target, prop) {
        if (prop === 'peek') return async () => null;
        if (prop === 'analyze') return analyze;
        const member = Reflect.get(target, prop);
        return typeof member === 'function' ? member.bind(target) : member;
      },
    });
    return { client, scored, requests };
  }

  it('orders the list from the first score on, not once every layout is scored', async () => {
    const { client, scored } = scoringOnly([900, 100]);
    // Scores are kept for the session, so this ranks on a sample no other test ranks on (the
    // smallest allowed is 10,000): none of its scores can be known already.
    renderRoute('/library?sample=10001', { client, storage: freshStorage() });

    await rankingSays(/^Scoring layouts on a sample of [\d,]+ symbols… 2 of/, 60_000);
    expect(screen.getByRole('radio', { name: 'Effort' })).toBeChecked();
    const names = [...document.querySelectorAll('article h3')].map((h) => h.textContent);
    // The better of the two scored comes first, the worse second, and the unscored wait below.
    expect(names.slice(0, 2)).toEqual([scored[1], scored[0]]);
    expect(cards()).toHaveLength(2);
  }, 90_000);

  /**
   * An engine that scores each layout by its name, at once. Which layout is scored when depends on
   * when a custom document has been read, so the score has to follow the layout, not the order.
   */
  function scoringByName(effortOf: (name: string) => number): AnalysisClient {
    const real = testClient();
    return new Proxy(real, {
      get(target, prop) {
        if (prop === 'peek') return async () => null;
        if (prop === 'analyze') {
          return async (request: AnalyzeRequest) =>
            reportWith(effortOf(String(request.layout.name)));
        }
        const member = Reflect.get(target, prop);
        return typeof member === 'function' ? member.bind(target) : member;
      },
    });
  }

  it('ranks a custom layout in the same list as the bundled ones', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const graphite = bundledLayout('graphite') as Layout;
    await storage.put(
      'layouts',
      'my-graphite',
      toCanonicalJson({ ...graphite, id: 'my-graphite', name: 'My Graphite' }),
    );
    const client = scoringByName((name) => (name === 'My Graphite' ? 100 : 500));
    renderRoute('/library?sample=10004', { client, storage });

    // Not "Lower is better", which does not wait for a custom document still being read.
    const names = () => [...document.querySelectorAll('article h3')].map((h) => h.textContent);
    await waitFor(() => expect(names()[0]).toBe('My Graphite'), { timeout: 60_000 });
    const card = cards()[0];
    expect(within(card).getByText('custom')).toBeInTheDocument();
    // Analyze is where it is edited too: there is no separate way in.
    expect(within(card).getByRole('link', { name: /^Open / })).toHaveAttribute(
      'href',
      expect.stringContaining('custom%3Amy-graphite'),
    );
    expect(within(card).queryByRole('link', { name: 'Edit' })).toBeNull();
    // The bundled layouts carry no badge.
    expect(within(cards()[1]).queryByText('custom')).toBeNull();

    // By name, it takes its place among the bundled layouts rather than after them.
    await user.click(screen.getByRole('radio', { name: 'Name' }));
    const byName = names();
    expect(byName).toEqual([...byName].sort((a, b) => (a ?? '').localeCompare(b ?? '')));
    expect(byName.indexOf('My Graphite')).toBeGreaterThan(0);
    expect(byName.indexOf('My Graphite')).toBeLessThan(byName.length - 1);
  }, 90_000);

  it('ranks a layout that cannot write the text’s language after one that can', async () => {
    // Plain has the best effort by far, but no key for ã or ç: it would skip them for free.
    const storage = freshStorage();
    await savePlain(storage, 'plain');
    const client = scoringByName((name) => (name === 'Plain' ? 100 : 500));
    renderRoute('/library?corpus=pt-br-general&sample=10002', { client, storage });

    // Scored, and checked for the letters Portuguese needs: behind every layout that has them.
    const plain = () => cards().find((c) => c.querySelector('h3')?.textContent === 'Plain');
    await waitFor(
      () =>
        expect(plain()?.textContent).toMatch(/Cannot type .*ç.*ranked after the layouts that can/),
      { timeout: 60_000 },
    );
    expect(cards().at(-1)).toBe(plain());
  }, 90_000);

  /** The same documents, of which none can be read: what a page sees while they are on the way. */
  function stillReading(storage: IndexedDbAdapter): IndexedDbAdapter {
    return new Proxy(storage, {
      get(target, prop) {
        if (prop === 'get') return () => new Promise(() => {});
        const member = Reflect.get(target, prop);
        return typeof member === 'function' ? member.bind(target) : member;
      },
    });
  }

  it('opens in the order the last visit left, before a custom layout is read or scored', async () => {
    const storage = freshStorage();
    const graphite = bundledLayout('graphite') as Layout;
    await storage.put(
      'layouts',
      'my-graphite',
      toCanonicalJson({ ...graphite, id: 'my-graphite', name: 'My Graphite' }),
    );
    // Not the order of the names: the custom one first, then the shortest names.
    const effortOf = (name: string) => (name === 'My Graphite' ? 1 : 100 + name.length);
    renderRoute('/library?sample=10005', { client: scoringByName(effortOf), storage });
    const names = () => [...document.querySelectorAll('article h3')].map((h) => h.textContent);
    await waitFor(() => expect(names()[0]).toBe('My Graphite'), { timeout: 60_000 });
    await waitFor(() => expect(cards()).toHaveLength(names().length), { timeout: 60_000 });
    const left = names();
    cleanup();

    // The next visit: the custom document is never read, and nothing is ever scored.
    renderRoute('/library?sample=10005', {
      client: scoringOnly([]).client,
      storage: stillReading(storage),
    });
    await waitFor(() => expect(names()).toHaveLength(left.length));
    expect(names()).toEqual(left);
    // Every card has its numbers, the custom one's from the last visit.
    expect(cards()).toHaveLength(left.length);
  }, 90_000);

  it('keeps a layout that cannot write the language last while the texts are being listed', async () => {
    const storage = freshStorage();
    await savePlain(storage, 'plain');
    const client = scoringByName((name) => (name === 'Plain' ? 100 : 500));
    renderRoute('/library?corpus=pt-br-general&sample=10006', { client, storage });
    const plain = () => cards().find((c) => c.querySelector('h3')?.textContent === 'Plain');
    await waitFor(() => expect(plain()?.textContent).toMatch(/ranked after the layouts that can/), {
      timeout: 60_000,
    });
    cleanup();

    // The next visit, with texts that are never listed: which language this one is in is unknown.
    const unlisted = new Proxy(client, {
      get(target, prop) {
        if (prop === 'listCorpora') return () => new Promise(() => {});
        const member = Reflect.get(target, prop);
        return typeof member === 'function' ? member.bind(target) : member;
      },
    });
    renderRoute('/library?corpus=pt-br-general&sample=10006', { client: unlisted, storage });
    await waitFor(() => expect(plain()).toBeTruthy());
    // Its numbers are the best, and it is still where the last visit found it.
    expect(cards().at(-1)).toBe(plain());
  }, 90_000);

  it('scores each layout typed without the features left out of the ranking', async () => {
    const { client, requests } = scoringOnly([500]);
    renderRoute('/library?off=macros&sample=10003', { client, storage: freshStorage() });
    await rankingSays(/^Scoring layouts on a sample of [\d,]+ symbols… 1 of/, 60_000);
    expect(requests[0].layout.name).toBe('Magic Romak');
    // The layout goes as written, and the engine types it without its multi-letter macros.
    expect(requests[0].settings.without).toEqual(['macros']);
    expect(JSON.stringify(requests[0].layout)).toContain('"symbols":"qu"');
  }, 90_000);

  it('ranks the layouts that can write the language first', async () => {
    // Every bundled layout writes Spanish through its Accents layer; Plain has no ñ.
    const storage = freshStorage();
    await savePlain(storage, 'plain');
    renderRoute('/library?corpus=es-general&sample=10000', { storage });
    await rankingSays(/^Lower is better for both/, 60_000);
    const plain = await waitFor(
      () => {
        const card = cards().find((c) => c.querySelector('h3')?.textContent === 'Plain');
        expect(card?.textContent).toMatch(/ranked after the layouts that can/);
        return card as HTMLElement;
      },
      { timeout: 30_000 },
    );
    expect(cards().at(-1)).toBe(plain);
    const romak = cards().find((c) => c.querySelector('h3')?.textContent === 'Magic Romak');
    expect(romak?.textContent).not.toMatch(/Cannot type/);
  }, 90_000);
  it('ranks by the numbers alone when no layout listed can write the language', async () => {
    // Two layouts without an ñ, on a board no bundled layout is on, and only that board listed.
    const storage = freshStorage();
    const board = { preset: '3x5+3' } as const;
    await savePlain(storage, 'plain', { geometry: board });
    const dvorak = CLASSIC_LAYOUTS.find((l) => l.id === 'dvorak') as Layout;
    await storage.put(
      'layouts',
      'plain-dvorak',
      toCanonicalJson({ ...dvorak, id: 'plain-dvorak', name: 'Plain Dvorak', geometry: board }),
    );
    const bundledBoards = [
      ...new Set(BUNDLED_LAYOUTS.map((l) => ('preset' in l.geometry ? l.geometry.preset : ''))),
    ];
    useSession.setState({ hiddenBoards: bundledBoards });
    renderRoute('/library?corpus=es-general&sample=10000', { storage });
    expect(
      await rankingSays(/None of these layouts types every letter Español needs\.$/, 60_000),
    ).toBeTruthy();
    await waitFor(() => expect(cards()).toHaveLength(2), { timeout: 30_000 });
    const efforts = cards().map((c) => valueOn(c, 'Effort'));
    expect(efforts).toEqual([...efforts].sort((a, b) => a - b));
    expect(document.body.textContent).not.toMatch(/ranked after the layouts that can/);
  }, 90_000);
  it('says what share of the text a layout skips', async () => {
    const storage = freshStorage();
    await savePlain(storage, 'plain');
    renderRoute('/library?corpus=pt-br-general&sample=10000', { storage });
    await rankingSays(/^Lower is better for both/, 60_000);
    const plain = await waitFor(
      () => {
        const card = cards().find((c) => c.querySelector('h3')?.textContent === 'Plain');
        expect(card?.querySelector('.lb-skips')?.textContent).toMatch(
          /skips \d+\.\d\d% of the text/,
        );
        return card as HTMLElement;
      },
      { timeout: 30_000 },
    );
    expect(screen.getByText(/come last\.$/)).toBeInTheDocument();
    expect(cards().at(-1)).toBe(plain);
    // Qwerty as bundled types every letter Portuguese needs, through Accents.
    const qwerty = cards().find((c) => c.querySelector('h3')?.textContent === 'Qwerty');
    expect(qwerty?.textContent).not.toMatch(/Cannot type/);
  }, 90_000);
  it('flags a layout that cannot write a language it is for, without ranking it last', async () => {
    const storage = freshStorage();
    await savePlain(storage, 'mine', { name: 'Mine', languages: ['en', 'es'] });
    await savePlain(storage, 'plain');
    renderRoute('/library?corpus=en-general&sample=10000', { storage });
    await rankingSays(/^Lower is better for both/, 60_000);
    const mine = await waitFor(
      () => {
        const card = cards().find((c) => c.querySelector('h3')?.textContent === 'Mine');
        expect(card?.querySelector('.lb-lacks')).toBeTruthy();
        return card as HTMLElement;
      },
      { timeout: 30_000 },
    );
    expect(mine.querySelector('.lb-lacks')?.textContent).toBe(
      'Cannot type ñ á é í ó ú ü, which Español needs.',
    );
    // On an English text it skips nothing for Spanish: ranked by its numbers, beside the same
    // keys saved without the languages.
    expect(mine.textContent).not.toMatch(/ranked after/);
    expect(document.body.textContent).not.toMatch(/come last/);
    const plain = await waitFor(() => {
      const card = cards().find((c) => c.querySelector('h3')?.textContent === 'Plain');
      expect(card).toBeTruthy();
      return card as HTMLElement;
    });
    expect(valueOn(mine, 'Effort')).toBe(valueOn(plain, 'Effort'));
  }, 90_000);
});

describe('Choosing which boards are listed', () => {
  it('lists only the layouts on the boards chosen, and remembers the choice', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    await openRanking();
    const boards = screen.getByRole('group', { name: 'Boards' });
    const columnar34 = within(boards).getByRole('checkbox', { name: /^3×5 \+ 2 thumbs \(34\)/ });
    expect(columnar34).toBeChecked();

    await user.click(columnar34);
    expect(listed('Qwerty')).toBeNull();
    expect(listed('Bird')).toBeInTheDocument();
    expect(screen.getByText(/of [0-9]+ layouts, on the boards chosen/)).toBeInTheDocument();
    // The line says so under Sort by, a line of its own, not beside the button that filters.
    const sort = screen.getByRole('group', { name: 'Sort layouts by' });
    const says = screen.getByText(/of [0-9]+ layouts, on the boards chosen/);
    expect(sort.compareDocumentPosition(says) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(says.tagName).toBe('P');
    expect(JSON.parse(localStorage.getItem('layerbench:session') ?? '{}').state).toMatchObject({
      hiddenBoards: ['3x5+2'],
    });

    const all = within(boards).getByRole('checkbox', { name: 'All' }) as HTMLInputElement;
    expect(all.indeterminate).toBe(true);
    await user.click(all);
    expect(listed('Qwerty')).toBeInTheDocument();
  });

  it('leaves the custom layouts out when asked, and remembers the choice', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const qwerty = bundledLayout('qwerty') as Layout;
    await storage.put('layouts', 'mine', toCanonicalJson({ ...qwerty, id: 'mine', name: 'Mine' }));
    renderRoute(LIBRARY, { storage });
    expect(await screen.findByRole('heading', { name: 'Mine', level: 3 })).toBeInTheDocument();

    await openRanking();
    const layouts = screen.getByRole('group', { name: 'Layouts' });
    const custom = within(layouts).getByRole('checkbox', { name: 'Custom layouts (1)' });
    expect(custom).toBeChecked();

    await user.click(custom);
    expect(listed('Mine')).toBeNull();
    expect(listed('Qwerty')).toBeInTheDocument();
    expect(screen.getByText(/of [0-9]+ layouts, without the custom ones\./)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('layerbench:session') ?? '{}').state).toMatchObject({
      hideCustom: true,
    });

    await user.click(custom);
    expect(listed('Mine')).toBeInTheDocument();
  });
});

describe('Choosing what layouts are ranked on', () => {
  it('ranks on English news with the Layouts Doc rules unless told otherwise', async () => {
    renderRoute(LIBRARY, { storage: freshStorage() });
    await openRanking();
    const corpus = (await screen.findByRole('combobox', { name: 'Corpus' })) as HTMLSelectElement;
    const rules = screen.getByRole('combobox', { name: 'Rule set' }) as HTMLSelectElement;
    await waitFor(() => expect(corpus.selectedOptions[0]?.textContent).toMatch(/Leipzig/));
    expect(corpus.value).toBe('en-general');
    expect(rules.value).toBe('layouts_doc');
  });

  it('keeps the chosen corpus and rules in the link, and hands them to Analyze', async () => {
    const user = userEvent.setup();
    const { currentSearch } = renderRoute(LIBRARY, { storage: freshStorage() });
    await openRanking();
    const corpus = await screen.findByRole('combobox', { name: 'Corpus' });
    await waitFor(() => expect(within(corpus).getAllByRole('option').length).toBeGreaterThan(1));

    await user.selectOptions(corpus, 'pt-br-general');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rule set' }), 'cyanophage');
    await waitFor(() => expect(currentSearch()).toContain('rules=cyanophage'));
    expect(currentSearch()).toContain('corpus=pt-br-general');
    expect(currentSearch()).not.toContain('layout=');

    const card = document.querySelector('article') as HTMLElement;
    const analyze = within(card).getByRole('link', { name: /^Open / }) as HTMLAnchorElement;
    expect(analyze.href).toContain('corpus=pt-br-general');
    expect(analyze.href).toContain('rules=cyanophage');
  });
});

describe('Choosing which special features a ranking counts', () => {
  it('ranks without the features left unticked, and hands that to Analyze', async () => {
    const user = userEvent.setup();
    const { currentSearch } = renderRoute(LIBRARY, { storage: freshStorage() });
    await openRanking();
    const macros = await screen.findByRole('checkbox', { name: 'Multi-letter macros' });
    for (const name of ['Adaptive keys', 'Repeat key', 'Typing combos']) {
      expect(screen.getByRole('checkbox', { name })).toBeChecked();
    }
    expect(macros).toBeChecked();

    await user.click(macros);
    await waitFor(() => expect(currentSearch()).toContain('off=macros'));
    expect(macros).not.toBeChecked();
    const card = screen.getByText('Magic Romak', { selector: 'h3' }).closest('article');
    const analyze = within(card as HTMLElement).getByRole('link', { name: /^Open / });
    expect((analyze as HTMLAnchorElement).href).toContain('off=macros');

    await user.click(macros);
    await waitFor(() => expect(currentSearch()).not.toContain('off='));
  });
});

describe('Layers on a card', () => {
  const layered = [...BUNDLED_LAYOUTS].sort((a, b) => b.layers.length - a.layers.length)[0];

  it('shows one layer of a layout at a time, with its name and where it stands', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    const nav = await screen.findByRole('group', { name: `${layered.name} layers` });
    const card = nav.closest('article') as HTMLElement;
    const names = layered.layers.map((l) => l.name ?? l.id);
    const total = layered.layers.length;
    expect(within(nav).getByText(names[0])).toBeTruthy();
    expect(within(nav).getByText(`1 / ${total}`)).toBeTruthy();
    expect(within(nav).getByRole('button', { name: 'Previous layer' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    const board = () => card.querySelector('svg')?.getAttribute('id') ?? '';
    const first = board();
    await user.click(within(nav).getByRole('button', { name: 'Next layer' }));
    expect(within(nav).getByText(names[1])).toBeTruthy();
    expect(within(nav).getByText(`2 / ${total}`)).toBeTruthy();
    expect(board()).not.toBe(first);
    // The only board on the card is the one shown.
    expect(card.querySelectorAll('svg.lb-keyboard')).toHaveLength(1);
  });

  it('draws the layers of a custom layout too, once it is read', async () => {
    const storage = freshStorage();
    const copy = { ...layered, id: 'layered-copy', name: `${layered.name} copy` };
    await storage.put('layouts', copy.id, toCanonicalJson(copy), { message: 'seed' });
    renderRoute(LIBRARY, { storage });
    const nav = await screen.findByRole('group', { name: `${layered.name} copy layers` });
    expect(within(nav).getByText(`1 / ${layered.layers.length}`)).toBeTruthy();
  });
});

/** A keymap-drawer file that only names its keyboard, the way `keymap parse` writes one. */
const KEYMAP = `layout:
  zmk_keyboard: hummingbird
layers:
  Def:
  - [W, F, M, P, G, K, U, O, Y, SQT]
  - [R, S, N, T, B, J, A, E, I, H]
  - [C, L, D, X, ',', .]
  - {t: Nav, h: sticky}
  - SPACE
  - {t: LSHFT, h: sticky}
  - {t: Num, h: sticky}
  Nav:
  - [F1, F2, F3, F4, F5, ESC, HOME, UARW, END, PG UP]
  - [LGUI, LALT, LSHFT, LCTRL, LC(Z), DEL, LARW, ENTER, RARW, PG DN]
  - [LC(X), LC(C), LC(V), BSPC, DARW, TAB]
  - [{type: held}, '', '', '']
  Num:
  - ['', '', '', '', '', '', '', '', '', '']
  - ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
  - ['', '', '', '', '', '']
  - ['', '', '', {type: held}]
combos:
  - {p: [1, 2], k: V, l: [Def]}
`;

describe('Importing from keymap-drawer', () => {
  /** The import dialog, on its keymap-drawer tab. */
  async function openKeymapImport() {
    await userEvent.click(await screen.findByRole('button', { name: 'Import' }));
    await userEvent.click(screen.getByRole('tab', { name: 'keymap-drawer' }));
  }

  it('imports the layers chosen, under the names given, and opens the result in the editor', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const { currentSearch } = renderRoute(LIBRARY, { storage });

    await openKeymapImport();
    await user.click(await screen.findByLabelText('keymap-drawer YAML'));
    await user.paste(KEYMAP);

    // The file only names its keyboard; its thirty keys are the Hummingbird preset.
    expect(await screen.findByRole('combobox', { name: 'Board to import onto' })).toHaveValue(
      '23332+2',
    );
    expect(screen.getByText(/^Onto/)).toHaveTextContent(/^Onto Split columnar 23332 \+ 2 thumbs/);
    const layers = within(screen.getByRole('list', { name: 'Layers to import' }));
    await user.click(layers.getByLabelText('Import Num'));
    const name = layers.getByLabelText('Name for Def');
    await user.clear(name);
    await user.type(name, 'Base{Enter}');
    // A key that reaches a layer left out is kept as it was drawn, not dropped.
    expect(await layers.findByText(/kept as imported: .*Num/)).toBeInTheDocument();

    const layoutName = screen.getByLabelText('Name of the imported layout');
    await user.clear(layoutName);
    await user.type(layoutName, 'Humming{Enter}');
    await user.click(screen.getByRole('button', { name: 'Import and edit' }));

    await waitFor(async () => expect(await customInLink(currentSearch())).toBe('humming'));
    const stored = (await storage.get('layouts', 'humming'))?.doc as {
      geometry: unknown;
      layers: { id: string; name: string; bindings: Record<string, unknown> }[];
      combos: { keys: string[] }[];
    };
    expect(stored.geometry).toEqual({ preset: '23332+2' });
    expect(stored.layers.map((l) => l.name)).toEqual(['Base', 'Nav']);
    expect(stored.layers[0].bindings.LTP).toEqual({ kind: 'kp', symbol: 'w' });
    expect(stored.layers[0].bindings.L1).toEqual({ kind: 'sl', layer: 'nav' });
    expect(stored.combos[0].keys).toEqual(['LTR', 'LTM']);
    // And every imported key can be selected in the editor like any other.
    expect(await screen.findByRole('button', { name: 'Key LTP: w' })).toBeInTheDocument();
  }, 60_000);

  it('previews the file with what a hold does, since that is half of a binding', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    await openKeymapImport();
    await user.click(await screen.findByLabelText('keymap-drawer YAML'));
    await user.paste(KEYMAP);

    await screen.findByRole('combobox', { name: 'Board to import onto' });
    const board = document.getElementById('kb-kd-import') as HTMLElement;
    // The sticky keys' `1×` is drawn under what they tap; a preview of only what is typed has none.
    expect(board.textContent).toContain('1×');
  }, 60_000);

  it('says what is wrong with a file it cannot read', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    await openKeymapImport();
    await user.click(await screen.findByLabelText('keymap-drawer YAML'));
    await user.paste('layers: [a, b');
    expect(await screen.findByText(/line 1: unclosed \[/)).toBeInTheDocument();
  });
});
