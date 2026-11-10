import { BUNDLED_EFFORTS, bundledLayout, type Layout, toCanonicalJson } from '@layerbench/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '../storage/indexeddb.js';
import { openSettings, renderRoute, testClient } from '../test/render.js';

let counter = 0;
const freshStorage = () => new IndexedDbAdapter(`layerbench-languages-${++counter}`);

/** The bar above the board, where a layout shows it is unsaved. */
const bar = () => screen.getByRole('region', { name: 'Layout' });

/** Open Analyze on a layout, and wait for its first analysis. */
async function openOn(path: string, storage = freshStorage()) {
  const view = renderRoute(path, { storage });
  await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
  return view;
}

const measure = async (settings: HTMLElement) => {
  const user = userEvent.setup();
  await user.click(within(settings).getByRole('button', { name: 'Measure languages' }));
  return within(settings).findByRole('status', {}, { timeout: 60_000 });
};

const language = (settings: HTMLElement, name: string) =>
  within(settings).getByRole('checkbox', { name });

describe('Measure languages, in the Settings of the editor', () => {
  it('adds the languages a bundled layout performs well in, and Undo takes them back', async () => {
    const user = userEvent.setup();
    await openOn('/analyze?layout=snth&corpus=en-general&sample=20000');
    const settings = await openSettings();
    expect(language(settings, 'English')).not.toBeChecked();

    const found = await measure(settings);
    expect(found).toHaveTextContent('Added English. Undo takes it back.');
    expect(found).toHaveTextContent(
      new RegExp(
        `English: added, its Effort \\d+\\.\\d\\d is beaten by \\d+ of ${BUNDLED_EFFORTS.en.length} bundled`,
      ),
    );
    // It types no Portuguese accent, and says which it lacks.
    expect(found).toHaveTextContent(/Português: not added, it does not type á/);
    expect(language(settings, 'English')).toBeChecked();
    expect(language(settings, 'Português')).not.toBeChecked();
    expect(within(bar()).getByText('unsaved')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(language(settings, 'English')).not.toBeChecked();
    expect(within(settings).queryByRole('status')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(language(settings, 'English')).toBeChecked();
    expect(await within(settings).findByRole('status')).toHaveTextContent('Added English.');
  }, 120_000);

  it('adds nothing, and says why, for a layout that does not perform well', async () => {
    await openOn('/analyze?layout=qwerty&corpus=en-general&sample=20000');
    const settings = await openSettings();
    // Qwerty is the layout with the highest Effort on English: every other bundled layout beats it.
    const worst = (BUNDLED_EFFORTS.en.at(-1) as number).toFixed(2);

    const found = await measure(settings);
    expect(found).toHaveTextContent('No language to add.');
    expect(found).toHaveTextContent(
      new RegExp(
        `English: not added, its Effort ${worst} is beaten by ${BUNDLED_EFFORTS.en.length - 1} of ${BUNDLED_EFFORTS.en.length} bundled layouts, and fewer than half may beat it`,
      ),
    );
    expect(language(settings, 'English')).not.toBeChecked();
    // Nothing changed: nothing to save, nothing to undo.
    expect(within(bar()).queryByText('unsaved')).toBeNull();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  }, 120_000);

  it('says what it found, though it adds nothing, for languages kept as they were written', async () => {
    const storage = freshStorage();
    const layout = {
      ...(bundledLayout('qwerty') as Layout),
      id: 'my-qwerty',
      name: 'My qwerty',
      languages: ['pt', 'en', 'en'],
    };
    await storage.put('layouts', 'my-qwerty', toCanonicalJson(layout), { message: 'seed' });
    await openOn('/analyze?layout=custom%3Amy-qwerty&corpus=en-general&sample=20000', storage);
    const settings = await openSettings();

    expect(await measure(settings)).toHaveTextContent('No language to add.');
    expect(within(settings).getByText(/Español: not added, it does not type ñ/)).toBeVisible();
    expect(within(bar()).queryByText('unsaved')).toBeNull();
  }, 120_000);

  it('stops saying what it found once the layout is changed', async () => {
    const user = userEvent.setup();
    await openOn('/analyze?layout=qwerty&corpus=en-general&sample=20000');
    const settings = await openSettings();
    await measure(settings);

    // The Effort and the letters it names are of the layout as it was measured.
    await user.type(within(settings).getByLabelText('Author'), 'Ana');
    await user.tab();
    expect(within(settings).queryByRole('status')).toBeNull();
  }, 120_000);

  it('works on a custom layout, and keeps the languages it had', async () => {
    const storage = freshStorage();
    const layout = {
      ...(bundledLayout('snth') as Layout),
      id: 'my-snth',
      name: 'My snth',
      languages: ['xx'],
    };
    await storage.put('layouts', 'my-snth', toCanonicalJson(layout), { message: 'seed' });
    await openOn('/analyze?layout=custom%3Amy-snth&corpus=en-general&sample=20000', storage);
    const settings = await openSettings();

    expect(await measure(settings)).toHaveTextContent('Added English.');
    expect(language(settings, 'English')).toBeChecked();
    expect(within(bar()).getByText('unsaved')).toBeInTheDocument();
    // A tag the editor has no profile for stays.
    await userEvent.click(within(bar()).getByRole('button', { name: 'Save' }));
    await waitFor(async () =>
      expect((await storage.get('layouts', 'my-snth'))?.doc.languages).toEqual(['en', 'xx']),
    );
  }, 120_000);

  it('says so when the measurement fails, and leaves the languages as they were', async () => {
    const client = testClient();
    const analyze = client.analyze.bind(client);
    // The editor's own analysis is of 20,000 symbols; the measurement's is the Library's 100,000.
    client.analyze = async (request, opts) => {
      if (request.settings.sample === 100_000) throw new Error('The corpus could not be read');
      return analyze(request, opts);
    };
    renderRoute('/analyze?layout=snth&corpus=en-general&sample=20000', { client });
    await screen.findByRole('list', { name: 'Summary metrics' }, { timeout: 25_000 });
    const settings = await openSettings();
    const user = userEvent.setup();

    await user.click(within(settings).getByRole('button', { name: 'Measure languages' }));
    expect(await within(settings).findByRole('alert')).toHaveTextContent(
      'The corpus could not be read',
    );
    expect(language(settings, 'English')).not.toBeChecked();
    expect(within(settings).getByRole('button', { name: 'Measure languages' })).toBeEnabled();
  }, 120_000);
});
