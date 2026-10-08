import { BUNDLED_LAYOUTS, bundledLayout, type Layout, toCanonicalJson } from '@layerbench/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisClient, AnalyzeRequest, ReportDTO } from '../engine/protocol.js';
import { useSession } from '../state/session.js';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { LIBRARY, openSettings, renderRoute, savedInLink, testClient } from '../test/render.js';

let counter = 0;

/** Each test gets its own database, so saved documents never leak between cases. */
function freshStorage(): IndexedDbAdapter {
  return new IndexedDbAdapter(`layerbench-library-${++counter}`);
}

/** The ranking choices, sort and board filter are in a dialog of their own. */
async function openRanking() {
  await userEvent.click(await screen.findByRole('button', { name: 'Rank and filter' }));
}

// The sort and the filters are remembered in this browser; each test starts from the defaults.
beforeEach(() =>
  useSession.setState({ librarySort: 'effort', hiddenBoards: [], hideSaved: false }),
);

describe('Creating layouts', () => {
  it('creates a layout from scratch and opens it in the editor', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const { currentSearch } = renderRoute(LIBRARY, { storage });

    await user.click(await screen.findByRole('button', { name: 'New layout' }));
    const dialog = screen.getByRole('form', { name: 'New layout' });
    const name = within(dialog).getByLabelText('New layout name');
    await user.clear(name);
    await user.type(name, 'Bird nest');
    await user.selectOptions(within(dialog).getByLabelText('New layout board'), '23332+2');
    await user.click(within(dialog).getByLabelText('Add number and symbol layers'));
    await user.click(within(dialog).getByRole('button', { name: 'Create and edit' }));

    await waitFor(async () => expect(await savedInLink(currentSearch())).toBe('bird-nest'));
    const stored = await storage.get('layouts', 'bird-nest');
    expect(stored).not.toBeNull();
    const doc = stored?.doc as { name: string; layers: unknown[] };
    expect(doc.name).toBe('Bird nest');
    expect(doc.layers).toHaveLength(3);
  });

  it('puts the new-layout dialog away on a tap around it, or Escape', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });

    await user.click(await screen.findByRole('button', { name: 'New layout' }));
    const form = screen.getByRole('form', { name: 'New layout' });
    await user.click(form.parentElement as HTMLElement);
    expect(screen.queryByRole('form', { name: 'New layout' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'New layout' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('form', { name: 'New layout' })).toBeNull();
  });

  it('duplicates a bundled layout under a free id instead of overwriting', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    renderRoute(LIBRARY, { storage });

    await user.click(await screen.findByRole('button', { name: 'Duplicate Qwerty' }));
    await waitFor(async () =>
      expect((await storage.get('layouts', 'qwerty-copy'))?.doc.name).toBe('Qwerty copy'),
    );
    // It says what it saved by name; the id is only for links.
    expect(await screen.findByText('Saved Qwerty copy')).toBeInTheDocument();
  });

  it('opens a copy in Analyze, to edit, on the corpus and rules the Library ranks by', async () => {
    const user = userEvent.setup();
    const { currentPath, currentSearch } = renderRoute(LIBRARY, { storage: freshStorage() });
    await openRanking();
    const corpus = await screen.findByRole('combobox', { name: 'Corpus' });
    await waitFor(() => expect(within(corpus).getAllByRole('option').length).toBeGreaterThan(1));
    await user.selectOptions(corpus, 'pt-br-conv');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rule set' }), 'cyanophage');
    await waitFor(() => expect(currentSearch()).toContain('rules=cyanophage'));

    await user.click(screen.getByRole('button', { name: 'Duplicate Qwerty' }));
    await waitFor(() => expect(currentPath()).toBe('/analyze'));
    await waitFor(async () => expect(await savedInLink(currentSearch())).toBe('qwerty-copy'));
    expect(currentSearch()).toContain('corpus=pt-br-conv');
    expect(currentSearch()).toContain('rules=cyanophage');
    await screen.findByRole('region', { name: 'Layout' }, { timeout: 25_000 });
    const settings = await openSettings();
    expect(within(settings).getByRole('combobox', { name: 'Corpus' })).toHaveValue('pt-br-conv');
    expect(within(settings).getByRole('combobox', { name: 'Rule set' })).toHaveValue('cyanophage');
  }, 60_000);

  it('deletes a saved layout, naming it', async () => {
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
    renderRoute('/library?corpus=en-conv&sample=1000', { storage: freshStorage() });

    // Every bundled layout gets both numbers once scoring settles.
    await screen.findByText(/^Lower is better for both/, undefined, { timeout: 60_000 });
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

    await screen.findByText(/^Scoring layouts on a sample of [\d,]+ symbols… 2 of/, undefined, {
      timeout: 60_000,
    });
    expect(screen.getByRole('radio', { name: 'Effort' })).toBeChecked();
    const names = [...document.querySelectorAll('article h3')].map((h) => h.textContent);
    // The better of the two scored comes first, the worse second, and the unscored wait below.
    expect(names.slice(0, 2)).toEqual([scored[1], scored[0]]);
    expect(cards()).toHaveLength(2);
  }, 90_000);

  /**
   * An engine that scores each layout by its name, at once. Which layout is scored when depends on
   * when a saved document has been read, so the score has to follow the layout, not the order.
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

  it('ranks a saved layout in the same list as the bundled ones', async () => {
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

    // Not "Lower is better", which does not wait for a saved document still being read.
    const names = () => [...document.querySelectorAll('article h3')].map((h) => h.textContent);
    await waitFor(() => expect(names()[0]).toBe('My Graphite'), { timeout: 60_000 });
    const card = cards()[0];
    expect(within(card).getByText('saved')).toBeInTheDocument();
    // Analyze is where it is edited too: there is no separate way in.
    expect(within(card).getByRole('link', { name: 'Analyze' })).toHaveAttribute(
      'href',
      expect.stringContaining('saved%3Amy-graphite'),
    );
    expect(within(card).queryByRole('link', { name: 'Edit' })).toBeNull();
    // The bundled layouts carry no badge.
    expect(within(cards()[1]).queryByText('saved')).toBeNull();

    // By name, it takes its place among the bundled layouts rather than after them.
    await user.click(screen.getByRole('radio', { name: 'Name' }));
    const byName = names();
    expect(byName).toEqual([...byName].sort((a, b) => (a ?? '').localeCompare(b ?? '')));
    expect(byName.indexOf('My Graphite')).toBeGreaterThan(0);
    expect(byName.indexOf('My Graphite')).toBeLessThan(byName.length - 1);
  }, 90_000);

  it('ranks a layout that cannot write the text’s language after one that can', async () => {
    // Magic Romak is scored first and types Portuguese; Qwerty, scored after it with a far better
    // effort, has no key for ã or ç and would skip them for free. Romak 34, between them, gets a
    // number too, so the scoring can reach Qwerty.
    const { client, scored } = scoringOnly([900, 950, 100]);
    renderRoute('/library?corpus=pt-br-general&sample=10002', {
      client,
      storage: freshStorage(),
    });

    await screen.findByText(/^Scoring layouts on a sample of [\d,]+ symbols… 3 of/, undefined, {
      timeout: 60_000,
    });
    expect(scored).toEqual(['Magic Romak', 'Romak 34', 'Qwerty']);
    // First despite its far worse effort: Qwerty is behind it.
    const names = [...document.querySelectorAll('article h3')].map((h) => h.textContent);
    expect(names[0]).toBe('Magic Romak');
    const qwerty = cards().find((c) => c.querySelector('h3')?.textContent === 'Qwerty');
    expect(qwerty?.textContent).toMatch(/Cannot type .*ç.*ranked after the layouts that can/);
  }, 90_000);

  it('scores each layout typed without the features left out of the ranking', async () => {
    const { client, requests } = scoringOnly([500]);
    renderRoute('/library?off=macros&sample=10003', { client, storage: freshStorage() });
    await screen.findByText(/^Scoring layouts on a sample of [\d,]+ symbols… 1 of/, undefined, {
      timeout: 60_000,
    });
    expect(requests[0].layout.name).toBe('Magic Romak');
    const sent = JSON.stringify(requests[0].layout);
    // `qu` is two letters in one press, and goes; an accent is one letter, and stays.
    expect(sent).not.toContain('"symbols":"qu"');
    expect(sent).toContain('"symbols":"é"');
  }, 90_000);

  it('ranks by the numbers alone when no layout can write the language', async () => {
    // No bundled layout has an ñ, so none is behind another for it.
    renderRoute('/library?corpus=es-conv&sample=10000', { storage: freshStorage() });
    await screen.findByText(/^Lower is better for both/, undefined, { timeout: 60_000 });
    expect(
      screen.getByText(/None of these layouts types every letter Español needs\.$/),
    ).toBeTruthy();
    const efforts = cards().map((c) => valueOn(c, 'Effort'));
    expect(efforts).toEqual([...efforts].sort((a, b) => a - b));
    expect(document.body.textContent).not.toMatch(/ranked after the layouts that can/);
  }, 90_000);

  it('says what share of the text a layout skips', async () => {
    renderRoute('/library?corpus=pt-br-general&sample=10000', { storage: freshStorage() });
    await screen.findByText(/^Lower is better for both/, undefined, { timeout: 60_000 });
    expect(screen.getByText(/come last\.$/)).toBeInTheDocument();
    const qwerty = cards().find((c) => c.querySelector('h3')?.textContent === 'Qwerty');
    expect(qwerty?.querySelector('.lb-skips')?.textContent).toMatch(/skips \d+\.\d\d% of the text/);
    // Magic Romak can leave out a stray º or ñ, but it types every letter Portuguese needs.
    const romak = cards().find((c) => c.querySelector('h3')?.textContent === 'Magic Romak');
    expect(romak?.textContent).not.toMatch(/Cannot type/);
    expect(cards()[0]).toBe(romak);
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
    expect(screen.queryByRole('button', { name: 'Duplicate Qwerty' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Duplicate Bird' })).toBeInTheDocument();
    expect(screen.getByText(/of [0-9]+ layouts, on the boards chosen/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('layerbench:session') ?? '{}').state).toMatchObject({
      hiddenBoards: ['3x5+2'],
    });

    const all = within(boards).getByRole('checkbox', { name: 'All' }) as HTMLInputElement;
    expect(all.indeterminate).toBe(true);
    await user.click(all);
    expect(screen.getByRole('button', { name: 'Duplicate Qwerty' })).toBeInTheDocument();
  });

  it('leaves the saved layouts out when asked, and remembers the choice', async () => {
    const user = userEvent.setup();
    const storage = freshStorage();
    const qwerty = bundledLayout('qwerty') as Layout;
    await storage.put('layouts', 'mine', toCanonicalJson({ ...qwerty, id: 'mine', name: 'Mine' }));
    renderRoute(LIBRARY, { storage });
    expect(await screen.findByRole('button', { name: 'Duplicate Mine' })).toBeInTheDocument();

    await openRanking();
    const layouts = screen.getByRole('group', { name: 'Layouts' });
    const saved = within(layouts).getByRole('checkbox', { name: 'Saved layouts (1)' });
    expect(saved).toBeChecked();

    await user.click(saved);
    expect(screen.queryByRole('button', { name: 'Duplicate Mine' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Duplicate Qwerty' })).toBeInTheDocument();
    expect(screen.getByText(/of [0-9]+ layouts, without the saved ones\./)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('layerbench:session') ?? '{}').state).toMatchObject({
      hideSaved: true,
    });

    await user.click(saved);
    expect(screen.getByRole('button', { name: 'Duplicate Mine' })).toBeInTheDocument();
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

    await user.selectOptions(corpus, 'pt-br-conv');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rule set' }), 'cyanophage');
    await waitFor(() => expect(currentSearch()).toContain('rules=cyanophage'));
    expect(currentSearch()).toContain('corpus=pt-br-conv');
    expect(currentSearch()).not.toContain('layout=');

    const card = document.querySelector('article') as HTMLElement;
    const analyze = within(card).getByRole('link', { name: 'Analyze' }) as HTMLAnchorElement;
    expect(analyze.href).toContain('corpus=pt-br-conv');
    expect(analyze.href).toContain('rules=cyanophage');
  });
});

describe('Choosing which special features a ranking counts', () => {
  it('ranks without the features left unticked, and hands that to Analyze', async () => {
    const user = userEvent.setup();
    const { currentSearch } = renderRoute(LIBRARY, { storage: freshStorage() });
    await openRanking();
    const macros = await screen.findByRole('checkbox', { name: 'Multi-letter macros' });
    for (const name of ['Magic keys', 'Repeat key', 'Typing combos']) {
      expect(screen.getByRole('checkbox', { name })).toBeChecked();
    }
    expect(macros).toBeChecked();

    await user.click(macros);
    await waitFor(() => expect(currentSearch()).toContain('off=macros'));
    expect(macros).not.toBeChecked();
    const card = screen.getByText('Magic Romak', { selector: 'h3' }).closest('article');
    const analyze = within(card as HTMLElement).getByRole('link', { name: 'Analyze' });
    expect((analyze as HTMLAnchorElement).href).toContain('off=macros');

    await user.click(macros);
    await waitFor(() => expect(currentSearch()).not.toContain('off='));
  });
});

describe('Layers on a card', () => {
  const layered = [...BUNDLED_LAYOUTS].sort((a, b) => b.layers.length - a.layers.length)[0];

  it('lays every layer of a layout side by side, with its name', async () => {
    renderRoute(LIBRARY, { storage: freshStorage() });
    const strip = await screen.findByRole('region', { name: `${layered.name} layers` });
    const figures = within(strip).getAllByRole('figure');
    expect(figures).toHaveLength(layered.layers.length);
    for (const [i, layer] of layered.layers.entries()) {
      expect(within(figures[i]).getByText(layer.name ?? layer.id)).toBeTruthy();
    }
    const card = strip.closest('article') as HTMLElement;
    expect(within(card).getByText(`1 / ${layered.layers.length}`)).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Previous layer' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('draws the layers of a saved layout too, once it is read', async () => {
    const storage = freshStorage();
    const copy = { ...layered, id: 'layered-copy', name: `${layered.name} copy` };
    await storage.put('layouts', copy.id, toCanonicalJson(copy), { message: 'seed' });
    renderRoute(LIBRARY, { storage });
    const strip = await screen.findByRole('region', { name: `${layered.name} copy layers` });
    expect(within(strip).getAllByRole('figure')).toHaveLength(layered.layers.length);
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

    await waitFor(async () => expect(await savedInLink(currentSearch())).toBe('humming'));
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

  it('says what is wrong with a file it cannot read', async () => {
    const user = userEvent.setup();
    renderRoute(LIBRARY, { storage: freshStorage() });
    await openKeymapImport();
    await user.click(await screen.findByLabelText('keymap-drawer YAML'));
    await user.paste('layers: [a, b');
    expect(await screen.findByText(/line 1: unclosed \[/)).toBeInTheDocument();
  });
});
