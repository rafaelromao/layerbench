import {
  BUNDLED_LAYOUTS,
  bundledLayout,
  CLASSIC_LAYOUTS,
  compileLayout,
  declaredLanguages,
  forRanking,
  getPreset,
  homeRowLetters,
  LANGUAGE_PROFILES,
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
import { heatMap } from '../engine/heat.js';
import type { AnalysisClient, AnalyzeRequest, ReportDTO } from '../engine/protocol.js';
import { recordProposal } from '../proposals/proposals.js';
import { useSession } from '../state/session.js';
import { CompositeStorage } from '../storage/composite.js';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { branchWith, communityDoc } from '../test/community.js';
import { keyNamed } from '../test/keys.js';
import { layerShareIn, showLayer } from '../test/layers.js';
import { MemoryStorage } from '../test/memory-storage.js';
import {
  customInLink,
  LIBRARY,
  openSettings,
  rankingSays,
  renderRoute,
  testClient,
  toastShown,
} from '../test/render.js';
import { ENGLISH_CORPUS, parseParams, settingsOf } from '../url/params.js';
import { newLayout } from './new-layout.js';

let counter = 0;

/** Each test gets its own database, so custom documents never leak between cases. */
function freshStorage(): IndexedDbAdapter {
  return new IndexedDbAdapter(`layerbench-library-${++counter}`);
}

/**
 * Qwerty as written, its letters alone, saved under the name given: most bundled layouts type the
 * accents, through Accents or, on Magic Romak, its dead keys, and the few that keep their authors'
 * layers do not, so a layout that cannot, with nothing else about it, is a custom one.
 */
async function savePlain(
  storage: IndexedDbAdapter,
  id: string,
  extra: Partial<Layout> = {},
): Promise<void> {
  const plain = CLASSIC_LAYOUTS.find((l) => l.id === 'qwerty') as Layout;
  await storage.put('layouts', id, toCanonicalJson({ ...plain, id, name: 'Plain', ...extra }));
}

/** The boards the bundled layouts are on. */
const BUNDLED_BOARDS = [
  ...new Set(BUNDLED_LAYOUTS.map((l) => ('preset' in l.geometry ? l.geometry.preset : ''))),
];

/** A board no bundled layout is on: with `BUNDLED_BOARDS` hidden, its layouts are listed alone. */
const OWN_BOARD = { preset: '3x5+3' } as const;

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
    hiddenLanguages: [],
    libraryHeat: false,
    libraryHeatMode: 'usage',
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
    await toastShown(/^Saved Mine 2$/);
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
    await toastShown(/^Save failed: offline$/);

    storage.put = put;
    await create();
    await toastShown(/^Saved My layout$/);
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
    await user.click(within(card).getByRole('link', { name: 'Analyze Qwerty' }));
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

  it('puts Analyze last on every card, flush right, with Delete to its left on a custom one', async () => {
    const storage = freshStorage();
    const qwerty = bundledLayout('qwerty') as Layout;
    await storage.put('layouts', 'mine', toCanonicalJson({ ...qwerty, id: 'mine', name: 'Mine' }));
    renderRoute(LIBRARY, { storage });
    const open = await screen.findByRole('link', { name: 'Analyze Mine' });
    expect(open).toHaveTextContent(/^Analyze$/);
    const actions = open.parentElement as HTMLElement;
    expect([...actions.children]).toEqual([
      screen.getByRole('button', { name: 'Delete Mine' }),
      open,
    ]);
    expect(actions).toHaveClass('ml-auto');

    // A bundled card has Open alone, in the same place.
    const bundled = screen.getByRole('link', { name: 'Analyze Qwerty' });
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
    await toastShown(/^Deleted Mine$/);
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
    // An Effort of 400 is the first step's last number, min up to 400, green; 1000 is past 900, max.
    expect(badge(best, 'Effort')?.textContent).toBe('min');
    expect(badge(best, 'Effort')).toHaveClass('badge-success');
    expect(box(best, 'Effort')).toHaveClass('border-success/60');
    // An SFB of 4% is past the ruler's last bound, 3.425.
    expect(badge(best, 'SFB')?.textContent).toBe('max');
    expect(box(best, 'SFB')).toHaveClass('border-error/60');
    expect(badge(worst, 'Effort')?.textContent).toBe('max');
    expect(box(worst, 'Effort')).toHaveClass('border-error/60');
    // Both badges lead to the guide's ruler for the rule set ranked on, the Layouts Doc's by default.
    for (const metric of ['Effort', 'SFB'] as const) {
      expect(badge(best, metric), metric).toHaveAttribute(
        'href',
        expect.stringMatching(/\/guide\/analyzing#the-layouts-doc-rule-set$/),
      );
      expect(badge(best, metric), metric).toHaveAttribute('target', '_blank');
    }
  }, 90_000);

  it('rates a card on the ruler of the rules in the link, and leads its badges to it', async () => {
    // An Effort of 200 reports an SFB of 2.0, which the two rulers name differently: high on the
    // Layouts Doc's, max on cyanophage-like's.
    const { client } = scoringOnly([1000, 200]);
    renderRoute('/library?sample=10005&rules=cyanophage', { client, storage: freshStorage() });

    await rankingSays(/^Scoring layouts on a sample of [\d,]+ symbols… 2 of/, 60_000);
    const [best] = cards();
    for (const metric of ['Effort', 'SFB'] as const) {
      const pill = within(best)
        .getByText(metric, { selector: 'dt' })
        .parentElement?.querySelector('.lb-band');
      expect(pill, metric).toHaveAttribute(
        'href',
        expect.stringMatching(/\/guide\/analyzing#the-cyanophage-like-rule-set$/),
      );
    }
    // An SFB of 2.0 is past his ramp's last step, 1.881; an Effort of 200 is below the first, 400.
    const box = (metric: 'Effort' | 'SFB') =>
      within(best).getByText(metric, { selector: 'dt' }).parentElement;
    expect(box('SFB')?.querySelector('.lb-band')?.textContent).toBe('max');
    expect(box('Effort')?.querySelector('.lb-band')?.textContent).toBe('min');
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
    // A custom rule set carries its own rulers: the badge leads to the guide on rulers in general.
    expect(box('Effort').querySelector('.lb-band')).toHaveAttribute(
      'href',
      expect.stringMatching(/\/guide\/analyzing#the-rulers$/),
    );
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
    expect(within(card).getByRole('link', { name: /^Analyze / })).toHaveAttribute(
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

  it('puts a layout that cannot write the text’s language where its numbers put it, and says what it skips', async () => {
    // Plain has the best effort by far, but no key for ã or ç: it skips them for free. That is said
    // on its card; the order is the sort's alone, so it leads, and no layout is held back.
    const storage = freshStorage();
    await savePlain(storage, 'plain');
    const client = scoringByName((name) => (name === 'Plain' ? 100 : 500));
    renderRoute('/library?corpus=pt-br-general&sample=10002', { client, storage });

    const plain = () => cards().find((c) => c.querySelector('h3')?.textContent === 'Plain');
    await waitFor(
      () => expect(plain()?.querySelector('.lb-skips')?.textContent).toMatch(/Cannot type .*ç/),
      { timeout: 60_000 },
    );
    expect(plain()?.textContent).not.toMatch(/ranked after/);
    expect(cards()[0]).toBe(plain());
    // And the whole list is by Effort, not in two groups: Plain's 100 is the least, the rest tie at 500.
    const efforts = cards().map((c) => valueOn(c, 'Effort'));
    expect(efforts).toEqual([...efforts].sort((a, b) => a - b));
    expect(document.body.textContent).not.toMatch(/come last|ranked after/);
  }, 90_000);

  it('sorts by home row with no regard for the language, as by name', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    await savePlain(storage, 'plain');
    const client = scoringByName((name) => (name === 'Plain' ? 100 : 500));
    renderRoute('/library?corpus=pt-br-general&sample=10002', { client, storage });
    await rankingSays(/^Lower is better for both/, 60_000);

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

  it('scores each layout typed without the features left out of the ranking', async () => {
    const { client, requests } = scoringOnly([500]);
    renderRoute('/library?off=macros&sample=10003', { client, storage: freshStorage() });
    await rankingSays(/^Scoring layouts on a sample of [\d,]+ symbols… 1 of/, 60_000);
    expect(requests[0].layout.name).toBe('Magic Romak');
    // The layout goes as written, and the engine types it without its multi-letter macros.
    expect(requests[0].settings.without).toEqual(['macros']);
    expect(JSON.stringify(requests[0].layout)).toContain('"symbols":"qu"');
  }, 90_000);

  it('ranks every layout in one order by the numbers, those that skip letters among the rest', async () => {
    // Plain has no ñ, which Magic Romak has: its dead keys make it, and its keymap has no `¿` or `¡`,
    // which Spanish only lists as punctuation.
    const storage = freshStorage();
    await savePlain(storage, 'plain');
    renderRoute('/library?corpus=es-general&sample=10000', { storage });
    await rankingSays(/^Lower is better for both/, 60_000);
    await waitFor(
      () => {
        const card = cards().find((c) => c.querySelector('h3')?.textContent === 'Plain');
        expect(card?.querySelector('.lb-skips')?.textContent).toMatch(/^Cannot type .*ñ/);
      },
      { timeout: 30_000 },
    );
    // Said on its card, and nothing more: the whole list is by Effort, Plain where its number puts it.
    const efforts = cards().map((c) => valueOn(c, 'Effort'));
    expect(efforts).toEqual([...efforts].sort((a, b) => a - b));
    // Qwerty, as its author has it, has no ñ either.
    const qwerty = cards().find((c) => c.querySelector('h3')?.textContent === 'Qwerty');
    expect(qwerty?.textContent).toMatch(/Cannot type/);
    const magic = cards().find((c) => c.querySelector('h3')?.textContent === 'Magic Romak');
    expect(magic?.textContent).not.toMatch(/Cannot type/);
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
    // Its place is its numbers': nothing holds it back, whatever it skips.
    expect(plain.querySelector('.lb-skips')?.textContent).toMatch(/of the text\.$/);
    // Qwerty as its author has it types no `ã` or `ç` either, and says so.
    const qwerty = cards().find((c) => c.querySelector('h3')?.textContent === 'Qwerty');
    expect(qwerty?.textContent).toMatch(/Cannot type/);
  }, 90_000);
  it('shows on a bundled card the languages its author states, English when it states none', async () => {
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
    expect(bundledLayout('qwerty')?.languages).toEqual(['en']);
    expect(await chips('Qwerty')).toEqual(['en']);
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
    const plain = await waitFor(() => {
      const card = cards().find((c) => c.querySelector('h3')?.textContent === 'Plain');
      expect(card).toBeTruthy();
      return card as HTMLElement;
    });
    expect(valueOn(mine, 'Effort')).toBe(valueOn(plain, 'Effort'));
  }, 90_000);

  it('does not set apart a layout flagged for a language it is for but cannot type', async () => {
    // Mine is for Spanish and has no ñ, which on an English text costs it nothing: it is flagged, and
    // its numbers, the best, put it first, as they would a layout with no flag at all.
    const storage = freshStorage();
    await savePlain(storage, 'mine', { name: 'Mine', languages: ['en', 'es'] });
    const client = scoringByName((name) => (name === 'Mine' ? 100 : 500));
    renderRoute('/library?corpus=en-general&sample=10007', { client, storage });
    await waitFor(() => expect(cards()[0]?.querySelector('.lb-lacks')).toBeTruthy(), {
      timeout: 60_000,
    });
    expect(cards()[0].querySelector('h3')?.textContent).toBe('Mine');
    const efforts = cards().map((c) => valueOn(c, 'Effort'));
    expect(efforts).toEqual([...efforts].sort((a, b) => a - b));
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
    expect(screen.getByRole('link', { name: 'Analyze Night owl' })).toHaveAttribute(
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

describe('A saved layout that cannot be read', () => {
  // Qwerty as a user makes it: with the default layers, which the bundled one lacks.
  const qwerty = newLayout({
    name: 'Qwerty',
    geometry: '3x5+2',
    start: 'qwerty',
    defaultLayers: true,
  });
  /** Qwerty saved as `name`, its document changed by `change`, as one written by another app, or a bug, can be. */
  async function saveAs(
    storage: IndexedDbAdapter,
    id: string,
    name: string,
    change: (doc: Record<string, unknown>) => void = () => {},
  ) {
    const doc = toCanonicalJson({ ...qwerty, id, name }) as Record<string, unknown>;
    change(doc);
    await storage.put('layouts', id, doc as never);
  }
  const layerOf = (doc: Record<string, unknown>, i: number) =>
    (doc.layers as { bindings: Record<string, unknown> }[])[i].bindings;

  it('leaves the Library working, its card saying why, and Analyze a way back', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    await saveAs(storage, 'mine', 'Mine');
    await saveAs(storage, 'broken', 'Broken', (doc) => {
      layerOf(doc, 0).LHM = { kind: 'bogus' };
    });
    const page = renderRoute(LIBRARY, { storage });

    const card = (await screen.findByRole('heading', { name: 'Broken', level: 3 })).closest(
      'article',
    ) as HTMLElement;
    expect(
      await within(card).findByText(/^It cannot be read: ✖ No key is of kind "bogus"/),
    ).toBeInTheDocument();
    expect(listed('Qwerty')).toBeInTheDocument();
    const mine = (screen.getByRole('heading', { name: 'Mine', level: 3 }) as HTMLElement).closest(
      'article',
    ) as HTMLElement;
    expect(await within(mine).findByRole('group', { name: 'Mine layers' })).toBeInTheDocument();
    expect(within(mine).queryByText(/cannot be read/)).toBeNull();

    await user.click(within(card).getByRole('link', { name: 'Analyze Broken' }));
    expect(await screen.findByText('This layout cannot be opened.')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Open another layout' }));
    expect(await screen.findByRole('heading', { name: 'Mine', level: 3 })).toBeInTheDocument();
    // The choices the analysis was made with come back with it, as the Library tab's link keeps.
    expect(page.currentSearch()).toContain('sample=1000');
  });

  it('opens one saved with imported keys, as Magic Breeze was, without them', async () => {
    const storage = freshStorage();
    // A FUN hold and an Escape on Numbers, kept as imported keys.
    await saveAs(storage, 'breeze', 'Old Breeze', (doc) => {
      const funHeld = {
        kind: 'hold_tap',
        tap: { kind: 'kp', symbol: '1' },
        hold: { kind: 'raw', label: 'FUN' },
      };
      layerOf(doc, 1).LHP = funHeld;
      layerOf(doc, 1).R1 = { kind: 'raw', label: 'Esc' };
    });
    renderRoute(LIBRARY, { storage });

    const card = (await screen.findByRole('heading', { name: 'Old Breeze', level: 3 })).closest(
      'article',
    ) as HTMLElement;
    expect(
      await within(card).findByRole('group', { name: 'Old Breeze layers' }),
    ).toBeInTheDocument();
    expect(within(card).queryByText(/cannot be read/)).toBeNull();

    cleanup();
    renderRoute('/analyze?layout=custom:breeze&sample=1000', { storage });
    expect(await screen.findByRole('group', { name: 'Layers' })).toBeInTheDocument();
    expect(screen.queryByText('This layout cannot be opened.')).toBeNull();
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

  it("leads each card's category to the guide's rules for categories, in a tab of its own", async () => {
    const user = userEvent.setup();
    const view = renderRoute(LIBRARY, { storage: freshStorage() });
    const qwerty = (await screen.findByRole('heading', { name: 'Qwerty', level: 3 })).closest(
      'article',
    ) as HTMLElement;
    const chip = await within(qwerty).findByRole('link', {
      name: 'Standard, help on how layouts are categorized (opens in a new tab)',
    });
    expect(chip).toHaveTextContent(/^Standard$/);
    expect(chip).toHaveAttribute('href', '/guide/analyzing#categories');
    expect(chip).toHaveAttribute('target', '_blank');
    expect(chip).toHaveAttribute('rel', 'noopener');

    // Whatever category a card's keys give it, its chip leads to the same place.
    const neu = (await screen.findByRole('heading', { name: 'Hands Down Neu', level: 3 })).closest(
      'article',
    ) as HTMLElement;
    expect(
      within(neu).getByRole('link', {
        name: 'Thumb Alpha, help on how layouts are categorized (opens in a new tab)',
      }),
    ).toHaveAttribute('href', '/guide/analyzing#categories');

    // In the tab order, so the keyboard reaches it, and following it, by key or click, leaves the
    // Library and the card as they were: the guide opens in its own tab. (The card has no click
    // behaviour of its own: Analyze is a link beside the chip, so this guards a later one.)
    expect(chip).toHaveProperty('tabIndex', 0);
    chip.focus();
    expect(chip).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.click(chip);
    expect(view.currentPath()).toBe('/library');
    expect(listed('Qwerty')).toBeInTheDocument();
    expect(within(qwerty).getByRole('link', { name: 'Analyze Qwerty' })).toBeInTheDocument();
  }, 30_000);

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
    const card = (await screen.findByRole('heading', { name: 'Broken', level: 3 })).closest(
      'article',
    ) as HTMLElement;
    await waitFor(() => expect(badgeOf('Qwerty')).toBe('Standard'));
    expect(badgeOf('Broken')).toBeUndefined();
    expect(within(card).getByText(/^It cannot be read: /)).toBeInTheDocument();
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

describe('Languages', () => {
  /** A box of the Languages group, by its label and count. */
  const languageBox = (name: string | RegExp) =>
    within(screen.getByRole('group', { name: 'Languages' })).getByRole('checkbox', { name });
  /** How many bundled layouts declare a language, English for one that declares none. */
  const declaring = (tag: string) =>
    BUNDLED_LAYOUTS.filter((l) => declaredLanguages(l.languages).includes(tag)).length;
  const label = (tag: string) => LANGUAGE_PROFILES[tag].name;
  const shownCards = () => document.querySelectorAll('article h3').length;

  it('has a box for every language, named and counted, all of them ticked, with All and None', async () => {
    renderRoute(LIBRARY, { storage: freshStorage() });
    await openRanking();
    for (const tag of Object.keys(LANGUAGE_PROFILES)) {
      const box = languageBox(new RegExp(`^${label(tag)} \\(${declaring(tag)}\\)$`));
      expect(box, tag).toBeChecked();
    }
    expect(languageBox(/^All$/)).toBeChecked();
    expect(languageBox(/^None$/)).not.toBeChecked();
    // Everything is listed, and nothing is said to be left out.
    expect(screen.queryByText(/in the languages chosen/)).toBeNull();
  });

  it('lists a layout while a language it declares is ticked: one for English and Portuguese with Portuguese alone', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    await openRanking();
    await user.click(languageBox(/^None$/));
    await user.click(languageBox(new RegExp(`^${label('pt')} `)));
    expect(bundledLayout('magic-romak')?.languages).toEqual(['en', 'pt']);
    expect(listed('Magic Romak')).toBeInTheDocument();
    expect(listed('Romak')).toBeInTheDocument();
    expect(listed('Qwerty')).toBeNull();
    expect(shownCards()).toBe(declaring('pt'));
    const says = screen.getByText(
      `${declaring('pt')} of ${BUNDLED_LAYOUTS.length} layouts, in the languages chosen.`,
    );
    expect(says.tagName).toBe('P');
    expect(languageBox(/^None$/)).not.toBeChecked();
    expect((languageBox(/^All$/) as HTMLInputElement).indeterminate).toBe(true);

    await user.click(languageBox(/^All$/));
    expect(listed('Qwerty')).toBeInTheDocument();
    expect(shownCards()).toBe(BUNDLED_LAYOUTS.length);
  });

  it('lists nothing with None ticked, and says why rather than stand empty', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    await openRanking();
    await user.click(languageBox(/^None$/));
    expect(languageBox(/^None$/)).toBeChecked();
    expect(languageBox(/^All$/)).not.toBeChecked();
    for (const tag of Object.keys(LANGUAGE_PROFILES)) {
      expect(languageBox(new RegExp(`^${label(tag)} `))).not.toBeChecked();
    }
    expect(shownCards()).toBe(0);
    expect(screen.getByText(/^No language is ticked in Rank and filter/)).toBeInTheDocument();
    expect(
      screen.getByText(`0 of ${BUNDLED_LAYOUTS.length} layouts, in the languages chosen.`),
    ).toBeInTheDocument();

    // Unticking None ticks them all again.
    await user.click(languageBox(/^None$/));
    expect(shownCards()).toBe(BUNDLED_LAYOUTS.length);
    expect(screen.queryByText(/^No language is ticked/)).toBeNull();
  });

  it('reads a custom layout that declares no language as one for English', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    await savePlain(storage, 'plain', { languages: undefined });
    renderRoute(LIBRARY, { storage });
    const card = (await screen.findByRole('heading', { name: 'Plain', level: 3 })).closest(
      'article',
    ) as HTMLElement;
    await waitFor(() =>
      expect(
        [...card.querySelectorAll('[title^="Types everything"]')].map((b) => b.textContent),
      ).toEqual(['en']),
    );
    await openRanking();
    // Counted with English, and listed with English alone.
    await waitFor(() =>
      expect(languageBox(`${label('en')} (${declaring('en') + 1})`)).toBeInTheDocument(),
    );
    await user.click(languageBox(/^None$/));
    await user.click(languageBox(new RegExp(`^${label('en')} `)));
    expect(listed('Plain')).toBeInTheDocument();
    // Gone without English, whatever else is ticked.
    await user.click(languageBox(/^All$/));
    await user.click(languageBox(new RegExp(`^${label('en')} `)));
    expect(listed('Plain')).toBeNull();
    expect(listed('Magic Romak')).toBeInTheDocument();
  });

  it('reads a layout for a language it has no box for as one for English', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    await savePlain(storage, 'plain', { languages: ['xx'] });
    // Tags are matched as written: `ES` is not Spanish.
    await savePlain(storage, 'upper', { name: 'Upper', languages: ['ES'] });
    renderRoute(LIBRARY, { storage });
    const card = (await screen.findByRole('heading', { name: 'Plain', level: 3 })).closest(
      'article',
    ) as HTMLElement;
    await screen.findByRole('heading', { name: 'Upper', level: 3 });
    // A language the app has no profile for gets no chip.
    await within(card).findByText(/Effort/);
    expect(
      card.querySelectorAll('[title^="Types everything"], [title^="Cannot type"]'),
    ).toHaveLength(0);
    await openRanking();
    await waitFor(() =>
      expect(languageBox(`${label('en')} (${declaring('en') + 2})`)).toBeInTheDocument(),
    );
    expect(languageBox(`${label('es')} (${declaring('es')})`)).toBeInTheDocument();
    await user.click(languageBox(/^None$/));
    await user.click(languageBox(new RegExp(`^${label('pt')} `)));
    await user.click(languageBox(new RegExp(`^${label('es')} `)));
    expect(listed('Plain')).toBeNull();
    expect(listed('Upper')).toBeNull();
    await user.click(languageBox(new RegExp(`^${label('en')} `)));
    expect(listed('Plain')).toBeInTheDocument();
    expect(listed('Upper')).toBeInTheDocument();
  });

  it('lists a custom layout that will not open under any language ticked, and not under None', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const doc = toCanonicalJson({
      ...(CLASSIC_LAYOUTS.find((l) => l.id === 'qwerty') as Layout),
      id: 'broken',
      name: 'Broken',
    }) as Record<string, unknown>;
    (doc.layers as { bindings: Record<string, unknown> }[])[0].bindings.LHM = { kind: 'bogus' };
    await storage.put('layouts', 'broken', doc as never);
    renderRoute(LIBRARY, { storage });
    const card = (await screen.findByRole('heading', { name: 'Broken', level: 3 })).closest(
      'article',
    ) as HTMLElement;
    await within(card).findByText(/^It cannot be read: /);
    await openRanking();
    await user.click(languageBox(/^None$/));
    expect(listed('Broken')).toBeNull();
    await user.click(languageBox(new RegExp(`^${label('de')} `)));
    expect(listed('Broken')).toBeInTheDocument();
  });

  it('says so when the other filters leave nothing to list', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    await openRanking();
    await user.click(
      within(screen.getByRole('group', { name: 'Categories' })).getByRole('checkbox', {
        name: 'All',
      }),
    );
    expect(shownCards()).toBe(0);
    expect(
      screen.getByText('No layout is left by the choices in Rank and filter.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^No language is ticked/)).toBeNull();
  });

  it('reads a stored choice from before the filter as every language ticked', async () => {
    localStorage.setItem(
      'layerbench:session',
      JSON.stringify({ state: { librarySort: 'effort', hiddenCategories: [] }, version: 0 }),
    );
    // What was stored has no languages: the store keeps its default, every language ticked.
    await useSession.persist.rehydrate();
    expect(useSession.getState().hiddenLanguages).toEqual([]);
    renderRoute(LIBRARY, { storage: freshStorage() });
    expect(await screen.findByRole('heading', { name: 'Qwerty', level: 3 })).toBeTruthy();
    expect(screen.queryByText(/in the languages chosen/)).toBeNull();
  });

  it('remembers the choice in this browser, across a reload, and not in the link', async () => {
    const user = userEvent.setup();
    const first = renderRoute(LIBRARY, { storage: freshStorage() });
    await openRanking();
    await user.click(languageBox(new RegExp(`^${label('en')} `)));
    expect(JSON.parse(localStorage.getItem('layerbench:session') ?? '{}').state).toMatchObject({
      hiddenLanguages: ['en'],
    });
    expect(first.currentSearch()).not.toContain('lang');
    first.unmount();

    const stored = localStorage.getItem('layerbench:session') ?? '';
    useSession.setState({ hiddenLanguages: [] });
    localStorage.setItem('layerbench:session', stored);
    await useSession.persist.rehydrate();
    const { currentSearch } = renderRoute(LIBRARY, { storage: freshStorage() });
    expect(await screen.findByRole('heading', { name: 'Magic Romak', level: 3 })).toBeTruthy();
    expect(listed('Qwerty')).toBeNull();
    expect(screen.getByText(/of [0-9]+ layouts, in the languages chosen\./)).toBeInTheDocument();
    expect(currentSearch()).not.toContain('lang');
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
    const analyze = within(card).getByRole('link', { name: /^Analyze / }) as HTMLAnchorElement;
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
    const analyze = within(card as HTMLElement).getByRole('link', { name: /^Analyze / });
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

  it('draws each key of a card as Analyze does, what a hold does along its bottom, numbered but not listed', async () => {
    renderRoute(LIBRARY, { storage: freshStorage() });
    const card = async (name: string) =>
      (await screen.findByRole('heading', { name, level: 3 })).closest('article') as HTMLElement;
    const rsthd = (await card('RSTHD')).querySelector('svg.lb-keyboard') as SVGElement;
    // Its inner thumbs tap e and space and hold Symbols.
    const holds = [...rsthd.querySelectorAll('.lb-key-hold')].map((t) => t.textContent);
    expect(holds).toEqual(['Symb', 'Symb']);
    // An adaptive key's branches do not fit it: it is numbered, as on Analyze, but a card is a
    // glance at the layout, and lists nothing under its board.
    const magic = await card('Magic Romak');
    expect(magic.querySelectorAll('svg.lb-keyboard .lb-key-number').length).toBeGreaterThan(0);
    expect(within(magic).queryByRole('list', { name: 'Key legend' })).toBeNull();
    // The navigator is right under the board.
    const board = magic.querySelector('svg.lb-keyboard') as SVGElement;
    const nav = within(magic).getByRole('group', { name: 'Magic Romak layers' });
    expect(board.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  /** A layout's card, by its name. */
  const cardOf = (name: string) => (listed(name) as HTMLElement).closest('article') as HTMLElement;

  it('reaches the combos the board does not draw, beside the layers, without opening the card', async () => {
    const user = userEvent.setup();
    const { currentSearch } = renderRoute(LIBRARY, { storage: freshStorage() });
    await screen.findByRole('group', { name: 'T-34 layers' });
    const before = currentSearch();
    const card = cardOf('T-34');
    // On the navigator's line, so the card is no taller for it.
    const nav = within(card).getByRole('group', { name: 'T-34 layers' });
    const button = within(card).getByRole('button', { name: '40 more combos on Base' });
    expect(nav.parentElement?.contains(button)).toBe(true);

    await user.click(button);
    const dialog = screen.getByRole('dialog', { name: 'Combos on Base' });
    // Out of the card, so that the card moving as the list re-sorts leaves it in the top layer.
    expect(card.contains(dialog)).toBe(false);
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(40);
    // A card edits nothing: each combo is drawn, not a button to pick.
    expect(within(dialog).getByRole('figure', { name: 'Combo L0 + LHP: |' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^Edit combo/ })).toBeNull();
    expect(currentSearch()).toBe(before);
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Combos on Base' })).toBeNull();
    expect(button).toHaveFocus();
  });

  it('counts them on each layer, and shows no button where there are none', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    await screen.findByRole('group', { name: 'Hands Down Gold layers' });
    const gold = within(cardOf('Hands Down Gold'));
    expect(gold.getByRole('button', { name: '12 more combos on Base' })).toHaveTextContent(
      /^Combos$/,
    );
    // Hands Down Gold's Numbers has none apart, nor has any layer of Graphite.
    await showLayer(user, 'Numbers', 'Hands Down Gold layers');
    expect(gold.queryByRole('button', { name: /more combos? on/ })).toBeNull();
    // The navigator keeps the middle of its row, so the arrows do not move as the layers turn; its
    // sides keep room for the button on Numbers too, which has none.
    const nav = gold.getByRole('group', { name: 'Hands Down Gold layers' });
    expect(nav).toHaveClass('col-start-2');
    expect(nav.parentElement?.className).toContain('minmax(4.75rem,1fr)');
    // A board with nothing beside its navigator on any layer gives the room to the name.
    const plain = within(cardOf('Graphite')).getByRole('group', { name: 'Graphite layers' });
    expect(plain.parentElement?.className).toContain(
      'grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)]',
    );
    expect(
      within(cardOf('Graphite')).queryByRole('button', { name: /more combos? on/ }),
    ).toBeNull();
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
    expect(await screen.findByRole('button', { name: keyNamed('Key LTP: w') })).toBeInTheDocument();
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

  it('reaches a combo the preview does not draw, as a card does', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    await openKeymapImport();
    await user.click(await screen.findByLabelText('keymap-drawer YAML'));
    // Three keys: no gap to draw it on.
    await user.paste(`${KEYMAP}  - {p: [0, 1, 2], k: Z, l: [Def]}\n`);
    await screen.findByRole('combobox', { name: 'Board to import onto' });
    await user.click(await screen.findByRole('button', { name: '1 more combo on Def' }));
    const dialog = screen.getByRole('dialog', { name: 'Combos on Def' });
    expect(within(dialog).getByRole('figure', { name: /: z$/ })).toBeInTheDocument();
    // Closing it leaves the import open under it.
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.getByLabelText('keymap-drawer YAML')).toBeVisible();
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
    // Saved without languages, as a layout from before they were asked for may be.
    await savePlain(storage, 'plain', { author: 'Ana', languages: undefined });
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
      layout: { id: 'plain', name: 'Plain', author: 'Ana', languages: ['en'] },
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

  async function withProposal(state: 'open' | 'merged' | 'closed', storage = freshStorage()) {
    // No bundled layout is listed. The Library draws and scores every layout it lists on the test's
    // thread, and settling a proposal goes through IndexedDB a turn of that thread at a time: with
    // every bundled layout listed too, under coverage on a busy runner, the toast came too late.
    await savePlain(storage, 'plain', { geometry: OWN_BOARD });
    useSession.setState({ hiddenBoards: BUNDLED_BOARDS });
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
    // Beside a custom layout no change was proposed from.
    const storage = freshStorage();
    await savePlain(storage, 'mine', { name: 'Mine', geometry: OWN_BOARD });
    await withProposal('open', storage);
    const badge = await screen.findByRole('link', { name: 'proposed' });
    expect(badge).toHaveAttribute('href', PULL);
    expect(badge.closest('article')).toBe(listed('Plain')?.closest('article'));
    expect(listed('Mine')).not.toBeNull();
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
    await toastShown(/Your change to Plain was accepted/);
    await waitFor(async () => expect(await merged.list('layouts')).toEqual([]));
    cleanup();

    const closed = await withProposal('closed');
    await toastShown(/Your change to Plain was declined/);
    expect((await closed.list('layouts')).map((e) => e.id)).toEqual(['plain']);
    // Still listed, without the badge: a custom layout of its own.
    await waitFor(() => {
      expect(listed('Plain')).not.toBeNull();
      expect(screen.queryByRole('link', { name: 'proposed' })).toBeNull();
    });
  });
});

describe('Heatmaps on the cards', () => {
  /** The heat of each key of a board, in percent, as drawn; keys with none left out, lowest first. */
  const heatPercents = (svg: Element) =>
    [...svg.querySelectorAll('.lb-key-cap')]
      .map((cap) =>
        Number(/var\(--lb-heat\) (\d+)%/.exec(cap.getAttribute('style') ?? '')?.[1] ?? 0),
      )
      .filter((pct) => pct > 0)
      .sort((a, b) => a - b);

  const boardOf = async (name: string) =>
    (await screen.findByRole('heading', { name, level: 3 }))
      .closest('article')
      ?.querySelector('svg.lb-keyboard') as SVGElement;

  /** Qwerty analyzed as the Library scores it, which is what Analyze would show for it. */
  async function qwertyReport(client: AnalysisClient): Promise<ReportDTO> {
    const link = forRanking(
      settingsOf(parseParams({ corpus: ENGLISH_CORPUS, sample: '1000' }, ENGLISH_CORPUS)),
    );
    return client.analyze({
      layout: toCanonicalJson(bundledLayout('qwerty') as Layout),
      settings: { ...link, rules: getPreset(link.rules) },
    });
  }

  /** What `heatMap` gives for the report, as the board draws it: percents, lowest first. */
  const percentsOf = (report: ReportDTO, mode: Parameters<typeof heatMap>[1]) =>
    Object.values(heatMap(report, mode, 0))
      .map((v) => Math.round(v * 100))
      .filter((pct) => pct > 0)
      .sort((a, b) => a - b);

  it('is off until asked: pressed or not, with no Heat choice, no legend and no colour', async () => {
    renderRoute(LIBRARY, { storage: freshStorage() });
    const toggle = await screen.findByRole('button', { name: 'Heatmaps' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('combobox', { name: 'Heat' })).toBeNull();
    expect(document.querySelector('.lb-heat-legend')).toBeNull();
    await rankingSays(/^Lower is better for both/, 60_000);
    expect(heatPercents(await boardOf('Qwerty'))).toEqual([]);
  }, 90_000);

  it('colours each card as it is scored, with what Analyze draws for it on the same settings', async () => {
    const user = userEvent.setup();
    const { client } = renderRoute(LIBRARY, { storage: freshStorage() });
    await user.click(await screen.findByRole('button', { name: 'Heatmaps' }));
    expect(screen.getByRole('button', { name: 'Heatmaps' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The same five measures Analyze offers, usage first, and what the colours mean.
    const choice = screen.getByRole('combobox', { name: 'Heat' });
    expect(choice).toHaveValue('usage');
    expect([...choice.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Usage',
      'SFB contribution',
      'Effort',
      'Finger travel',
      'Layer taps',
    ]);
    expect(document.querySelector('.lb-heat-legend')?.textContent).toContain(
      'Usage: how often the key is pressed, against the busiest key of all layers.',
    );

    await rankingSays(/^Lower is better for both/, 60_000);
    const expected = percentsOf(await qwertyReport(client), 'usage');
    expect(expected.length).toBeGreaterThan(10);
    expect(heatPercents(await boardOf('Qwerty'))).toEqual(expected);
  }, 120_000);

  it('writes the share of the presses made on the layer shown, in every mode, only with heat on', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    const card = (await boardOf('Hands Down Gold')).closest('article') as HTMLElement;
    // Qwerty has no Combos button on any layer: with heat off nothing is beside its navigator.
    const qwerty = (await boardOf('Qwerty')).closest('article') as HTMLElement;
    const qwertyRow = () =>
      (within(qwerty).getByTestId('layer-name-slot').closest('fieldset') as HTMLElement)
        .parentElement?.className ?? '';
    await rankingSays(/^Lower is better for both/, 60_000);
    expect(layerShareIn(card)).toBeNull();
    expect(qwertyRow()).toContain('grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)]');

    await user.click(screen.getByRole('button', { name: 'Heatmaps' }));
    // The share alone is beside it now, and both sides keep room on every layer for it.
    await waitFor(() => expect(layerShareIn(qwerty)).not.toBeNull());
    expect(qwertyRow()).toContain('minmax(4.75rem,1fr)');
    const nav = within(card).getByRole('group', { name: 'Hands Down Gold layers' });
    const next = within(nav).getByRole('button', { name: 'Next layer' });
    const previous = within(nav).getByRole('button', { name: 'Previous layer' });
    /** The share written on each layer, from the first to the last. */
    const shares = async () => {
      while (previous.getAttribute('aria-disabled') !== 'true') await user.click(previous);
      const out: number[] = [];
      for (;;) {
        const share = await waitFor(() => {
          const v = layerShareIn(card);
          expect(v).not.toBeNull();
          return v as number;
        });
        out.push(share);
        if (next.getAttribute('aria-disabled') === 'true') return out;
        await user.click(next);
      }
    };
    const usage = await shares();
    expect(usage.length).toBeGreaterThan(1);
    expect(usage[0]).toBeGreaterThan(50);
    // Each share is rounded to a tenth, so the sum is within a tenth per layer of 100.
    const sum = usage.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.05 * usage.length + 1e-9);

    // A usage fact, the same whatever the colours measure.
    const choice = screen.getByRole('combobox', { name: 'Heat' });
    for (const mode of ['sfb', 'effort', 'travel', 'layer_taps']) {
      await user.selectOptions(choice, mode);
      expect(await shares()).toEqual(usage);
    }

    await user.click(screen.getByRole('button', { name: 'Heatmaps' }));
    expect(layerShareIn(card)).toBeNull();
  }, 120_000);

  it('changes what it measures without analyzing anything again, as Analyze would', async () => {
    const user = userEvent.setup();
    const client = testClient();
    const analyze = vi.spyOn(client, 'analyze');
    const peek = vi.spyOn(client, 'peek');
    renderRoute(LIBRARY, { client, storage: freshStorage() });
    await user.click(await screen.findByRole('button', { name: 'Heatmaps' }));
    await rankingSays(/^Lower is better for both/, 60_000);
    const report = await qwertyReport(client);
    const [analyses, peeks] = [analyze.mock.calls.length, peek.mock.calls.length];

    const choice = screen.getByRole('combobox', { name: 'Heat' });
    for (const [label, mode] of [
      ['SFB contribution', 'sfb'],
      ['Effort', 'effort'],
      ['Finger travel', 'travel'],
      ['Layer taps', 'layer_taps'],
    ] as const) {
      await user.selectOptions(choice, label);
      const expected = percentsOf(report, mode);
      // A rule's mode colours something on Qwerty's base layer; layer taps may not.
      if (mode !== 'layer_taps') expect(expected.length).toBeGreaterThan(0);
      expect(heatPercents(await boardOf('Qwerty'))).toEqual(expected);
      expect(document.querySelector('.lb-heat-legend p')?.textContent).toMatch(
        new RegExp(`^${label}: `),
      );
    }
    expect([analyze.mock.calls.length, peek.mock.calls.length]).toEqual([analyses, peeks]);
  }, 120_000);

  it('says what a key’s colour is, in words, to anyone who cannot see it', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    await user.click(await screen.findByRole('button', { name: 'Heatmaps' }));
    await rankingSays(/^Lower is better for both/, 60_000);
    const keys = [...(await boardOf('Qwerty')).querySelectorAll('.lb-key')];
    const hottest = keys.find((key) =>
      key.querySelector('title')?.textContent?.includes('Usage: 100% of the busiest key'),
    );
    expect(hottest?.getAttribute('aria-label')).toMatch(/Usage: 100% of the busiest key$/);
    // A key with no heat says nothing of it.
    expect(
      keys.some((key) => !key.querySelector('title')?.textContent?.includes('of the busiest key')),
    ).toBe(true);
  }, 120_000);

  it('remembers, in this browser, whether it is on and what it measures', async () => {
    const user = userEvent.setup();
    const first = renderRoute(LIBRARY, { storage: freshStorage() });
    await user.click(await screen.findByRole('button', { name: 'Heatmaps' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Heat' }), 'Layer taps');
    expect(JSON.parse(localStorage.getItem('layerbench:session') ?? '{}').state).toMatchObject({
      libraryHeat: true,
      libraryHeatMode: 'layer_taps',
    });
    first.unmount();

    // The next visit reads it back from the browser, and the link carries none of it. Resetting the
    // store writes its defaults to the browser too, so what was stored is put back before it reads.
    const stored = localStorage.getItem('layerbench:session') ?? '';
    useSession.setState({ libraryHeat: false, libraryHeatMode: 'usage' });
    localStorage.setItem('layerbench:session', stored);
    await useSession.persist.rehydrate();
    const { currentSearch } = renderRoute(LIBRARY, { storage: freshStorage() });
    expect(await screen.findByRole('button', { name: 'Heatmaps' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('combobox', { name: 'Heat' })).toHaveValue('layer_taps');
    expect(currentSearch()).not.toContain('heat');
  });

  it('reads a heat mode it does not have as usage', async () => {
    useSession.setState({ libraryHeat: true, libraryHeatMode: 'gone' as never });
    renderRoute(LIBRARY, { storage: freshStorage() });
    expect(await screen.findByRole('combobox', { name: 'Heat' })).toHaveValue('usage');
  });

  it('keeps working where the browser will not store the choice', async () => {
    const user = userEvent.setup();
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('the quota is exceeded', 'QuotaExceededError');
    });
    try {
      renderRoute(LIBRARY, { storage: freshStorage() });
      await user.click(await screen.findByRole('button', { name: 'Heatmaps' }));
      expect(screen.getByRole('button', { name: 'Heatmaps' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await user.selectOptions(screen.getByRole('combobox', { name: 'Heat' }), 'Effort');
      expect(screen.getByRole('combobox', { name: 'Heat' })).toHaveValue('effort');
    } finally {
      set.mockRestore();
    }
  });
});
