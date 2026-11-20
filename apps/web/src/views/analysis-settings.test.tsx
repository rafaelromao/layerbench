import { type AnalysisSettings, forRanking } from '@layerbench/core';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { RecordingClient } from '../test/recording-client.js';
import { renderRoute } from '../test/render.js';
import { parseParams, type RawSearch, settingsOf } from '../url/params.js';

let counter = 0;

function freshStorage(): IndexedDbAdapter {
  return new IndexedDbAdapter(`layerbench-settings-${++counter}`);
}

/** Every choice an analysis is made with, none at its default. */
const LINK =
  'corpus=en-general&corpus2=pt-br-general&mix=70&rules=cyanophage&case=model&text=num' +
  '&space=1&sample=300000&off=combos';

/** The settings each analysis a view asks for is made on, once it has asked for `count`. */
async function settingsAsked(path: string, count = 1): Promise<AnalysisSettings[]> {
  const client = new RecordingClient();
  renderRoute(path, { client, storage: freshStorage() });
  await waitFor(() => expect(client.analyses.length).toBeGreaterThanOrEqual(count), {
    timeout: 10_000,
  });
  const asked = client.analyses.map((r) => r.settings);
  cleanup();
  return asked;
}

describe('One link, the same analysis settings in every view', () => {
  it('Analyze, both sides of Compare, and the Library with its sample capped', async () => {
    const [analyze] = await settingsAsked(`/analyze?layout=qwerty&${LINK}`);
    const [a, b] = await settingsAsked(`/compare?layout=qwerty&b=colemak&${LINK}`, 2);
    const [library] = await settingsAsked(`/library?${LINK}`);

    expect(analyze).toMatchObject({
      corpus: 'en-general',
      corpus2: 'pt-br-general',
      share: 70,
      caseMode: 'model',
      textClass: 'letters+digits',
      sample: 300_000,
      without: ['combos'],
      universe: 'with_space',
    });
    expect(analyze.rules.name).toMatch(/cyanophage/i);
    expect(a).toEqual(analyze);
    expect(b).toEqual(analyze);
    expect(library).toEqual({ ...analyze, sample: 100_000 });
  }, 60_000);

  it("opens a Library card in Analyze on what the card was ranked on, the sample's cap included", async () => {
    renderRoute(`/library?${LINK}`, { storage: freshStorage(), client: new RecordingClient() });
    // A card's link opens its layout in Analyze.
    const card = await waitFor(() => {
      const links = screen.getAllByRole('link', { name: /^Analyze / }) as HTMLAnchorElement[];
      const found = links.find((l) => new URL(l.href).searchParams.has('layout'));
      if (!found) throw new Error('no card yet');
      return found;
    });
    const search = Object.fromEntries(new URL(card.href).searchParams) as RawSearch;
    const ranked = forRanking(
      settingsOf(parseParams(Object.fromEntries(new URLSearchParams(LINK)))),
    );
    expect(settingsOf(parseParams(search))).toEqual(ranked);
  }, 30_000);

  it('explains a word on the settings the numbers are made on', async () => {
    const user = userEvent.setup();
    const client = new RecordingClient(undefined, true);
    renderRoute(`/analyze?layout=magic-romak&corpus=pt-br-general&sample=20000&off=macros`, {
      client,
      storage: freshStorage(),
    });
    await screen.findByText('Same finger bigrams', undefined, { timeout: 25_000 });
    await user.type(screen.getByLabelText('How is this typed?'), 'ação');
    await waitFor(() => expect(client.explained.at(-1)?.text).toBe('ação'));
    expect(client.explained.at(-1)?.settings).toEqual(client.analyses.at(-1)?.settings);
    expect(client.explained.at(-1)?.settings.without).toEqual(['macros']);
  }, 60_000);
});

describe('A mix, set and taken off where the settings are', () => {
  it.each([
    ['Compare', '/compare?layout=qwerty&b=colemak&corpus=en-general', 'Settings'],
    ['the Library', '/library?corpus=en-general', 'Rank and filter'],
  ])(
    'in %s',
    async (_, path, button) => {
      const user = userEvent.setup();
      const client = new RecordingClient();
      const { currentSearch } = renderRoute(path, { client, storage: freshStorage() });
      await user.click(await screen.findByRole('button', { name: button }));
      const mixWith = await screen.findByRole('combobox', { name: 'Mix with' });
      await waitFor(() => expect(within(mixWith).getAllByRole('option').length).toBeGreaterThan(1));

      await user.selectOptions(mixWith, 'pt-br-general');
      await waitFor(() => expect(currentSearch()).toContain('corpus2=pt-br-general'));
      await waitFor(() => expect(client.analyses.at(-1)?.settings.corpus2).toBe('pt-br-general'), {
        timeout: 10_000,
      });

      await user.selectOptions(screen.getByRole('combobox', { name: 'Mix with' }), '');
      await waitFor(() => expect(currentSearch()).not.toContain('corpus2'));
      await waitFor(() => expect(client.analyses.at(-1)?.settings.corpus2).toBeNull(), {
        timeout: 10_000,
      });
    },
    30_000,
  );
});

describe('A language chip, switching the whole page to the text of its language', () => {
  /** A mix of English and Spanish: no one language's text is on show. */
  const MIXED = 'corpus=en-general&corpus2=es-general&mix=70&sample=20000';
  /** Where each view shows Magic Romak's chips: its card, its Summary, its side. */
  const card = async () =>
    (await screen.findByRole('heading', { name: 'Magic Romak', level: 3 })).closest(
      'article',
    ) as HTMLElement;
  const summary = () => screen.findByRole('region', { name: 'Summary' });
  const side = async () =>
    (await screen.findByRole('heading', { name: 'A: Magic Romak', level: 2 })).closest(
      'section',
    ) as HTMLElement;

  it.each([
    ['the Library', `/library?${MIXED}`, card],
    ['Analyze', `/analyze?layout=magic-romak&${MIXED}`, summary],
    ['Compare', `/compare?layout=magic-romak&b=qwerty&${MIXED}`, side],
  ])(
    'in %s',
    async (_, path, scope) => {
      const user = userEvent.setup();
      const client = new RecordingClient();
      const { currentSearch } = renderRoute(path, { client, storage: freshStorage() });
      // Magic Romak is for English and Portuguese, a chip each, neither on show in a mix.
      const pt = await within(await scope()).findByRole('button', { name: /Português/ });
      expect(pt).toHaveAttribute('aria-pressed', 'false');
      expect(within(await scope()).getByRole('button', { name: /English/ })).toHaveAttribute(
        'aria-pressed',
        'false',
      );

      // Portuguese's own text, the one that comes with LayerBench, in place of the mix.
      await user.click(pt);
      await waitFor(() => {
        const search = new URLSearchParams(currentSearch());
        expect(search.get('corpus')).toBe('pt-br-general');
        expect(search.has('corpus2')).toBe(false);
        expect(search.has('mix')).toBe(false);
      });
      // For the whole page: what it analyzes next is on that text.
      await waitFor(
        () =>
          expect(client.analyses.at(-1)?.settings).toMatchObject({
            corpus: 'pt-br-general',
            corpus2: null,
          }),
        { timeout: 10_000 },
      );
      expect(within(await scope()).getByRole('button', { name: /Português/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      await user.click(within(await scope()).getByRole('button', { name: /English/ }));
      await waitFor(() =>
        expect(new URLSearchParams(currentSearch()).get('corpus')).toBe('en-general'),
      );
      expect(within(await scope()).getByRole('button', { name: /English/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    },
    60_000,
  );

  it.each([
    ['Analyze', '/analyze?layout=magic-romak&corpus=en-general&sample=1000', summary],
    ['Compare', '/compare?layout=magic-romak&b=qwerty&corpus=en-general&sample=1000', side],
  ])(
    'in %s, the chips sit in the Summary, above its metrics',
    async (name, path, scope) => {
      renderRoute(path, { storage: freshStorage() });
      const where = within(await scope());
      const chips = await where.findByRole('group', { name: 'Languages it is for' });
      const follows = (a: Element, b: Element) =>
        Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (name === 'Compare') {
        // Each side is its name, its board, then the chips and the numbers.
        const board = (await scope()).querySelector('#kb-A') as Element;
        expect(follows(board, chips)).toBe(true);
      }
      const metrics = await where.findByRole(
        'list',
        { name: 'Summary metrics' },
        { timeout: 25_000 },
      );
      expect(follows(chips, metrics)).toBe(true);
      expect(within(chips).getByRole('button', { name: /English/ })).toBeInTheDocument();
      if (name === 'Analyze') {
        // The bar holds what the layout is called and how it is saved, no longer its languages.
        const bar = await screen.findByRole('region', { name: 'Layout' });
        expect(within(bar).queryByRole('button', { name: /Português/ })).toBeNull();
      }
    },
    60_000,
  );
});
