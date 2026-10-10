import { type AnalysisSettings, forRanking } from '@layerbench/core';
import { cleanup, screen, waitFor } from '@testing-library/react';
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
    // A card's link names its layout; the header's does not.
    const card = await waitFor(() => {
      const links = screen.getAllByRole('link', { name: 'Analyze' }) as HTMLAnchorElement[];
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
