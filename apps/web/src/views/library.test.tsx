import {
  BUNDLED_LAYOUTS,
  bundledLayout,
  CLASSIC_LAYOUTS,
  compileLayout,
  getPreset,
  homeRowLetters,
  type Layout,
  layoutCategory,
  type Rule,
  toCanonicalJson,
} from '@layerbench/core';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initGitHubSession, useGitHubSession } from '../auth/github-session.js';
import { setCommunitySource } from '../community/community.js';
import type { AnalysisClient, AnalyzeRequest, ReportDTO } from '../engine/protocol.js';
import { recordProposal } from '../proposals/proposals.js';
import { useSession } from '../state/session.js';
import { CompositeStorage } from '../storage/composite.js';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { branchWith, communityDoc } from '../test/community.js';
import { MemoryStorage } from '../test/memory-storage.js';
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
 * accents, through Accents or, on Magic Romak, its dead keys, so the one that cannot is a custom one.
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
  useSession.setState({
    librarySort: 'effort',
    hiddenBoards: [],
    hideCustom: false,
    hideCommunity: false,
    hiddenCategories: [],
  }),
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

  it('makes no second layout of a name a custom one has: it offers to overwrite that one', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const qwerty = bundledLayout('qwerty') as Layout;
    await storage.put('layouts', 'mine', toCanonicalJson({ ...qwerty, id: 'mine', name: 'Mine' }));
    const { currentSearch } = renderRoute(LIBRARY, { storage });
    await screen.findByRole('heading', { name: 'Mine', level: 3 });

    await user.click(await screen.findByRole('button', { name: 'New layout' }));
    const dialog = screen.getByRole('dialog', { name: 'New layout' });
    const name = within(dialog).getByLabelText('New layout name');
    await user.clear(name);
    await user.type(name, 'mine ');
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'A custom layout is already called Mine',
    );
    expect(within(dialog).getByRole('button', { name: 'Create and edit' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Overwrite Mine' }));

    await waitFor(async () => expect(await customInLink(currentSearch())).toBe('mine'));
    expect((await storage.list('layouts')).map((e) => e.id)).toEqual(['mine']);
    expect((await storage.get('layouts', 'mine'))?.doc.name).toBe('mine');
  });

  it('asks only for another name when GitHub and this browser each have a layout of it', async () => {
    const user = userEvent.setup();
    const qwerty = bundledLayout('qwerty') as Layout;
    const local = freshStorage();
    const remote = new MemoryStorage('github');
    await remote.put('layouts', 'mine', toCanonicalJson({ ...qwerty, id: 'mine', name: 'Mine' }));
    await local.put(
      'layouts',
      'mine-2',
      toCanonicalJson({ ...qwerty, id: 'mine-2', name: 'Mine' }),
    );
    const storage = new CompositeStorage(local, remote);
    const { currentSearch } = renderRoute(LIBRARY, { storage });
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { name: 'Mine', level: 3 })).toHaveLength(2),
    );

    await user.click(await screen.findByRole('button', { name: 'New layout' }));
    const name = screen.getByLabelText('New layout name');
    await user.clear(name);
    await user.type(name, 'Mine');
    await user.click(screen.getByRole('button', { name: 'Overwrite Mine' }));

    const again = await screen.findByRole('dialog', { name: 'Save under another name' });
    expect(within(again).getByRole('status')).toHaveTextContent('It could not be overwritten');
    expect(within(again).queryByRole('button', { name: /Overwrite/ })).toBeNull();
    const field = within(again).getByLabelText('Name of the layout');
    await user.clear(field);
    await user.type(field, 'Mine 3');
    await user.click(within(again).getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect(await customInLink(currentSearch())).toBe('mine-3'));
  });

  it('offers a new layout a name no custom layout has', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const qwerty = bundledLayout('qwerty') as Layout;
    await storage.put('layouts', 'my-layout', toCanonicalJson({ ...qwerty, name: 'My layout' }));
    renderRoute(LIBRARY, { storage });
    await screen.findByRole('heading', { name: 'My layout', level: 3 });

    await user.click(await screen.findByRole('button', { name: 'New layout' }));
    const dialog = screen.getByRole('dialog', { name: 'New layout' });
    expect(within(dialog).getByLabelText('New layout name')).toHaveValue('My layout 2');
    expect(within(dialog).getByRole('button', { name: 'Create and edit' })).toBeEnabled();
  });

  it('asks for another name when a layout of the name was saved since the list was read', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const { currentSearch } = renderRoute(LIBRARY, { storage });
    await user.click(await screen.findByRole('button', { name: 'New layout' }));
    // Saved from another tab: this one has not listed it.
    const qwerty = bundledLayout('qwerty') as Layout;
    await storage.put('layouts', 'mine', toCanonicalJson({ ...qwerty, id: 'mine', name: 'Mine' }));
    const name = screen.getByLabelText('New layout name');
    await user.clear(name);
    await user.type(name, 'Mine');
    await user.click(screen.getByRole('button', { name: 'Create and edit' }));

    const again = await screen.findByRole('dialog', { name: 'Save under another name' });
    expect(within(again).getByRole('status')).toHaveTextContent(
      'A custom layout is already called Mine',
    );
    const field = within(again).getByLabelText('Name of the layout');
    await user.type(field, ' 2');
    await user.click(within(again).getByRole('button', { name: 'Save' }));

    await waitFor(async () => expect(await customInLink(currentSearch())).toBe('mine-2'));
    expect(await screen.findByText('Saved Mine 2')).toBeInTheDocument();
    expect((await storage.list('layouts')).map((e) => e.name)).toEqual(['Mine', 'Mine 2']);
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

  /** The listed layouts' names, in the order of their cards, scored or not. */
  const cardNames = () =>
    screen
      .getAllByRole('article')
      .map((card) => within(card).getByRole('heading', { level: 3 }).textContent ?? '');

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

  it('badges Effort and SFB on a card by their bands, as Analyze does', async () => {
    const { client } = scoringOnly([1000, 400]);
    // A sample of its own, so no score is known already.
    renderRoute('/library?sample=10002', { client, storage: freshStorage() });

    await rankingSays(/^Scoring layouts on a sample of [\d,]+ symbols… 2 of/, 60_000);
    /** A metric's box on a card: its number, its band's badge, and its colour on the border. */
    const box = (card: HTMLElement, metric: 'Effort' | 'SFB') =>
      within(card).getByText(metric, { selector: 'dt' }).parentElement as HTMLElement;
    const badge = (card: HTMLElement, metric: 'Effort' | 'SFB') =>
      box(card, metric).querySelector('.lb-band');

    const [best, worst] = cards();
    expect(badge(best, 'Effort')?.textContent).toBe('min');
    expect(badge(best, 'Effort')).toHaveClass('badge-success');
    expect(box(best, 'Effort')).toHaveClass('border-success/60');
    // An SFB of 4% is past the Doc's last bound, its worst band.
    expect(badge(best, 'SFB')?.textContent).toBe('high');
    expect(box(best, 'SFB')).toHaveClass('border-error/60');
    expect(badge(worst, 'Effort')?.textContent).toBe('max');
    expect(box(worst, 'Effort')).toHaveClass('border-error/60');
  }, 90_000);

  it('badges a card by the rule set ranked on; a metric without bands is plain', async () => {
    const { client } = scoringOnly([1000]);
    const storage = freshStorage();
    // Effort split once, at 2000, and SFB with no bands at all.
    const rules = getPreset('layouts_doc').rules.map((r): Rule => {
      if (r.id === 'effort')
        return { ...r, bands: { direction: 'lower_is_better', bounds: [2000] } };
      if (r.id === 'sfb') return { ...r, bands: null };
      return r;
    });
    await storage.put('rulesets', 'lenient', {
      ...getPreset('layouts_doc'),
      name: 'Lenient',
      rules,
    });
    renderRoute('/library?sample=10003&rules=custom:lenient', { client, storage });

    await rankingSays(/^Scoring layouts on a sample of [\d,]+ symbols… 1 of/, 60_000);
    const [card] = cards();
    const box = (metric: 'Effort' | 'SFB') =>
      within(card).getByText(metric, { selector: 'dt' }).parentElement as HTMLElement;
    // On the catalog's bands an Effort of 1000 would be max.
    expect(box('Effort').querySelector('.lb-band')?.textContent).toBe('min');
    expect(box('SFB').querySelector('.lb-band')).toBeNull();
    expect(box('SFB')).toHaveClass('border-base-300');
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
    // The bundled layouts carry no custom badge.
    expect(within(cards()[1]).queryByText('custom')).toBeNull();

    // By name, it takes its place among the bundled layouts rather than after them.
    await user.click(screen.getByRole('radio', { name: 'Name' }));
    const byName = names();
    expect(byName).toEqual([...byName].sort((a, b) => (a ?? '').localeCompare(b ?? '')));
    expect(byName.indexOf('My Graphite')).toBeGreaterThan(0);
    expect(byName.indexOf('My Graphite')).toBeLessThan(byName.length - 1);
  }, 90_000);

  it('sorts by the letters on each layout’s home row, and remembers the choice', async () => {
    const user = userEvent.setup();
    // The order needs no score: nothing is scored while the test looks.
    renderRoute(LIBRARY, { client: scoringOnly([]).client, storage: freshStorage() });
    const sort = await screen.findByRole('group', { name: 'Sort layouts by' });
    expect(
      within(sort)
        .getAllByRole('radio')
        .map((r) => r.getAttribute('aria-label')),
    ).toEqual(['Effort', 'SFB', 'Name', 'Home row']);

    await user.click(within(sort).getByRole('radio', { name: 'Home row' }));
    const rowOf = new Map(BUNDLED_LAYOUTS.map((l) => [l.name, homeRowLetters(compileLayout(l))]));
    const names = cardNames();
    expect(names.length).toBeGreaterThan(10);
    const row = (name: string) => rowOf.get(name) ?? '';
    // Every one has letters there, so plain alphabetical order is the whole rule here.
    expect(names.filter((name) => row(name) === '')).toEqual([]);
    expect(names).toEqual(
      [...names].sort((a, b) => row(a).localeCompare(row(b)) || a.localeCompare(b)),
    );
    // Bird and Bird 30 share their home row, so the name puts them in order.
    expect(row('Bird')).toBe(row('Bird 30'));
    expect(names.indexOf('Bird 30')).toBe(names.indexOf('Bird') + 1);
    expect(JSON.parse(localStorage.getItem('layerbench:session') ?? '{}').state).toMatchObject({
      librarySort: 'home_row',
    });
  });

  it('ranks a layout that cannot write the text’s language after one that can', async () => {
    // Plain has the best effort by far, but no key for ã or ç: it would skip them for free.
    const storage = freshStorage();
    await savePlain(storage, 'plain');
    const client = scoringByName((name) => (name === 'Plain' ? 100 : 500));
    renderRoute('/library?corpus=pt-br-general&sample=10002', { client, storage });

    // Scored, and checked for the letters Portuguese needs: behind every layout that has them, and
    // ahead of those that lack them too, by its effort.
    const plain = () => cards().find((c) => c.querySelector('h3')?.textContent === 'Plain');
    await waitFor(
      () =>
        expect(plain()?.textContent).toMatch(/Cannot type .*ç.*ranked after the layouts that can/),
      { timeout: 60_000 },
    );
    const after = (c: Element) => /ranked after the layouts that can/.test(c.textContent ?? '');
    const at = cards().indexOf(plain() as HTMLElement);
    expect(at).toBeGreaterThan(0);
    expect(cards().slice(0, at).some(after)).toBe(false);
    expect(cards().slice(at).every(after)).toBe(true);
  }, 90_000);

  it('sorts by home row with no regard for the language, as by name', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    await savePlain(storage, 'plain');
    const client = scoringByName((name) => (name === 'Plain' ? 100 : 500));
    renderRoute('/library?corpus=pt-br-general&sample=10002', { client, storage });
    await rankingSays(/come last\.$/, 60_000);

    // Plain has Qwerty's home row: it sits next to it, the name breaking the tie, not last.
    await user.click(screen.getByRole('radio', { name: 'Home row' }));
    const names = cardNames();
    expect(names.indexOf('Plain')).toBe(names.indexOf('Qwerty') - 1);
    expect(await rankingSays(/^Lower is better for both/)).not.toHaveTextContent(/come last/);
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
    const at = cards().indexOf(plain() as HTMLElement);
    expect(at).toBeGreaterThan(0);
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
    expect(cards().indexOf(plain() as HTMLElement)).toBe(at);
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
    // Every bundled layout writes Spanish, through Accents or Magic Romak's dead keys; Plain has no ñ.
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
    // Another layout written in code, as written, without the layers the Library gives it: any one,
    // whichever a Library request has left in code.
    const other = CLASSIC_LAYOUTS.find((l) => l.id !== 'qwerty') as Layout;
    await storage.put(
      'layouts',
      'plain-other',
      toCanonicalJson({ ...other, id: 'plain-other', name: 'Plain other', geometry: board }),
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
  it('shows on a bundled card the languages it performs well in, and none on one for none', async () => {
    renderRoute(LIBRARY, { storage: freshStorage() });
    const chips = async (name: string) => {
      const card = await waitFor(() => {
        const found = cards().find((c) => c.querySelector('h3')?.textContent === name);
        expect(found).toBeTruthy();
        return found as HTMLElement;
      });
      return [...card.querySelectorAll('[title^="Types everything"]')].map((b) => b.textContent);
    };
    expect(await chips('Magic Romak')).toEqual(bundledLayout('magic-romak')?.languages);
    expect(await chips('Canary')).toEqual(bundledLayout('canary')?.languages);
    expect(bundledLayout('qwerty')?.languages).toEqual([]);
    expect(await chips('Qwerty')).toEqual([]);
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

describe('Rank and filter', () => {
  it('is a gear that keeps its name, and opens a dialog of that name', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    const button = await screen.findByRole('button', { name: 'Rank and filter' });
    expect(button).toHaveTextContent('\u2699\uFE0E');
    expect(button).not.toHaveTextContent('Rank and filter');
    expect(button).toHaveAttribute('title', 'Rank and filter');

    await user.click(button);
    expect(screen.getByRole('dialog', { name: 'Rank and filter' })).toBeInTheDocument();
  });

  it('leaves Analyze’s Settings in words', async () => {
    renderRoute('/analyze?layout=qwerty', { storage: freshStorage() });
    expect(await screen.findByRole('button', { name: 'Settings' })).toHaveTextContent('Settings');
  });
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

describe('Community layouts', () => {
  /** A card's badges: what kind of layout it is, and its category. */
  const badgesOf = (name: string) =>
    [...(listed(name)?.closest('article')?.querySelectorAll('.badge-xs') ?? [])].map(
      (b) => b.textContent,
    );

  it('lists the layouts accepted on the branch, flagged and in their category, ranked with the rest', async () => {
    setCommunitySource(branchWith(communityDoc('night-owl', 'Night owl')));
    renderRoute(LIBRARY, { storage: freshStorage() });

    expect(await screen.findByRole('heading', { name: 'Night owl', level: 3 })).toBeInTheDocument();
    expect(badgesOf('Night owl')).toEqual(expect.arrayContaining(['community', 'Standard']));
    expect(badgesOf('Night owl')).not.toContain('custom');
    expect(badgesOf('Qwerty')).not.toContain('community');
    expect(screen.getByRole('link', { name: 'Open Night owl' })).toHaveAttribute(
      'href',
      expect.stringContaining('layout=community%3Anight-owl'),
    );
    // Not one's own: there is nothing to delete.
    expect(screen.queryByRole('button', { name: 'Delete Night owl' })).toBeNull();
    await rankingSays(/^Lower is better/);
    const card = listed('Night owl')?.closest('article') as HTMLElement;
    expect(within(card).queryByText('scoring…')).toBeNull();
    // Its link, to where it comes from, opens in a tab of its own.
    const link = within(card).getByRole('link', { name: 'https://example.com/night-owl' });
    expect(link).toHaveAttribute('href', 'https://example.com/night-owl');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows those kept in this browser while the branch is read again', async () => {
    setCommunitySource(branchWith(communityDoc('night-owl', 'Night owl')));
    renderRoute(LIBRARY, { storage: freshStorage() });
    await screen.findByRole('heading', { name: 'Night owl', level: 3 });
    cleanup();

    setCommunitySource(async () => {
      throw new Error('offline');
    });
    renderRoute(LIBRARY, { storage: freshStorage() });
    expect(await screen.findByRole('heading', { name: 'Night owl', level: 3 })).toBeInTheDocument();
    expect(await screen.findByText('community layouts as last read')).toBeInTheDocument();
  });

  it('says when some could not be read', async () => {
    const branch = branchWith(communityDoc('night-owl', 'Night owl'), communityDoc('lark', 'Lark'));
    setCommunitySource(async (file) => {
      if (file === 'lark.json') throw new Error('503');
      return branch(file);
    });
    renderRoute(LIBRARY, { storage: freshStorage() });
    expect(await screen.findByText('some community layouts not read')).toHaveAttribute(
      'title',
      'could not read lark',
    );
    expect(listed('Night owl')).toBeInTheDocument();
  });

  it('says when none could be read', async () => {
    setCommunitySource(async () => {
      throw new Error('offline');
    });
    renderRoute(LIBRARY, { storage: freshStorage() });
    expect(await screen.findByText('community layouts unavailable')).toBeInTheDocument();
  });

  it('leaves them out when asked, and remembers the choice', async () => {
    const user = userEvent.setup();
    setCommunitySource(branchWith(communityDoc('night-owl', 'Night owl')));
    renderRoute(LIBRARY, { storage: freshStorage() });
    await screen.findByRole('heading', { name: 'Night owl', level: 3 });

    await openRanking();
    const layouts = screen.getByRole('group', { name: 'Layouts' });
    const community = within(layouts).getByRole('checkbox', { name: 'Community layouts (1)' });
    expect(community).toBeChecked();

    await user.click(community);
    expect(listed('Night owl')).toBeNull();
    expect(listed('Qwerty')).toBeInTheDocument();
    expect(screen.getByText(/of [0-9]+ layouts, without the community ones\./)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('layerbench:session') ?? '{}').state).toMatchObject({
      hideCommunity: true,
    });

    await user.click(community);
    expect(listed('Night owl')).toBeInTheDocument();
  });
});

describe('Categories', () => {
  /** The category badge on a layout's card. */
  const badgeOf = (name: string) =>
    listed(name)?.closest('article')?.querySelector('.lb-category')?.textContent;

  it("shows each card's category beside its name, custom layouts too", async () => {
    const storage = freshStorage();
    const qwerty = bundledLayout('qwerty') as Layout;
    const [base, ...rest] = qwerty.layers;
    await storage.put('layouts', 'copy', toCanonicalJson({ ...qwerty, id: 'copy', name: 'Copy' }));
    const adaptive: Layout = {
      ...qwerty,
      id: 'adaptive',
      name: 'Adaptive',
      layers: [
        {
          ...base,
          bindings: {
            ...base.bindings,
            LHP: { kind: 'adaptive', default: { kind: 'kp', symbol: 'a' } },
          },
        },
        ...rest,
      ],
    };
    await storage.put('layouts', 'adaptive', toCanonicalJson(adaptive));
    renderRoute(LIBRARY, { storage });
    await screen.findByRole('heading', { name: 'Adaptive', level: 3 });
    await waitFor(() => expect(badgeOf('Copy')).toBe('Standard'));
    expect(badgeOf('Adaptive')).toBe('Special');
    expect(badgeOf('Qwerty')).toBe('Standard');
    expect(badgeOf('Hands Down Neu')).toBe('Thumb Alpha');
    expect(badgeOf('Magic Romak')).toBe('Special');
  });

  it('gives a custom layout that will not compile no category', async () => {
    const storage = freshStorage();
    const qwerty = bundledLayout('qwerty') as Layout;
    const [base, ...rest] = qwerty.layers;
    const broken: Layout = {
      ...qwerty,
      id: 'broken',
      name: 'Broken',
      layers: [
        {
          ...base,
          bindings: { ...base.bindings, LHP: { kind: 'macro', symbols: 'qu' } },
        },
        ...rest,
      ],
      geometry: { preset: 'no-such-board' },
    };
    await storage.put('layouts', 'broken', toCanonicalJson(broken));
    renderRoute(LIBRARY, { storage });
    await screen.findByRole('heading', { name: 'Broken', level: 3 });
    await waitFor(() => expect(badgeOf('Qwerty')).toBe('Standard'));
    expect(badgeOf('Broken')).toBeUndefined();
  });

  it('lists only the layouts in the categories chosen, and remembers the choice', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    await openRanking();
    const categories = screen.getByRole('group', { name: 'Categories' });
    const box = (name: RegExp) => within(categories).getByRole('checkbox', { name });
    // As many as the Library has of each, whatever a Library request has changed.
    const count = (c: string) => BUNDLED_LAYOUTS.filter((l) => layoutCategory(l) === c).length;
    const special = box(new RegExp(`^Special \\(${count('special')}\\)$`));
    expect(box(new RegExp(`^Standard \\(${count('standard')}\\)$`))).toBeChecked();
    expect(box(new RegExp(`^Thumb Alpha \\(${count('thumb_alpha')}\\)$`))).toBeChecked();
    expect(count('special') + count('standard') + count('thumb_alpha')).toBe(
      BUNDLED_LAYOUTS.length,
    );

    await user.click(special);
    expect(listed('Magic Romak')).toBeNull();
    expect(listed('Qwerty')).toBeInTheDocument();
    const says = screen.getByText(/of [0-9]+ layouts, in the categories chosen\./);
    expect(says.tagName).toBe('P');
    expect(JSON.parse(localStorage.getItem('layerbench:session') ?? '{}').state).toMatchObject({
      hiddenCategories: ['special'],
    });

    const all = box(/^All$/) as HTMLInputElement;
    expect(all.indeterminate).toBe(true);
    await user.click(all);
    expect(all.indeterminate).toBe(false);
    expect(listed('Magic Romak')).toBeInTheDocument();
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

  it('draws each key of a card as Analyze does, what a hold does along its bottom, numbered and listed', async () => {
    renderRoute(LIBRARY, { storage: freshStorage() });
    const card = async (name: string) =>
      (await screen.findByRole('heading', { name, level: 3 })).closest('article') as HTMLElement;
    const qwerty = (await card('Qwerty')).querySelector('svg.lb-keyboard') as SVGElement;
    // L0 types space and holds Numbers; R0 holds Symbols and taps nothing.
    const holds = [...qwerty.querySelectorAll('.lb-key-hold')].map((t) => t.textContent);
    expect(holds).toEqual(expect.arrayContaining(['Numb', 'Symb']));
    // An adaptive key's branches do not fit it: it is numbered, and listed under the board.
    const magic = await card('Magic Romak');
    expect(magic.querySelectorAll('svg.lb-keyboard .lb-key-number').length).toBeGreaterThan(0);
    const list = within(magic).getByRole('list', { name: 'Key legend' });
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(0);
    // The navigator stays right under the board, the list after it, as on Analyze.
    const board = magic.querySelector('svg.lb-keyboard') as SVGElement;
    const nav = within(magic).getByRole('group', { name: 'Magic Romak layers' });
    const follows = (a: Node, b: Node) =>
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect([follows(board, nav), follows(nav, list)]).toEqual([true, true]);
  });

  it("draws a card's combos as the layout is ranked, as Analyze draws them", async () => {
    const combos = async (route: string) => {
      const view = renderRoute(route, { storage: freshStorage() });
      const heading = await screen.findByRole('heading', { name: 'Magic Romak', level: 3 });
      const n = heading.closest('article')?.querySelectorAll('.lb-combo').length ?? 0;
      view.unmount();
      return n;
    };
    expect(await combos(LIBRARY)).toBeGreaterThan(0);
    // Ranked without typing combos, the card draws none, as Analyze does.
    expect(await combos(`${LIBRARY}&off=combos`)).toBe(0);
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
    // A key that reaches a layer left out is transparent, the layer named nowhere.
    expect(await screen.findByText(/^One key reached a layer left out/)).toBeInTheDocument();

    const layoutName = screen.getByLabelText('Name of the new layout');
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
    expect(stored.layers[0].bindings.R1).toEqual({ kind: 'trans' });
    expect(stored.combos[0].keys).toEqual(['LTR', 'LTM']);
    // And every key can be selected in the editor like any other.
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

describe("the Library's maintainers", () => {
  const PULL = 'https://github.com/rafaelromao/layerbench/pull/200';
  const card = (name: string) => listed(name)?.closest('article') as HTMLElement;

  afterEach(() => {
    vi.unstubAllGlobals();
    useGitHubSession.setState({ status: 'unknown', login: null, maintainer: false });
  });

  it('see Delete on bundled and community layouts and Promote on custom and community ones; nobody else does', async () => {
    setCommunitySource(branchWith(communityDoc('night-owl', 'Night owl')));
    const storage = freshStorage();
    await savePlain(storage, 'plain');
    useGitHubSession.setState({ status: 'signed-in', login: 'you', maintainer: false });
    renderRoute(LIBRARY, { storage });
    await screen.findByRole('heading', { name: 'Night owl', level: 3 });
    await screen.findByRole('heading', { name: 'Plain', level: 3 });
    expect(screen.queryByRole('button', { name: /^Promote / })).toBeNull();
    expect(screen.queryByRole('button', { name: /from the Library$/ })).toBeNull();

    act(() => useGitHubSession.setState({ maintainer: true }));
    expect(
      within(card('Qwerty')).getByRole('button', { name: 'Delete Qwerty from the Library' }),
    ).toBeInTheDocument();
    expect(within(card('Qwerty')).queryByRole('button', { name: 'Promote Qwerty' })).toBeNull();
    expect(
      within(card('Night owl')).getByRole('button', { name: 'Delete Night owl from the Library' }),
    ).toBeInTheDocument();
    expect(
      within(card('Night owl')).getByRole('button', { name: 'Promote Night owl' }),
    ).toBeInTheDocument();
    expect(
      within(card('Plain')).getByRole('button', { name: 'Promote Plain' }),
    ).toBeInTheDocument();
    expect(within(card('Plain')).getByRole('button', { name: 'Delete Plain' })).toBeInTheDocument();
  });

  it('promote a custom layout by a pull request, asked about first', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    await savePlain(storage, 'plain', { author: 'Ana' });
    const sent: Record<string, unknown>[] = [];
    localStorage.setItem('layerbench:github-session', 'sealed');
    const reply = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    const real = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/auth/maintain')) {
        sent.push(JSON.parse(String(init?.body)));
        // Asked again, the pull request open for it is left as it is.
        return sent.length === 1
          ? reply({ url: PULL }, 201)
          : reply({ url: PULL, reused: true, unchanged: true });
      }
      if (url.includes('/api/auth/')) {
        return reply({
          available: true,
          clientId: 'Iv1.client',
          signedIn: true,
          login: 'you',
          maintainer: true,
          token: 'ghu_one',
          expiresAt: Date.now() + 3600_000,
        });
      }
      return real(input, init);
    });
    await initGitHubSession();
    renderRoute(LIBRARY, { storage });
    await screen.findByRole('heading', { name: 'Plain', level: 3 });
    await user.click(await within(card('Plain')).findByRole('button', { name: 'Promote Plain' }));
    const dialog = screen.getByRole('dialog', { name: 'Promote Plain' });
    expect(sent).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Open the pull request' }));
    expect(await within(dialog).findByRole('link', { name: PULL })).toHaveAttribute('href', PULL);
    expect(sent[0]).toMatchObject({
      action: 'promote',
      target: { kind: 'custom', id: 'plain' },
      layout: { id: 'plain', name: 'Plain', author: 'Ana' },
    });

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await user.click(await within(card('Plain')).findByRole('button', { name: 'Promote Plain' }));
    const again = screen.getByRole('dialog', { name: 'Promote Plain' });
    await user.click(within(again).getByRole('button', { name: 'Open the pull request' }));
    expect(await within(again).findByRole('status')).toHaveTextContent(
      `A pull request asks for this already, and nothing was sent: ${PULL}. Change it there, or close it to ask again.`,
    );
  });

  it('are told why a layout CI would refuse cannot be deleted or promoted, and nothing is sent', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    await savePlain(storage, 'my-colemak', { name: 'Colemak' });
    useGitHubSession.setState({ status: 'signed-in', login: 'you', maintainer: true });
    renderRoute(LIBRARY, { storage });
    await screen.findByRole('heading', { name: 'Qwerty', level: 3 });
    await user.click(
      await within(card('Qwerty')).findByRole('button', { name: 'Delete Qwerty from the Library' }),
    );
    const kept = screen.getByRole('dialog', { name: 'Delete Qwerty' });
    expect(within(kept).getByRole('alert')).toHaveTextContent(
      'It cannot be done: the golden reports measure it.',
    );
    expect(within(kept).queryByRole('button', { name: 'Open the pull request' })).toBeNull();
    await user.click(within(kept).getByRole('button', { name: 'Close' }));

    await user.click(await screen.findByRole('button', { name: 'Promote Colemak' }));
    const named = screen.getByRole('dialog', { name: 'Promote Colemak' });
    expect(within(named).getByRole('alert')).toHaveTextContent(
      'a layout that comes with the app is called Colemak; rename this one first',
    );
    expect(within(named).queryByRole('button', { name: 'Open the pull request' })).toBeNull();
  });
});

describe('changes proposed from this browser', () => {
  const PULL = 'https://github.com/rafaelromao/layerbench/pull/100';

  afterEach(() => vi.unstubAllGlobals());

  async function withProposal(state: 'open' | 'merged' | 'closed') {
    const storage = freshStorage();
    await savePlain(storage, 'plain');
    await recordProposal(storage, 'plain', {
      name: 'Plain',
      target: { kind: 'bundled', id: 'qwerty' },
      url: PULL,
    });
    const real = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input) === 'https://api.github.com/repos/rafaelromao/layerbench/pulls/100'
        ? new Response(
            JSON.stringify({
              state: state === 'open' ? 'open' : 'closed',
              merged: state === 'merged',
            }),
          )
        : real(input, init),
    );
    renderRoute(LIBRARY, { storage });
    return storage;
  }

  it('are marked on their copy, linked to the pull request, while it is open', async () => {
    await withProposal('open');
    const badge = await screen.findByRole('link', { name: 'proposed' });
    expect(badge).toHaveAttribute('href', PULL);
    expect(badge.closest('article')).toBe(listed('Plain')?.closest('article'));
  });

  it('go with their copy when it is deleted', async () => {
    const user = userEvent.setup();
    const storage = await withProposal('open');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await screen.findByRole('link', { name: 'proposed' });
    await user.click(
      within(listed('Plain')?.closest('article') as HTMLElement).getByRole('button', {
        name: 'Delete Plain',
      }),
    );
    await waitFor(async () => expect(await storage.list('proposals')).toEqual([]));
    expect(await storage.list('layouts')).toEqual([]);
  });

  it('go with their copy once merged, and leave it an ordinary custom layout once closed', async () => {
    const merged = await withProposal('merged');
    expect(await screen.findByText(/Your change to Plain was accepted/)).toBeInTheDocument();
    await waitFor(async () => expect(await merged.list('layouts')).toEqual([]));
    cleanup();

    const closed = await withProposal('closed');
    expect(await screen.findByText(/Your change to Plain was declined/)).toBeInTheDocument();
    expect((await closed.list('layouts')).map((e) => e.id)).toEqual(['plain']);
    await waitFor(() => expect(screen.queryByRole('link', { name: 'proposed' })).toBeNull());
  });
});
