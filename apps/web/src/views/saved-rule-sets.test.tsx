import { getPreset, type StorageAdapter } from '@layerbench/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../test/memory-storage.js';
import { RecordingClient } from '../test/recording-client.js';
import { openSettings, rankingSays, renderRoute } from '../test/render.js';

/** Storage holding one saved rule set, Strict, under the id `strict`. */
async function withStrict(): Promise<MemoryStorage> {
  const storage = new MemoryStorage();
  await storage.put('rulesets', 'strict', { ...getPreset('keysolve'), name: 'Strict' });
  return storage;
}

/** Hold back every read of a saved rule set until `release` is called. */
function holdRuleSets(storage: StorageAdapter): { release: () => void } {
  const get = storage.get.bind(storage);
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  storage.get = async (collection, id) => {
    if (collection === 'rulesets') await held;
    return get(collection, id);
  };
  return { release };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('A saved rule set named by a link', () => {
  it('is waited for in Analyze: nothing is analyzed on other rules while it is read', async () => {
    const storage = await withStrict();
    const { release } = holdRuleSets(storage);
    const client = new RecordingClient();
    renderRoute('/analyze?layout=qwerty&rules=saved:strict', { client, storage });

    expect(await screen.findByRole('status', { name: 'Analyzing' })).toBeInTheDocument();
    await pause(300);
    expect(client.analyses).toHaveLength(0);

    release();
    await waitFor(() => expect(client.analyses.length).toBeGreaterThan(0));
    expect(client.analyses.every((r) => r.settings.rules.name === 'Strict')).toBe(true);
  });

  it('is waited for by the Library, which neither scores nor remembers a ranking until then', async () => {
    const storage = await withStrict();
    const { release } = holdRuleSets(storage);
    const client = new RecordingClient();
    renderRoute('/library?sample=1000&rules=saved:strict', { client, storage });

    await rankingSays(/once the rule set strict is read/);
    // Longer than the Library lets the page settle before it scores.
    await pause(1200);
    expect(client.analyses).toHaveLength(0);
    const remembered = JSON.parse(localStorage.getItem('layerbench:ranking') ?? '{}');
    for (const [context, ranking] of Object.entries<{ summaries: object }>(remembered)) {
      if (context.includes('saved:strict')) expect(ranking.summaries).toEqual({});
    }

    release();
    await waitFor(() => expect(client.analyses.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(client.analyses.every((r) => r.settings.rules.name === 'Strict')).toBe(true);
  });

  it('that is not saved here is said so in Analyze, and nothing is analyzed', async () => {
    const client = new RecordingClient();
    renderRoute('/analyze?layout=qwerty&rules=saved:gone', {
      client,
      storage: new MemoryStorage(),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not analyze: rule set gone is not saved here',
    );
    expect(client.analyses).toHaveLength(0);
    const picker = within(await openSettings()).getByRole('combobox', { name: 'Rule set' });
    expect(picker).toHaveDisplayValue('gone (not saved here)');
  });

  it('that is not saved here is said so in Compare and the Library', async () => {
    const compare = renderRoute('/compare?layout=qwerty&b=colemak&rules=saved:gone', {
      client: new RecordingClient(),
      storage: new MemoryStorage(),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('rule set gone is not saved here');
    compare.unmount();

    renderRoute('/library?sample=1000&rules=saved:gone', {
      client: new RecordingClient(),
      storage: new MemoryStorage(),
    });
    await rankingSays(/Could not score the layouts: rule set gone is not saved here/);
  });

  it('is offered by name in every picker, beside the presets', async () => {
    renderRoute('/analyze?layout=qwerty', {
      client: new RecordingClient(),
      storage: await withStrict(),
    });
    const picker = within(await openSettings()).getByRole('combobox', { name: 'Rule set' });
    const saved = within(picker).getByRole('group', { name: 'Saved' });
    expect(await within(saved).findByRole('option', { name: 'Strict' })).toHaveValue(
      'saved:strict',
    );
  });
});

describe('The Rules page', () => {
  it('shows why a saved set will not open, with nothing to edit or save', async () => {
    renderRoute('/rules?rules=saved:gone', { storage: new MemoryStorage() });

    expect(await screen.findByRole('alert')).toHaveTextContent('rule set gone is not saved here');
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByText('Same finger bigrams')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Rule set' })).toHaveDisplayValue(
      'gone (not saved here)',
    );
  });

  it('keeps showing what it saved while the saved set is read back', async () => {
    const user = userEvent.setup();
    const storage = new MemoryStorage();
    const { currentSearch } = renderRoute('/rules', { storage });
    await screen.findByText('Same finger bigrams');

    const sfb = screen.getByLabelText('Enable Same finger bigrams');
    await user.click(sfb);
    expect(sfb).not.toBeChecked();
    const { release } = holdRuleSets(storage);
    const name = screen.getByLabelText('Rule set name');
    await user.clear(name);
    await user.type(name, 'Mine');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Saved rule set mine')).toBeInTheDocument();
    await waitFor(() => expect(currentSearch()).toContain('rules=saved%3Amine'));
    expect(screen.getByLabelText('Enable Same finger bigrams')).not.toBeChecked();
    // An edit after saving is not lost to the saved set when it is read back.
    await user.click(screen.getByLabelText('Enable SFB distance'));
    release();
    await pause(50);
    expect(screen.getByLabelText('Enable Same finger bigrams')).not.toBeChecked();
    expect(screen.getByLabelText('Enable SFB distance')).not.toBeChecked();
    expect(screen.getByText('unsaved changes')).toBeInTheDocument();
  });

  it('opens a saved set as it was last saved, after another set was looked at', async () => {
    const user = userEvent.setup();
    const storage = await withStrict();
    renderRoute('/rules?rules=saved:strict', { storage });
    await screen.findByText('Same finger bigrams');
    expect(screen.getByLabelText('Enable Same finger bigrams')).toBeChecked();

    await user.click(screen.getByLabelText('Enable Same finger bigrams'));
    const name = screen.getByLabelText('Rule set name');
    await user.clear(name);
    await user.type(name, 'Strict');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved rule set strict')).toBeInTheDocument();

    const picker = screen.getByRole('combobox', { name: 'Rule set' });
    await user.selectOptions(picker, 'cyanophage');
    await waitFor(() => expect(screen.getByLabelText('Enable Same finger bigrams')).toBeChecked());
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rule set' }), 'saved:strict');
    await pause(50);
    expect(screen.getByLabelText('Enable Same finger bigrams')).not.toBeChecked();
  });
});
